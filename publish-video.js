#!/usr/bin/env node

/**
 * Publie une vidéo approuvée sur LinkedIn
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { publishToLinkedIn, addComment } = require('./scripts/linkedin-publisher');

/**
 * Publie une vidéo sur LinkedIn
 */
async function publishVideoToLinkedIn(videoId) {
  console.log(`\n📤 Publication vidéo ${videoId} sur LinkedIn...`);
  
  const videoFolder = path.join(__dirname, '..', 'linkedin-videos', videoId);
  const statusPath = path.join(videoFolder, 'status.json');
  const videoPath = path.join(videoFolder, 'video.mp4');
  const metadataPath = path.join(videoFolder, 'metadata.json');
  
  try {
    // Vérifier les fichiers
    const statusExists = await fs.stat(statusPath).catch(() => null);
    if (!statusExists) {
      throw new Error(`Dossier vidéo non trouvé: ${videoFolder}`);
    }
    
    const status = JSON.parse(await fs.readFile(statusPath, 'utf-8'));
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    
    if (status.status !== 'pending_approval') {
      console.log(`⚠️  Status actuel: ${status.status}`);
      if (status.status === 'published') {
        console.log(`✅ Déjà publiée: ${status.published_url}`);
        return status;
      }
      if (status.status === 'rejected') {
        console.log(`❌ Rejetée le ${status.rejected_at}`);
        return status;
      }
    }
    
    // Publication réelle sur LinkedIn
    console.log('📤 Publication sur LinkedIn...');
    const result = await publishToLinkedIn(videoPath, metadata);
    
    if (!result || !result.postUrl) {
      throw new Error('Publication LinkedIn échouée');
    }

    status.status = 'published';
    status.approved_at = new Date().toISOString();
    status.published_at = new Date().toISOString();
    status.published_url = result.postUrl;
    
    await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
    
    console.log('✅ Vidéo publiée sur LinkedIn !');
    console.log(`🔗 URL: ${result.postUrl}`);
    console.log(`📊 Titre: ${metadata.title}`);
    console.log(`🏷️  Hashtags: ${metadata.hashtags.join(' ')}`);
    
    console.log(`\n__VIDEO_PUBLISHED__${JSON.stringify({
      id: videoId,
      title: metadata.title,
      path: videoPath,
      url: result.postUrl
    })}__END__`);
    
    return status;
    
  } catch (error) {
    console.error('❌ Erreur publication:', error.message);
    throw error;
  }
}

/**
 * Rejette une vidéo
 */
async function rejectVideo(videoId) {
  console.log(`\n❌ Rejet vidéo ${videoId}...`);
  
  const videoFolder = path.join(__dirname, '..', 'linkedin-videos', videoId);
  const statusPath = path.join(videoFolder, 'status.json');
  
  try {
    const status = JSON.parse(await fs.readFile(statusPath, 'utf-8'));
    
    status.status = 'rejected';
    status.rejected_at = new Date().toISOString();
    
    await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
    
    console.log(`✅ Vidéo ${videoId} rejetée`);
    console.log(`💡 Commande: node generate-video.js <article.json> pour régénérer`);
    
    return status;
    
  } catch (error) {
    console.error('❌ Erreur rejet:', error.message);
    throw error;
  }
}

// CLI
if (require.main === module) {
  const command = process.argv[2]; // 'publish' ou 'reject'
  const videoId = process.argv[3];
  
  if (!command || !videoId) {
    console.error('Usage: node publish-video.js <publish|reject> <videoId>');
    process.exit(1);
  }
  
  (async () => {
    try {
      if (command === 'publish') {
        await publishVideoToLinkedIn(videoId);
      } else if (command === 'reject') {
        await rejectVideo(videoId);
      } else {
        console.error('Commande inconnue:', command);
        process.exit(1);
      }
    } catch (error) {
      console.error('Erreur:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { publishVideoToLinkedIn, rejectVideo };
