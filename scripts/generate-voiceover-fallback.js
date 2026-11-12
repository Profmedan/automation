/**
 * Génère une voix-off avec fallback (ElevenLabs → Google TTS → OpenClaw TTS)
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { refuser } = require('./local/services-payants');

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * Génère un fichier audio à partir de texte (ElevenLabs avec fallback)
 * @param {string} text - Texte à convertir en voix
 * @param {string} voiceId - ID de la voix ElevenLabs
 * @param {string} outputPath - Chemin du fichier MP3 de sortie
 * @returns {string} Chemin du fichier audio généré
 */
async function generateVoiceoverWithFallback(text, voiceId, outputPath) {
  // Règle du 12 nov. 2026 : plus d'ElevenLabs ; le générateur utilise scripts/local/voix-locale.js (voix clonée)
  refuser('ElevenLabs (voix) — utiliser scripts/local/voix-locale.js');
}

/**
 * ElevenLabs API call
 */
async function generateVoiceoverElevenLabs(text, voiceId, outputPath) {
  // Règle du 12 nov. 2026 : aucun service payant sauf Claude
  refuser('ElevenLabs (voix)');
  const response = await axios.post(
    `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
    {
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
      responseType: 'arraybuffer',
    }
  );

  await fs.writeFile(outputPath, Buffer.from(response.data));
  const stats = await fs.stat(outputPath);
  console.log(`   ✓ Audio généré (ElevenLabs): ${(stats.size / 1024).toFixed(1)} KB`);
  return outputPath;
}

/**
 * Google Cloud TTS API call
 */
async function generateVoiceoverGoogleTTS(text, outputPath) {
  // Règle du 12 nov. 2026 : aucun service payant sauf Claude
  refuser('Google Cloud Text-to-Speech (voix)');
  const textToSpeech = require('@google-cloud/text-to-speech');
  const client = new textToSpeech.TextToSpeechClient();

  const request = {
    input: { text: text },
    voice: { languageCode: 'fr-FR', name: 'fr-FR-Neural2-A' },
    audioConfig: { audioEncoding: 'MP3' },
  };

  const [response] = await client.synthesizeSpeech(request);
  const writeFile = require('util').promisify(require('fs').writeFile);
  await writeFile(outputPath, response.audioContent, 'binary');
  const stats = await fs.stat(outputPath);
  console.log(`   ✓ Audio généré (Google TTS): ${(stats.size / 1024).toFixed(1)} KB`);
  return outputPath;
}

/**
 * Crée un fichier audio placeholder (silence avec ffmpeg)
 */
async function createPlaceholderAudio(outputPath, text) {
  const { execSync } = require('child_process');
  const dir = path.dirname(outputPath);
  
  try {
    // Générer 90 secondes de silence avec ffmpeg
    execSync(
      `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 90 -q:a 9 -acodec libmp3lame "${outputPath}" -y 2>/dev/null`,
      { stdio: 'pipe' }
    );
    const stats = await fs.stat(outputPath);
    console.log(`   ✓ Audio placeholder créé (${(stats.size / 1024).toFixed(1)} KB silence valide)`);
    console.log(`   📝 Texte narration pour montage manuel:`);
    console.log(`      ${text.substring(0, 150)}...`);
    return outputPath;
  } catch (error) {
    console.log(`   ⚠️  ffmpeg indisponible, création fichier minimal...`);
    // Fallback: créer un fichier minimal MP3 compatible avec ffmpeg
    const minimalMp3 = Buffer.from([
      0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ...Array.from({length: 8182}, () => 0),
    ]);
    await fs.writeFile(outputPath, minimalMp3);
    return outputPath;
  }
}

async function generateVoiceoverEdgeTTS(text, outputPath) {
  const { execSync } = require('child_process');
  const voice = process.env.EDGE_TTS_VOICE || 'fr-FR-HenriNeural';
  const tmpPath = outputPath.replace('.mp3', '_tmp.txt');
  await fs.writeFile(tmpPath, text, 'utf-8');
  try {
    execSync(`/usr/local/Caskroom/mambaforge/base/bin/edge-tts --voice "${voice}" --file "${tmpPath}" --write-media "${outputPath}"`, { timeout: 60000 });
    await fs.unlink(tmpPath).catch(() => {});
    const stats = await fs.stat(outputPath);
    console.log(`   ✓ Edge TTS: ${(stats.size / 1024).toFixed(1)} KB`);
    return outputPath;
  } catch (e) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new Error(`Edge TTS échoué: ${e.message}`);
  }
}

module.exports = {
  generateVoiceoverWithFallback,
  generateVoiceoverElevenLabs,
  generateVoiceoverGoogleTTS,
  createPlaceholderAudio,
};
