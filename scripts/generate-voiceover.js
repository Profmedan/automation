/**
 * Génère une voix-off avec Edge TTS (Microsoft) — gratuit, français natif
 * Voix : fr-FR-HenriNeural (homme) — qualité naturelle
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;

const EDGE_TTS_VOICE = process.env.EDGE_TTS_VOICE || 'fr-FR-HenriNeural';

/**
 * Génère un fichier audio à partir de texte via Edge TTS
 * @param {string} text - Texte à convertir en voix
 * @param {string} voiceId - Ignoré (conservé pour compatibilité), utilise EDGE_TTS_VOICE
 * @param {string} outputPath - Chemin du fichier MP3 de sortie
 * @returns {string} Chemin du fichier audio généré
 */
async function generateVoiceover(text, voiceId, outputPath) {
  console.log(`   🎙️  Edge TTS — voix: ${EDGE_TTS_VOICE}`);
  console.log(`   Texte: ${text.substring(0, 100)}... (${text.length} caractères)`);

  // Sauvegarde le texte dans un fichier temporaire pour éviter les problèmes d'échappement
  const tmpTextPath = outputPath.replace('.mp3', '_tmp_text.txt');
  await fs.writeFile(tmpTextPath, text, 'utf-8');

  try {
    execSync(
      `edge-tts --voice "${EDGE_TTS_VOICE}" --file "${tmpTextPath}" --write-media "${outputPath}"`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    await fs.unlink(tmpTextPath).catch(() => {});

    const stats = await fs.stat(outputPath);
    console.log(`   ✅ Audio généré: ${(stats.size / 1024).toFixed(1)} KB`);

    return outputPath;

  } catch (error) {
    await fs.unlink(tmpTextPath).catch(() => {});
    throw new Error(`Échec Edge TTS: ${error.message}`);
  }
}

/**
 * Liste les voix françaises disponibles dans Edge TTS
 */
async function listVoices() {
  try {
    const output = execSync('edge-tts --list-voices', { encoding: 'utf-8' });
    const frenchVoices = output
      .split('\n')
      .filter(line => line.includes('fr-FR') || line.includes('fr-BE') || line.includes('fr-CA'));
    return frenchVoices;
  } catch (error) {
    throw new Error(`Échec liste voix: ${error.message}`);
  }
}

module.exports = {
  generateVoiceover,
  listVoices,
};
