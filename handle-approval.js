#!/usr/bin/env node

/**
 * Gère les commandes d'approbation vidéo LinkedIn
 */

const fs = require('fs').promises;
const path = require('path');
const { uploadVideoToDrive } = require('./scripts/drive-utils');
const { publishFacebookVideo } = require('./scripts/facebook-publisher');

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(__dirname, '..');
const VIDEO_OUTPUT_PATH = process.env.VIDEO_OUTPUT_PATH || 
  path.join(WORKSPACE_ROOT, 'linkedin-videos');
const PENDING_ARTICLES_DIR = process.env.PENDING_ARTICLES_DIR || 
  path.join(WORKSPACE_ROOT, 'pending-articles');

/**
 * Parse une commande d'approbation
 */
function parseCommand(input) {
  // approuve <id>
  const approveMatch = input.match(/^approuve\s+([^\s]+)$/i);
  if (approveMatch) {
    return { action: 'approve', videoId: approveMatch[1] };
  }
  
  // modifie <id> légende: <texte>
  const modifyMatch = input.match(/^modifie\s+([^\s]+)\s+légende:\s*(.+)$/is);
  if (modifyMatch) {
    return { 
      action: 'modify', 
      videoId: modifyMatch[1],
      newCaption: modifyMatch[2].trim()
    };
  }
  
  // rejette <id>
  const rejectMatch = input.match(/^rejette\s+([^\s]+)$/i);
  if (rejectMatch) {
    return { action: 'reject', videoId: rejectMatch[1] };
  }
  
  return null;
}

/**
 * Récupère le chemin d'un dossier vidéo
 */
function getVideoFolder(videoId) {
  return path.join(VIDEO_OUTPUT_PATH, videoId);
}

/**
 * Lit le statut actuel
 */
async function readStatus(videoFolder) {
  const statusPath = path.join(videoFolder, 'status.json');
  return JSON.parse(await fs.readFile(statusPath, 'utf-8'));
}

/**
 * Met à jour le statut
 */
async function updateStatus(videoFolder, updates) {
  const statusPath = path.join(videoFolder, 'status.json');
  const status = await readStatus(videoFolder);
  
  Object.assign(status, updates);
  
  await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
  return status;
}

/**
 * Approuve et publie la vidéo
 */
async function approveVideo(videoId) {
  const videoFolder = getVideoFolder(videoId);
  const videoPath = path.join(videoFolder, 'video.mp4');

  try {
    await fs.access(videoFolder);
  } catch {
    return {
      success: false,
      error: `Vidéo ${videoId} introuvable`
    };
  }

  const metadataPath = path.join(videoFolder, 'metadata.json');
  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
  } catch {
    return {
      success: false,
      error: `Métadonnées manquantes pour la vidéo ${videoId}`
    };
  }

  let scriptData = null;
  try {
    scriptData = JSON.parse(await fs.readFile(path.join(videoFolder, 'script.json'), 'utf-8'));
  } catch {
    scriptData = null;
  }

  const status = await readStatus(videoFolder);
  if (status.status !== 'pending_approval' && status.status !== 'approved') {
    return {
      success: false,
      error: `Vidéo déjà ${status.status}`
    };
  }

  await updateStatus(videoFolder, {
    status: 'approved',
    approved_at: new Date().toISOString()
  });

  let hasVideoFile = true;
  try {
    await fs.access(videoPath);
  } catch {
    hasVideoFile = false;
    console.warn('⚠️  Vidéo MP4 introuvable pour', videoId);
  }

  let driveUrls = null;
  if (hasVideoFile) {
    try {
      console.log('📤 Upload sur Drive (post-approbation)...');
      driveUrls = await uploadVideoToDrive(videoPath, {
        title: metadata.title,
        duration: scriptData?.duration,
        scenes: scriptData?.scenes,
        keyPoints: scriptData?.keyPoints,
        hashtags: metadata.hashtags || scriptData?.hashtags,
        caption: metadata.caption,
        articleUrl: metadata.articleUrl || metadata.blogUrl
      });
      await fs.writeFile(
        path.join(videoFolder, 'drive-links.json'),
        JSON.stringify(driveUrls, null, 2)
      );
      await updateStatus(videoFolder, {
        drive_urls: driveUrls,
        drive_uploaded_at: new Date().toISOString()
      });
    } catch (driveErr) {
      console.error('⚠️  Upload Drive après approbation échoué:', driveErr.message);
    }
  } else {
    console.warn('⚠️  Upload Drive ignoré (pas de vidéo MP4)');
  }

  const shouldPublishFacebook = Boolean(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_TOKEN);
  let facebookResult = null;
  let facebookError = null;

  try {
    console.log('📤 Publication sur LinkedIn...');
    const { publishToLinkedIn: publishVideo } = require('./scripts/linkedin-publisher');

    try {
      const source = JSON.parse(await fs.readFile(path.join(videoFolder, 'source.json'), 'utf-8'));
      if (source.blogUrl) {
        metadata.blogUrl = source.blogUrl;
      } else {
        const dirs = await fs.readdir(PENDING_ARTICLES_DIR);
        for (const dir of dirs) {
          try {
            const pendingStatus = JSON.parse(await fs.readFile(path.join(PENDING_ARTICLES_DIR, dir, 'status.json'), 'utf-8'));
            if (pendingStatus.blog_url && pendingStatus.drive_url === source.driveUrl) {
              metadata.blogUrl = pendingStatus.blog_url;
              break;
            }
          } catch {}
        }
      }
    } catch {}
    console.log(metadata.blogUrl ? `📎 Lien blog: ${metadata.blogUrl}` : '⚠️  Pas de lien blog trouvé');

    let assetPath = videoPath;
    if (!hasVideoFile) {
      assetPath = path.join(videoFolder, 'voiceover.mp3');
      console.log('⚠️  Vidéo MP4 non trouvée, utilisation audio seul');
    }

    const result = await publishVideo(assetPath, metadata);
    const linkedinUrl = result?.postUrl || result;

    if (shouldPublishFacebook) {
      if (!hasVideoFile) {
        facebookError = new Error('Vidéo MP4 introuvable pour upload Facebook');
        console.warn('⚠️  Publication Facebook ignorée (pas de vidéo MP4)');
      } else {
        try {
          console.log('📘 Publication sur Facebook...');
          facebookResult = await publishFacebookVideo(videoPath, {
            title: metadata.title,
            caption: metadata.caption
          });
          console.log('📘 Vidéo publiée sur Facebook:', facebookResult.postUrl);
        } catch (fbErr) {
          facebookError = fbErr;
          console.error('⚠️  Publication Facebook échouée:', fbErr.message);
        }
      }
    }

    const statusUpdates = {
      status: 'published',
      published_at: new Date().toISOString(),
      linkedin_url: linkedinUrl,
      linkedin_post_id: result?.postId || null
    };

    if (shouldPublishFacebook) {
      statusUpdates.facebook_attempted = true;
      if (facebookResult) {
        statusUpdates.facebook_url = facebookResult.postUrl;
        statusUpdates.facebook_post_id = facebookResult.id;
        statusUpdates.facebook_published_at = new Date().toISOString();
        statusUpdates.facebook_error = null;
      } else if (facebookError) {
        statusUpdates.facebook_url = null;
        statusUpdates.facebook_error = facebookError.message;
      }
    } else {
      statusUpdates.facebook_attempted = false;
    }

    await updateStatus(videoFolder, statusUpdates);

    return {
      success: true,
      message: `✅ Vidéo ${videoId} publiée sur LinkedIn !`,
      linkedinUrl,
      driveUrls,
      facebookUrl: facebookResult?.postUrl || null,
      facebookError: facebookError?.message || null,
      videoFolder
    };

  } catch (error) {
    console.error('❌ Erreur publication LinkedIn:', error.message);
    return {
      success: false,
      error: `Approbation OK mais publication LinkedIn échouée: ${error.message}`,
      hint: 'Vérifie que LinkedIn OAuth est configuré (npm run linkedin-auth)',
      videoFolder,
      driveUrls
    };
  }
}

/**
 * Modifie la légende et approuve
 */
async function modifyVideo(videoId, newCaption) {
  const videoFolder = getVideoFolder(videoId);
  
  try {
    await fs.access(videoFolder);
  } catch {
    return { 
      success: false, 
      error: `Vidéo ${videoId} introuvable` 
    };
  }
  
  const status = await readStatus(videoFolder);
  if (status.status !== 'pending_approval') {
    return {
      success: false,
      error: `Vidéo déjà ${status.status}`
    };
  }
  
  // Lire les métadonnées
  const metadataPath = path.join(videoFolder, 'metadata.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
  
  // Sauvegarder l'ancienne légende
  const oldCaption = metadata.caption;
  
  // Mettre à jour
  metadata.caption = newCaption;
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  
  // Logger la modification
  await updateStatus(videoFolder, {
    modifications: [
      ...status.modifications,
      {
        type: 'caption',
        old: oldCaption,
        new: newCaption,
        timestamp: new Date().toISOString()
      }
    ]
  });
  
  return {
    success: true,
    message: `✅ Légende mise à jour pour ${videoId}`,
    oldCaption,
    newCaption,
    instruction: `Tape maintenant: approuve ${videoId}`
  };
}

/**
 * Rejette la vidéo
 */
async function rejectVideo(videoId) {
  const videoFolder = getVideoFolder(videoId);
  
  try {
    await fs.access(videoFolder);
  } catch {
    return { 
      success: false, 
      error: `Vidéo ${videoId} introuvable` 
    };
  }
  
  const status = await readStatus(videoFolder);
  if (status.status !== 'pending_approval') {
    return {
      success: false,
      error: `Vidéo déjà ${status.status}`
    };
  }
  
  await updateStatus(videoFolder, {
    status: 'rejected',
    rejected_at: new Date().toISOString()
  });
  
  return {
    success: true,
    message: `❌ Vidéo ${videoId} rejetée et archivée`
  };
}

/**
 * Exécute une commande
 */
async function handleCommand(commandText) {
  const command = parseCommand(commandText);
  
  if (!command) {
    return {
      success: false,
      error: 'Commande non reconnue. Utilise: approuve <id>, modifie <id> légende: <texte>, ou rejette <id>'
    };
  }
  
  switch (command.action) {
    case 'approve':
      return await approveVideo(command.videoId);
    
    case 'modify':
      return await modifyVideo(command.videoId, command.newCaption);
    
    case 'reject':
      return await rejectVideo(command.videoId);
    
    default:
      return { success: false, error: 'Action inconnue' };
  }
}

// Export
module.exports = { 
  handleCommand, 
  parseCommand,
  approveVideo,
  modifyVideo,
  rejectVideo
};

// CLI
if (require.main === module) {
  const commandText = process.argv.slice(2).join(' ');
  
  if (!commandText) {
    console.error('Usage: node handle-approval.js <commande>');
    console.error('Exemples:');
    console.error('  node handle-approval.js approuve 2026-02-16T10-21-14');
    console.error('  node handle-approval.js modifie 2026-02-16T10-21-14 légende: Nouvelle légende');
    console.error('  node handle-approval.js rejette 2026-02-16T10-21-14');
    process.exit(1);
  }
  
  handleCommand(commandText).then(result => {
    if (result.success) {
      console.log('✅', result.message);
      if (result.instruction) console.log('💡', result.instruction);
    } else {
      console.error('❌', result.error);
      process.exit(1);
    }
  });
}
