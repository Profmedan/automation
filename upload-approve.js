require('dotenv').config();
const { uploadVideoToDrive } = require('./scripts/drive-utils');
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(__dirname, '..');
const VIDEO_OUTPUT_PATH = process.env.VIDEO_OUTPUT_PATH || path.join(WORKSPACE_ROOT, 'linkedin-videos');

const videoId = process.argv[2] || '2026-02-27T16-03-07';
const videoFolder = path.join(VIDEO_OUTPUT_PATH, videoId);
const videoPath = path.join(videoFolder, 'video.mp4');
const metadataPath = path.join(videoFolder, 'metadata.json');

(async () => {
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    console.log(`📝 Vidéo: ${metadata.title}`);
    console.log(`📤 Upload vidéo ${videoId}...`);
    
    const driveUrl = await uploadVideoToDrive(videoPath, metadata);
    
    console.log('\n✅ VIDÉO UPLOADÉE ET APPROUVÉE');
    console.log(`🔗 Drive: ${driveUrl}`);
    console.log(`📋 ID: ${videoId}`);
    
    // Marquer comme approuvée
    fs.writeFileSync(
      path.join(videoFolder, 'approved.json'),
      JSON.stringify({
        approved: true,
        approvedAt: new Date().toISOString(),
        driveUrl: driveUrl,
        title: metadata.title
      }, null, 2)
    );
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
})();
