const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const PAGE_TOKEN = process.env.FACEBOOK_PAGE_TOKEN;
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v19.0';

function ensureFacebookConfig() {
  if (!PAGE_ID || !PAGE_TOKEN) {
    throw new Error('FACEBOOK_PAGE_ID et FACEBOOK_PAGE_TOKEN doivent être définis dans l\'environnement');
  }
}

function buildFacebookCaption(metadata = {}) {
  if (metadata.caption && metadata.caption.trim()) {
    return metadata.caption.trim();
  }
  if (metadata.title && metadata.title.trim()) {
    return metadata.title.trim();
  }
  return 'Nouvelle vidéo';
}

async function publishFacebookVideo(videoPath, metadata = {}) {
  ensureFacebookConfig();

  const absoluteVideoPath = path.resolve(videoPath);
  const stats = await fs.promises.stat(absoluteVideoPath);
  if (!stats.isFile()) {
    throw new Error(`Fichier vidéo introuvable: ${absoluteVideoPath}`);
  }

  const form = new FormData();
  form.append('description', buildFacebookCaption(metadata));
  if (metadata.title) {
    form.append('title', metadata.title);
  }
  form.append('published', 'true');
  form.append('source', fs.createReadStream(absoluteVideoPath));

  const response = await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/videos`,
    form,
    {
      params: { access_token: PAGE_TOKEN },
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );

  const videoId = response.data?.id;
  if (!videoId) {
    throw new Error('Réponse Facebook inattendue: identifiant manquant');
  }

  return {
    id: videoId,
    postUrl: `https://www.facebook.com/${PAGE_ID}/videos/${videoId}/`
  };
}

module.exports = {
  publishFacebookVideo
};
