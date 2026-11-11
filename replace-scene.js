#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs').promises;
const { createWriteStream } = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');
const { renderDynamicVideo } = require('./scripts/render-video-dynamic');
const { uploadVideoToDrive } = require('./scripts/drive-utils');

const FFMPEG_PATH = '/usr/local/Caskroom/mambaforge/base/bin/ffmpeg';
const VIDEO_BASE_DIR = path.join(__dirname, '..', 'linkedin-videos');
// Jeton et chat lus uniquement dans .env (jamais écrits en dur), même source que le bot, quel que soit le dossier courant.
const { token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID } = require(path.join(__dirname, '..', 'blogger-automation', 'telegram-config.cjs')).telegramConfig(__dirname);
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID doivent être définis dans .env');
  process.exit(1);
}

async function downloadFile(urlOrPath, destPath) {
  if (urlOrPath.startsWith('/')) {
    console.log('📁 Fichier local, copie directe...');
    require('fs').copyFileSync(urlOrPath, destPath);
    return;
  }
  console.log('📥 Téléchargement média...');
  const response = await axios.get(urlOrPath, { responseType: 'stream' });
  const writer = createWriteStream(destPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function detectMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) return 'video';
  return 'image';
}

async function sendTelegramMessage(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (e) {
    console.error('⚠️  Telegram:', e.message);
  }
}

async function replaceScene(videoId, sceneIndex, mediaUrl, withSubtitles = true) {
  console.log(`\n🔄 Remplacement scène ${sceneIndex + 1} — vidéo ${videoId}\n`);

  const videoFolder = path.join(VIDEO_BASE_DIR, videoId);
  await fs.access(videoFolder);

  const scriptPath = path.join(videoFolder, 'script.json');
  const scriptData = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));

  if (sceneIndex < 0 || sceneIndex >= scriptData.scenes.length) {
    throw new Error(`Scène ${sceneIndex + 1} invalide. Total : ${scriptData.scenes.length} scènes.`);
  }

  const imagesDir = path.join(videoFolder, 'images');
  await fs.mkdir(imagesDir, { recursive: true });

  const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('.mov');
  const ext = isVideo ? '.mp4' : '.jpg';
  const mediaPath = path.join(imagesDir, `user_scene_${sceneIndex}${ext}`);
  await downloadFile(mediaUrl, mediaPath);

  let finalImagePath = mediaPath;
  let clipDuration = null;

  if (isVideo) {
    const FFPROBE_PATH = FFMPEG_PATH.replace('ffmpeg', 'ffprobe');
    try {
      clipDuration = parseFloat(
        execSync(`${FFPROBE_PATH} -v quiet -show_entries format=duration -of csv=p=0 "${mediaPath}"`, { encoding: 'utf-8' }).trim()
      );
      console.log(`✅ Clip vidéo: ${clipDuration.toFixed(2)}s`);
    } catch(e) {
      console.error('⚠️  Durée clip inconnue:', e.message);
    }

    const sceneDuration = scriptData.scenes[sceneIndex].duration || 4;

    if (clipDuration && clipDuration < sceneDuration) {
      // Clip plus court → geler la dernière frame
      console.log(`⏸️  Clip court → gel dernière frame jusqu'à ${sceneDuration}s`);
      const lastFramePath = path.join(imagesDir, `user_scene_${sceneIndex}_lastframe.jpg`);
      const freezePath = path.join(imagesDir, `user_scene_${sceneIndex}_freeze.mp4`);
      const extendedPath = path.join(imagesDir, `user_scene_${sceneIndex}_extended.mp4`);
      const freezeDuration = (sceneDuration - clipDuration).toFixed(3);
      const concatTxt = path.join(imagesDir, `concat_${sceneIndex}.txt`);
      execSync(`${FFMPEG_PATH} -sseof -0.1 -i "${mediaPath}" -vframes 1 -q:v 2 "${lastFramePath}" -y 2>&1`);
      execSync(`${FFMPEG_PATH} -loop 1 -i "${lastFramePath}" -t ${freezeDuration} -vf "scale=1080:1080,fps=30" -c:v libx264 -pix_fmt yuv420p "${freezePath}" -y 2>&1`);
      await fs.writeFile(concatTxt, `file '${mediaPath}'
file '${freezePath}'`);
      execSync(`${FFMPEG_PATH} -f concat -safe 0 -i "${concatTxt}" -c:v libx264 -pix_fmt yuv420p "${extendedPath}" -y 2>&1`);
      finalImagePath = extendedPath;

    } else if (clipDuration && clipDuration > sceneDuration) {
      // Clip plus long → silence + sous-titre '...'
      const silenceDuration = clipDuration - sceneDuration;
      console.log(`▶️  Clip long → silence ${silenceDuration.toFixed(2)}s après narration`);
      scriptData.scenes[sceneIndex].duration = clipDuration;
      scriptData.scenes[sceneIndex].silenceExtension = silenceDuration;
      finalImagePath = mediaPath;

    } else {
      finalImagePath = mediaPath;
    }
  }

  scriptData.userMediaOverrides = scriptData.userMediaOverrides || {};
  scriptData.userMediaOverrides[sceneIndex] = { imagePath: finalImagePath, withSubtitles };
  await fs.writeFile(scriptPath, JSON.stringify(scriptData, null, 2));

  console.log('🎬 Re-render vidéo complète...');
  const audioPath = path.join(videoFolder, 'voiceover.mp3');
  const newVideoPath = path.join(videoFolder, 'video_corrected.mp4');
  await renderDynamicVideo(scriptData, audioPath, newVideoPath);

  let driveUrls = null;
  try {
    const metadata = JSON.parse(await fs.readFile(path.join(videoFolder, 'metadata.json'), 'utf-8'));
    driveUrls = await uploadVideoToDrive(newVideoPath, {
      ...metadata,
      title: `[CORRIGÉ] ${metadata.title}`
    });
    console.log('✅ Uploadé sur Drive');
  } catch (e) {
    console.error('⚠️  Drive:', e.message);
  }

  await sendTelegramMessage(
    `✅ *Vidéo corrigée — Scène ${sceneIndex + 1}*\n\n` +
    `📹 [Voir sur Drive](${driveUrls?.videoUrl || 'non disponible'})\n\n` +
    `*ID :* \`${videoId}\`\n\n` +
    `✅ \`approuve vidéo ${videoId}\`\n` +
    `🔄 \`remplace scène X ${videoId}\`\n` +
    `❌ \`rejette vidéo ${videoId}\``
  );

  return newVideoPath;
}

module.exports = { replaceScene };

if (require.main === module) {
  const [,, videoId, sceneNumberStr, mediaUrl, subtitlesFlag] = process.argv;
  if (!videoId || !sceneNumberStr || !mediaUrl) {
    console.error('Usage: node replace-scene.js <videoId> <sceneNumber> <mediaUrl> [sans-sous-titres]');
    process.exit(1);
  }
  const sceneIndex = parseInt(sceneNumberStr) - 1;
  const withSubtitles = subtitlesFlag !== 'sans-sous-titres';
  replaceScene(videoId, sceneIndex, mediaUrl, withSubtitles)
    .then(p => console.log(`\n🎉 Terminé: ${p}`))
    .catch(err => { console.error('❌', err.message); process.exit(1); });
}
