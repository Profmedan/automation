require('dotenv').config();
const { uploadVideoToDrive } = require('./scripts/drive-utils');
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(__dirname, '..');
const VIDEO_OUTPUT_PATH = process.env.VIDEO_OUTPUT_PATH || path.join(WORKSPACE_ROOT, 'linkedin-videos');

const videoId = process.argv[2] || '2026-02-27T06-53-40';
const videoFolder = path.join(VIDEO_OUTPUT_PATH, videoId);
const videoPath = path.join(videoFolder, 'video.mp4');
const metadataPath = path.join(videoFolder, 'metadata.json');

(async () => {
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    console.log(`📝 Métadonnées: ${metadata.title}`);
    
    const driveUrl = await uploadVideoToDrive(videoPath, metadata);
    
    console.log('\n✅ UPLOAD COMPLÉTÉ');
    console.log(`🔗 Lien Drive: ${driveUrl}`);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
})();
