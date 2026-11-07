require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { renderDynamicVideo } = require('./scripts/render-video-dynamic');

const videoId = '2026-02-27T16-03-07';
const videoFolder = path.join(__dirname, '..', 'linkedin-videos', videoId);
const scriptPath = path.join(videoFolder, 'script.json');
const voiceoverPath = path.join(videoFolder, 'voiceover.mp3');

(async () => {
  try {
    console.log(`🎬 Régénération vidéo avec scène 1 personnalisée...`);
    
    const script = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
    console.log(`📝 Script chargé: ${script.title}`);
    
    // Supprimer l'ancienne vidéo
    const oldVideoPath = path.join(videoFolder, 'video.mp4');
    try {
      await fs.unlink(oldVideoPath);
      console.log(`🗑️  Ancien vidéo supprimée`);
    } catch (e) {}
    
    // Regénérer
    console.log(`🎨 Rendu vidéo avec Remotion...`);
    const newVideoPath = await renderDynamicVideo(script, voiceoverPath, videoFolder, script.title);
    
    console.log(`✅ Vidéo régénérée avec scène 1 personnalisée !`);
    console.log(`📹 Chemin: ${newVideoPath}`);
    
    // Mettre à jour le status
    const statusPath = path.join(videoFolder, 'status.json');
    const status = JSON.parse(await fs.readFile(statusPath, 'utf-8'));
    status.scene_1_replaced = true;
    status.replaced_at = new Date().toISOString();
    await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
    
    console.log(`✅ Status mis à jour`);
    
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
    process.exit(1);
  }
})();
