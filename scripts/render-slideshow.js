#!/usr/bin/env node

/**
 * Génère une vidéo slideshow statique avec FFmpeg
 * Format : 1080x1080 carré pour LinkedIn
 * Slides avec texte + audio synchronisé
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Chemin FFmpeg (conda)
const FFMPEG_PATH = '/usr/local/Caskroom/mambaforge/base/bin/ffmpeg';
const CONVERT_PATH = '/usr/local/bin/convert'; // ImageMagick (si installé)

/**
 * Génère une image de slide avec texte
 */
async function generateSlideImage(sceneData, index, outputPath) {
  const { text, duration } = sceneData;
  
  // Simplifier le texte pour FFmpeg (éviter les problèmes d'échappement)
  const safeText = text
    .replace(/'/g, "'")        // Apostrophe typographique → droite
    .replace(/"/g, "'")        // Guillemets → apostrophes
    .replace(/[:\\[\]]/g, ' '); // Caractères spéciaux → espaces
  
  // Couleurs selon le type de slide
  const backgrounds = {
    title: '#1a1a2e',      // Bleu foncé
    stat: '#16213e',       // Bleu marine
    visual: '#0f3460',     // Bleu profond
    quote: '#533483',      // Violet
    cta: '#e94560'         // Rouge/rose
  };
  
  const bgColor = backgrounds[sceneData.visualType] || '#1a1a2e';
  
  // Créer l'image avec FFmpeg (ImageMagick non installé)
  console.log(`   Génération slide ${index + 1}...`);
  
  // Créer une image simple avec FFmpeg
  // Pour éviter les problèmes d'échappement, on écrit le texte dans un fichier temporaire
  const textFile = outputPath.replace('.png', '.txt');
  await fs.writeFile(textFile, safeText);
  
  const ffmpegCmd = `${FFMPEG_PATH} -f lavfi -i color=c=${bgColor}:s=1080x1080:d=1 \
    -vf "drawtext=textfile='${textFile}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=(h-text_h)/2" \
    -frames:v 1 "${outputPath}" -y 2>&1`;
  
  try {
    execSync(ffmpegCmd, { stdio: 'pipe' });
    await fs.unlink(textFile).catch(() => {}); // Nettoyer le fichier texte
  } catch (error) {
    await fs.unlink(textFile).catch(() => {});
    throw error;
  }
  
  return outputPath;
}

/**
 * Génère la liste de fichiers pour FFmpeg concat
 */
async function generateConcatFile(scenes, slidesDir, concatFilePath) {
  const lines = [];
  
  for (let i = 0; i < scenes.length; i++) {
    const slidePath = path.join(slidesDir, `slide_${i}.png`);
    const duration = scenes[i].duration || 5;
    
    lines.push(`file '${slidePath}'`);
    lines.push(`duration ${duration}`);
  }
  
  // Répéter la dernière image pour sa durée complète
  if (scenes.length > 0) {
    const lastSlidePath = path.join(slidesDir, `slide_${scenes.length - 1}.png`);
    lines.push(`file '${lastSlidePath}'`);
  }
  
  await fs.writeFile(concatFilePath, lines.join('\n'));
  return concatFilePath;
}

/**
 * Génère la vidéo slideshow avec FFmpeg
 */
async function renderSlideshow(scriptData, audioPath, outputPath) {
  console.log('🎬 Génération du slideshow vidéo...');
  
  const workDir = path.dirname(outputPath);
  const slidesDir = path.join(workDir, 'slides');
  
  // Créer le dossier slides
  await fs.mkdir(slidesDir, { recursive: true });
  
  // Générer les images de slides
  console.log(`📸 Génération de ${scriptData.scenes.length} slides...`);
  
  for (let i = 0; i < scriptData.scenes.length; i++) {
    const scene = scriptData.scenes[i];
    const slidePath = path.join(slidesDir, `slide_${i}.png`);
    
    await generateSlideImage(scene, i, slidePath);
    console.log(`   ✓ Slide ${i + 1}/${scriptData.scenes.length}`);
  }
  
  // Créer le fichier concat pour FFmpeg
  const concatFile = path.join(workDir, 'concat.txt');
  await generateConcatFile(scriptData.scenes, slidesDir, concatFile);
  
  console.log('🎞️  Assemblage de la vidéo...');
  
  // Générer la vidéo avec FFmpeg
  const ffmpegCmd = `${FFMPEG_PATH} -f concat -safe 0 -i "${concatFile}" \
    -i "${audioPath}" \
    -c:v libx264 -pix_fmt yuv420p \
    -c:a aac -shortest \
    -r 30 \
    "${outputPath}" -y 2>&1`;
  
  try {
    const output = execSync(ffmpegCmd, { stdio: 'pipe' }).toString();
    
    // Nettoyer les fichiers temporaires
    await fs.rm(slidesDir, { recursive: true, force: true });
    await fs.unlink(concatFile).catch(() => {});
    
    console.log('✅ Vidéo générée avec succès');
    return outputPath;
    
  } catch (error) {
    console.error('❌ Erreur FFmpeg:', error.message);
    
    // En cas d'erreur, garder les fichiers temporaires pour debug
    console.log(`⚠️  Fichiers conservés pour debug:`);
    console.log(`   - Slides: ${slidesDir}`);
    console.log(`   - Concat: ${concatFile}`);
    
    throw error;
  }
}

module.exports = { renderSlideshow, generateSlideImage };

// Test CLI
if (require.main === module) {
  const scriptPath = process.argv[2];
  const audioPath = process.argv[3];
  const outputPath = process.argv[4];
  
  if (!scriptPath || !audioPath || !outputPath) {
    console.error('Usage: node render-slideshow.js <script.json> <audio.mp3> <output.mp4>');
    process.exit(1);
  }
  
  (async () => {
    const scriptData = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
    await renderSlideshow(scriptData, audioPath, outputPath);
    console.log(`🎉 Vidéo créée: ${outputPath}`);
  })();
}
