#!/usr/bin/env node

/**
 * LinkedIn Video Generator - Avec voix-off préexistante
 * Génère la vidéo en utilisant une voix-off déjà préparée
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { generateVideoScript } = require('./scripts/generate-script-dynamic');
const { renderDynamicVideo } = require('./scripts/render-video-dynamic');
const { uploadVideoToDrive } = require('./scripts/drive-utils');

const CONFIG = {
  openaiKey: process.env.OPENAI_API_KEY,
  outputPath: process.env.VIDEO_OUTPUT_PATH || path.join(__dirname, '..', 'linkedin-videos'),
};

const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

async function generateLinkedInVideoWithVoiceover(article, videoFolderId) {
  console.log('🎬 Début génération vidéo LinkedIn (voix-off préexistante)...');
  console.log(`📝 Article: ${article.title}`);
  console.log(`📁 Dossier: ${videoFolderId}`);

  try {
    await fs.mkdir(CONFIG.outputPath, { recursive: true });
    const videoFolder = path.join(CONFIG.outputPath, videoFolderId);
    
    // Vérifier que le dossier vidéo existe et contient la voix-off
    const voiceoverPath = path.join(videoFolder, 'voiceover.mp3');
    const voiceoverStats = await fs.stat(voiceoverPath);
    console.log(`✅ Voix-off détectée: ${(voiceoverStats.size / 1024).toFixed(1)} KB`);

    // ÉTAPE 1: Générer le script vidéo
    console.log('\n📄 Génération du script vidéo...');
    const videoScript = await generateVideoScript(article);
    console.log(`✅ Script généré: ${videoScript.scenes.length} plans, ${videoScript.duration}s`);
    
    await fs.writeFile(
      path.join(videoFolder, 'script.json'),
      JSON.stringify(videoScript, null, 2)
    );

    // ÉTAPE 2: Lire la durée audio réelle avec ffprobe
    console.log('\n⏱️  Lecture durée voix-off...');
    const { execSync } = require('child_process');
    let audioDuration = videoScript.duration;
    
    try {
      audioDuration = parseFloat(
        execSync(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceoverPath}"`)
          .toString()
          .trim()
      );
      console.log(`✅ Durée audio: ${audioDuration.toFixed(2)}s`);
    } catch (error) {
      console.log(`⚠️  ffprobe indisponible, utilisation durée estimée: ${videoScript.duration}s`);
    }

    // ÉTAPE 3: Synchroniser les durées de scènes
    console.log('\n⚖️  Synchronisation durées:');
    const scriptTotalDuration = videoScript.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    console.log(`   Script original: ${scriptTotalDuration}s`);
    console.log(`   Audio réel: ${audioDuration.toFixed(2)}s`);
    
    const adjustmentRatio = audioDuration / scriptTotalDuration;
    videoScript.scenes = videoScript.scenes.map(scene => ({
      ...scene,
      duration: Math.max(2, scene.duration * adjustmentRatio)
    }));
    
    const adjustedDuration = videoScript.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    videoScript.duration = adjustedDuration;
    console.log(`   Après ajustement: ${adjustedDuration.toFixed(2)}s`);
    console.log(`   ✅ Synchronisé !`);

    // ÉTAPE 4: Render vidéo dynamique
    console.log('\n🎬 Création de la vidéo dynamique...');
    const videoPath = await renderDynamicVideo(
      videoScript,
      voiceoverPath,
      videoFolder,
      article.title
    );

    console.log(`\n✅ Vidéo générée: ${videoPath}`);

    // ÉTAPE 5: Upload sur Google Drive
    console.log('\n📤 Upload vidéo sur Google Drive...');
    const driveUrl = await uploadVideoToDrive(videoPath, `${article.title} - Vidéo LinkedIn`);
    console.log(`✅ Vidéo uploadée: ${driveUrl}`);

    console.log('\n✅ Génération vidéo terminée !');
    console.log(`📹 Vidéo: ${videoPath}`);
    console.log(`🔗 Drive: ${driveUrl}`);

    return { videoPath, driveUrl };

  } catch (error) {
    console.error(`\n❌ ERREUR: ${error.message}`);
    throw error;
  }
}

// Main
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node generate-video-with-voiceover.js <article.json> <video-folder-id>');
  console.error('Exemple: node generate-video-with-voiceover.js /tmp/article.json 2026-02-27T06-31-20');
  process.exit(1);
}

const articlePath = args[0];
const videoFolderId = args[1];

(async () => {
  const articleData = JSON.parse(await fs.readFile(articlePath, 'utf8'));
  await generateLinkedInVideoWithVoiceover(articleData, videoFolderId);
})();
