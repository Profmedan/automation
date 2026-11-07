/**
 * Render vidéo LinkedIn
 * Version slideshow statique avec FFmpeg
 */

const { renderSlideshow } = require('./render-slideshow');
const fs = require('fs').promises;

/**
 * Rend la vidéo finale
 * @param {Object} options - {script, audioPath, outputPath}
 * @returns {string} Chemin de la vidéo générée
 */
async function renderVideo({ script, audioPath, outputPath }) {
  try {
    console.log('🎬 Génération vidéo slideshow...');
    
    // Utiliser le système de slideshow
    const videoPath = await renderSlideshow(script, audioPath, outputPath);
    
    return videoPath;

  } catch (error) {
    console.error('❌ Erreur render vidéo:', error.message);
    
    // Fallback : retourner juste l'audio si la vidéo échoue
    console.log('⚠️  Fallback: utilisation audio seul');
    
    const placeholder = {
      status: 'audio_only',
      audioPath: audioPath,
      script: script,
      error: error.message,
      message: 'La génération vidéo a échoué. Audio disponible.'
    };

    await fs.writeFile(
      outputPath.replace('.mp4', '.json'),
      JSON.stringify(placeholder, null, 2)
    );

    return audioPath;
  }
}

module.exports = { renderVideo };
