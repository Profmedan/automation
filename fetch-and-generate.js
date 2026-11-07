#!/usr/bin/env node

/**
 * Récupère le dernier article Google Drive et génère une vidéo LinkedIn
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const { generateLinkedInVideo } = require('./generate-video');
const { notifyApproval } = require('./notify-approval');

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(__dirname, '..');
const PENDING_ARTICLES_DIR = process.env.PENDING_ARTICLES_DIR || path.join(WORKSPACE_ROOT, 'pending-articles');
const BLOGGER_TOKEN_PATH = process.env.BLOGGER_TOKEN_PATH || path.join(WORKSPACE_ROOT, 'blogger-automation', 'token.json');

function extractDriveIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function loadArticleContext(articleId) {
  const articleDir = path.join(PENDING_ARTICLES_DIR, articleId);
  const statusPath = path.join(articleDir, 'status.json');
  const summaryPath = path.join(articleDir, 'summary.json');

  let status;
  try {
    status = JSON.parse(await fs.readFile(statusPath, 'utf-8'));
  } catch (error) {
    throw new Error(`Impossible de lire ${statusPath}: ${error.message}`);
  }

  let summary = {};
  try {
    summary = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));
  } catch (_) {
    // résumé optionnel
  }

  const driveUrl = status.drive_url || status.driveUrl || null;
  const driveId = status.drive_id || status.driveId || extractDriveIdFromUrl(driveUrl);

  if (!driveId) {
    throw new Error(`Impossible de déterminer l'ID Google Docs pour l'article ${articleId}.`);
  }

  return {
    articleId,
    driveId,
    driveUrl,
    blogUrl: status.blog_url || status.blogUrl || null,
    title: summary.title || null
  };
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--article':
      case '--article-id':
        options.articleId = args[i + 1];
        i += 1;
        break;
      case '--drive-id':
        options.driveId = args[i + 1];
        i += 1;
        break;
      case '--drive-url':
        options.driveUrl = args[i + 1];
        i += 1;
        break;
      default:
        // Ignorer les autres arguments pour compat héritée
        break;
    }
  }

  return options;
}

/**
 * Initialise le client OAuth2 avec les credentials Blogger
 */
async function initGoogleClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.BLOGGER_CLIENT_ID,
    process.env.BLOGGER_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback'
  );
  
  // Charger le token Blogger
  const token = JSON.parse(await fs.readFile(BLOGGER_TOKEN_PATH, 'utf-8'));
  oauth2Client.setCredentials(token);
  
  return oauth2Client;
}

/**
 * Récupère un document Google Docs précis (ou fallback sur le dernier)
 */
async function fetchDriveArticle(target = {}) {
  console.log('📂 Connexion à Google Drive...');
  
  const auth = await initGoogleClient();
  const drive = google.drive({ version: 'v3', auth });
  
  let fileMeta = null;
  const explicitDriveId = target.driveId || extractDriveIdFromUrl(target.driveUrl);
  
  if (explicitDriveId) {
    console.log(`🎯 Lecture du document Drive ID=${explicitDriveId}`);
    fileMeta = await drive.files.get({
      fileId: explicitDriveId,
      fields: 'id, name, createdTime, webViewLink'
    });
  } else {
    console.log('⚠️  Aucun ID fourni, fallback sur le dernier doc du dossier automation');
    const folderResponse = await drive.files.list({
      q: "name='automation' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
      spaces: 'drive'
    });
    
    if (folderResponse.data.files.length === 0) {
      throw new Error('Dossier "automation" introuvable sur Google Drive');
    }
    
    const folderId = folderResponse.data.files[0].id;
    console.log(`✅ Dossier trouvé: ${folderId}`);
    
    const filesResponse = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
      orderBy: 'createdTime desc',
      pageSize: 1,
      fields: 'files(id, name, createdTime, webViewLink)'
    });
    
    if (filesResponse.data.files.length === 0) {
      throw new Error('Aucun document trouvé dans le dossier "automation"');
    }
    fileMeta = { data: filesResponse.data.files[0] };
  }
  
  const docId = fileMeta.data.id;
  console.log(`📄 Document: ${fileMeta.data.name}`);
  console.log(`🕒 Créé le: ${fileMeta.data.createdTime}`);
  console.log(`🔗 URL: ${fileMeta.data.webViewLink}`);
  
  const contentResponse = await drive.files.export({
    fileId: docId,
    mimeType: 'text/plain'
  });
  
  const content = contentResponse.data;
  const lines = content.split('\n').filter(line => line.trim());
  const title = lines[0];
  const body = lines.slice(2).join('\n').trim();
  
  console.log(`✅ Contenu extrait (${body.length} caractères)`);
  
  return {
    title: title.trim(),
    content: body,
    url: fileMeta.data.webViewLink,
    driveId: docId,
    createdAt: fileMeta.data.createdTime
  };
}

/**
 * Main : Récupère l'article et génère la vidéo
 */
async function main() {
  console.log('🚀 Génération vidéo LinkedIn depuis Google Drive\n');
  
  try {
    const cliOptions = parseCliArgs();
    let context = {};

    if (cliOptions.articleId) {
      context = await loadArticleContext(cliOptions.articleId);
      console.log(`🎯 Article ciblé: ${cliOptions.articleId}`);
    } else if (cliOptions.driveId || cliOptions.driveUrl) {
      context = {
        articleId: null,
        driveId: cliOptions.driveId || null,
        driveUrl: cliOptions.driveUrl || null,
        blogUrl: null
      };
      console.log('🎯 Mode direct via Drive (sans articleId)');
    } else {
      console.log('⚠️  Aucun argument fourni — fallback sur le dernier document (comportement legacy)');
    }
    
    // Étape 1: Récupérer l'article Drive ciblé
    const article = await fetchDriveArticle(context);
    article.id = context.articleId || null;
    article.url = context.blogUrl || article.url;
    
    console.log('\n' + '='.repeat(60));
    console.log('📝 ARTICLE RÉCUPÉRÉ');
    console.log('='.repeat(60));
    console.log(`Titre: ${article.title}`);
    console.log(`URL: ${article.url}`);
    console.log(`Drive ID: ${article.driveId}`);
    console.log(`Créé: ${article.createdAt}`);
    console.log('='.repeat(60) + '\n');
    
    // Étape 2: Générer la vidéo
    const result = await generateLinkedInVideo(article);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ VIDÉO GÉNÉRÉE AVEC SUCCÈS');
    console.log('='.repeat(60));
    console.log(`📁 Dossier: ${result.folder}`);
    console.log(`🎥 Vidéo: ${result.videoPath}`);
    console.log(`📝 Métadonnées: ${path.join(result.folder, 'metadata.json')}`);
    console.log('='.repeat(60));
    
    // Sauvegarder l'info de l'article source
    await fs.writeFile(
      path.join(result.folder, 'source.json'),
      JSON.stringify({
        driveUrl: article.url,
        driveId: article.driveId,
        title: article.title,
        createdAt: article.createdAt,
        videoGeneratedAt: new Date().toISOString()
      }, null, 2)
    );
    
    // Créer la notification d'approbation
    console.log('\n📤 Préparation notification approbation...');
    const notification = await notifyApproval(result.folder);
    
    console.log('\n🎉 Terminé ! La vidéo est prête à être approuvée.');
    console.log('\n📋 NOTIFICATION À ENVOYER VIA TELEGRAM:');
    console.log('━'.repeat(60));
    console.log(notification.message);
    console.log('━'.repeat(60));
    
    return {
      ...result,
      notification
    };
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Exécution
if (require.main === module) {
  main().catch(err => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { fetchDriveArticle, main };
