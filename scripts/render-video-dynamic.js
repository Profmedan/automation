#!/usr/bin/env node

/**
 * Render vidéo dynamique avec images + texte + sous-titres
 * Format optimisé LinkedIn avec plans courts (3-5s)
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { generateVideoImages } = require('./fetch-images');

const FFMPEG_PATH = '/usr/local/Caskroom/mambaforge/base/bin/ffmpeg';

/**
 * Génère les sous-titres automatiques avec Whisper
 */
async function correctSubtitles(srtPath) {
  /**
   * Corrige les erreurs de reconnaissance dans les sous-titres
   */
  try {
    let content = await fs.readFile(srtPath, 'utf-8');
    
    // Corrections spécifiques
    content = content.replace(/openclos/gi, 'OpenClaw');
    content = content.replace(/open\s+clos/gi, 'OpenClaw');
    content = content.replace(/\bopen\s*claw\b/gi, 'OpenClaw');
    // Corrections phonetiques Whisper
    content = content.replace(/j'ai p[eé]t[eé]/gi, 'GPT');
    content = content.replace(/j'ai p[eé]/gi, 'GPT');
    content = content.replace(/g[eé]p[eé]t[eé]/gi, 'GPT');
    content = content.replace(/g\.p\.t\./gi, 'GPT');
    content = content.replace(/un LM/gi, 'un LLM');
    content = content.replace(/elle LM/gi, 'LLM');
    content = content.replace(/l'LM/gi, 'LLM');
    content = content.replace(/a\.p\.i\./gi, 'API');
    content = content.replace(/ailleur/gi, 'IA');
    content = content.replace(/gems? ?naille/gi, 'Gemini');
    content = content.replace(/clode/gi, 'Claude');
    content = content.replace(/claud(?!e)/gi, 'Claude');
    content = content.replace(/open ?aille/gi, 'OpenAI');
    // Corrections phonetiques Whisper
    content = content.replace(/j.ai p.t./gi, 'GPT');
    content = content.replace(/g.p.t./gi, 'GPT');
    content = content.replace(/un LM/gi, 'un LLM');
    content = content.replace(/elle LM/gi, 'LLM');
    content = content.replace(/a\.p\.i\./gi, 'API');
    content = content.replace(/gems.naille/gi, 'Gemini');
    content = content.replace(/clode/gi, 'Claude');
    content = content.replace(/open.aille/gi, 'OpenAI');
    content = content.replace(/soixante-dix pour cent haut/gi, 'soixante-dix pour cent eau');
    content = content.replace(/70. haut/gi, '70% eau');
    content = content.replace(/pour cent haut/gi, 'pour cent eau');
    content = content.replace(/70% haut/gi, '70% eau');
    content = content.replace(/pour cent haut/gi, 'pour cent eau');
    content = content.replace(/70% haut/gi, '70% eau');
    content = content.replace(/pour cent haut/gi, 'pour cent eau');
    // Corrections phonetiques Whisper
    content = content.replace(/j'ai p[eé]t[eé]/gi, 'GPT');
    content = content.replace(/j'ai p[eé]/gi, 'GPT');
    content = content.replace(/g[eé]p[eé]t[eé]/gi, 'GPT');
    content = content.replace(/g\.p\.t\./gi, 'GPT');
    content = content.replace(/un LM/gi, 'un LLM');
    content = content.replace(/elle LM/gi, 'LLM');
    content = content.replace(/l'LM/gi, 'LLM');
    content = content.replace(/a\.p\.i\./gi, 'API');
    content = content.replace(/ailleur/gi, 'IA');
    content = content.replace(/gems? ?naille/gi, 'Gemini');
    content = content.replace(/clode/gi, 'Claude');
    content = content.replace(/claud(?!e)/gi, 'Claude');
    content = content.replace(/open ?aille/gi, 'OpenAI');
    // Corrections phonetiques Whisper
    content = content.replace(/j.ai p.t./gi, 'GPT');
    content = content.replace(/g.p.t./gi, 'GPT');
    content = content.replace(/un LM/gi, 'un LLM');
    content = content.replace(/elle LM/gi, 'LLM');
    content = content.replace(/a\.p\.i\./gi, 'API');
    content = content.replace(/gems.naille/gi, 'Gemini');
    content = content.replace(/clode/gi, 'Claude');
    content = content.replace(/open.aille/gi, 'OpenAI');
    content = content.replace(/soixante-dix pour cent haut/gi, 'soixante-dix pour cent eau');
    content = content.replace(/70. haut/gi, '70% eau');
    content = content.replace(/pour cent haut/gi, 'pour cent eau');
    content = content.replace(/70% haut/gi, '70% eau');
    content = content.replace(/pour cent haut/gi, 'pour cent eau');
    content = content.replace(/70% haut/gi, '70% eau');
    content = content.replace(/pour cent haut/gi, 'pour cent eau');
    
    await fs.writeFile(srtPath, content, 'utf-8');
    console.log('✅ Sous-titres corrigés (openclos → OpenClaw)');
  } catch (error) {
    console.error('⚠️  Erreur correction sous-titres:', error.message);
  }
}

async function generateSubtitles(audioPath, outputSrtPath) {
  console.log('📝 Génération sous-titres (Whisper)...');
  
  try {
    const fsSync = require('fs');
    const FormData = require('form-data');
    const axios = require('axios');

    const form = new FormData();
    form.append('file', fsSync.createReadStream(audioPath));
    form.append('model', 'whisper-1');
    form.append('response_format', 'srt');
    form.append('language', 'fr');

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...form.getHeaders()
      },
      maxBodyLength: Infinity,
      timeout: 60000
    });

    await fs.writeFile(outputSrtPath, response.data);
    
    // Corriger les erreurs de reconnaissance
    await correctSubtitles(outputSrtPath);
    console.log('✅ Sous-titres générés et corrigés');

    return outputSrtPath;
  } catch (error) {
    console.error('⚠️  Erreur Whisper:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Crée une image avec texte overlay
 */
async function createImageWithText(imagePath, text, outputPath, scene, articleUrl = null) {
  // Couleurs selon type de plan
  const colors = {
    hook: '#FF3366',
    stat: '#00D9FF',
    visual: '#7B68EE',
    quote: '#FFB800',
    split: '#00C896',
    cta: '#FF3366'
  };
  
  const accentColor = colors[scene.visualType] || '#FFFFFF';
  
  // Simplifier le texte pour éviter problèmes d'échappement
  const safeText = text
    .replace(/'/g, "'")
    .replace(/"/g, "'")
    .replace(/[:\\[\]]/g, ' ')
    .substring(0, 80);
  
  // Écrire le texte dans un fichier temporaire
  const textFile = outputPath.replace('.jpg', '.txt');
  await fs.writeFile(textFile, safeText);
  
  // Si c'est une scène CTA avec "article" et qu'on a le lien, préparer l'affichage du lien
  const isLinkScene = scene.visualType === 'cta' && 
                      (text.toLowerCase().includes('article') || 
                       text.toLowerCase().includes('blog') ||
                       text.toLowerCase().includes('lien'));
  
  let linkText = '';
  let linkFile = null;
  if (isLinkScene && articleUrl) {
    // Extraire juste le domaine + chemin court pour affichage
    try {
      const url = new URL(articleUrl);
      linkText = url.hostname + url.pathname.substring(0, 30);
      linkFile = outputPath.replace('.jpg', '_link.txt');
      await fs.writeFile(linkFile, linkText);
    } catch (e) {
      linkText = articleUrl.substring(0, 50);
      linkFile = outputPath.replace('.jpg', '_link.txt');
      await fs.writeFile(linkFile, linkText);
    }
  }
  
  try {
    // Si pas d'image source, créer fond coloré
    let inputSource;
    if (!imagePath) {
      inputSource = `-f lavfi -i color=c=${accentColor}:s=1080x1080:d=0.1`;
    } else {
      inputSource = `-i "${imagePath}"`;
    }
    
    
    // Si c'est une scène avec lien, ajouter le lien en dessous
    if (linkFile) {
      // pas de texte overlay lien
    }
    
    const ffmpegCmd = `${FFMPEG_PATH} ${inputSource} \
      -vf "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080" \
      -update 1 -frames:v 1 "${outputPath}" -y 2>&1`;
    
    try {
      execSync(ffmpegCmd, { stdio: 'pipe' });
    } catch (err) {
      console.error('❌ ffmpeg stderr:', err.stderr?.toString());
      console.error('❌ ffmpeg stdout:', err.stdout?.toString());
      throw err;
    }
    
    await fs.unlink(textFile).catch(() => {});
    if (linkFile) await fs.unlink(linkFile).catch(() => {});
    
  } catch (error) {
    console.error(`   ❌ Erreur création image+texte:`, error.message);
    await fs.unlink(textFile).catch(() => {});
    throw error;
  }
}

/**
 * Génère la vidéo dynamique complète
 */
async function renderDynamicVideo(scriptData, audioPath, outputPath, articleUrl = null) {
  console.log('🎬 Génération vidéo dynamique...\n');
  
  const workDir = path.dirname(outputPath);
  const imagesDir = path.join(workDir, 'images');
  const slidesDir = path.join(workDir, 'slides');
  
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(slidesDir, { recursive: true });
  
  try {
    // ÉTAPE 1: Récupérer/générer les images
    console.log('🖼️  Étape 1/4 : Images...');
    const images = await generateVideoImages(scriptData, imagesDir);
    
    // ÉTAPE 2: Créer les slides (image + texte)
    console.log('\n📸 Étape 2/4 : Slides avec texte...');
    for (let i = 0; i < scriptData.scenes.length; i++) {
      const scene = scriptData.scenes[i];
      const imageData = images[i];
      const slidePath = path.join(slidesDir, `slide_${i}.jpg`);
      
      console.log(`   Slide ${i + 1}/${scriptData.scenes.length} - ${scene.visualType}`);

      // Pour les médias utilisateur sans sous-titres : copie directe sans overlay texte
      const userOverride = scriptData.userMediaOverrides?.[i];
      if (userOverride && userOverride.withSubtitles === false && imageData?.path) {
        const fsSync = require('fs');
        fsSync.copyFileSync(imageData.path, slidePath);
        console.log(`   ✅ Slide ${i + 1} : média utilisateur sans sous-titres`);
        continue;
      }
      
      await createImageWithText(
        imageData?.path || null,
        scene.text,
        slidePath,
        scene,
        i === scriptData.scenes.length - 1 ? articleUrl : null
      );
    }
    
    // ÉTAPE 3: Générer sous-titres
    console.log('\n📝 Étape 3/4 : Sous-titres...');
    const srtPath = path.join(workDir, 'subtitles.srt');
    const hasSubs = await generateSubtitles(audioPath, srtPath);
    
    // ÉTAPE 4: Assembler la vidéo
    console.log('\n🎞️  Étape 4/4 : Assemblage final...');
    
    // Calculer durée audio réelle
    let audioDuration = scriptData.duration || 100;
    try {
      const { execSync: execS } = require('child_process');
      const dur = execS(`${FFMPEG_PATH.replace('ffmpeg','ffprobe')} -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`, { encoding: 'utf-8' }).trim();
      audioDuration = parseFloat(dur);
      console.log(`   🎵 Durée audio réelle: ${audioDuration.toFixed(1)}s`);
    } catch(e) {}

    // Ajuster durées slides pour correspondre exactement à l'audio
    const totalSceneDuration = scriptData.scenes.reduce((sum, s) => sum + (s.duration || 4), 0);
    const durationRatio = audioDuration / totalSceneDuration;

    // Créer fichier concat — gestion mixte images + clips vidéo
    const concatFile = path.join(workDir, 'concat.txt');
    const concatLines = [];
    const segmentsDir = path.join(workDir, 'segments');
    await fs.mkdir(segmentsDir, { recursive: true });

    for (let i = 0; i < scriptData.scenes.length; i++) {
      const override = scriptData.userMediaOverrides?.[i];
      const rawDuration = (scriptData.scenes[i].duration || 4) * durationRatio;
      const duration = Math.max(3, rawDuration).toFixed(3);

      // Clip vidéo utilisateur — convertir en segment MP4 normalisé
      if (override?.imagePath && override.imagePath.endsWith('.mp4')) {
        const segPath = path.join(segmentsDir, `seg_${i}.mp4`);
        const clipDuration = scriptData.scenes[i].duration || 4;

        // Redimensionner et normaliser le clip (1080x1080, 30fps, muet)
        execSync(
          `${FFMPEG_PATH} -i "${override.imagePath}" ` +
          `-vf "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2" ` +
          `-t ${clipDuration} -r 30 -c:v libx264 -pix_fmt yuv420p -an "${segPath}" -y 2>&1`,
          { stdio: 'pipe' }
        );
        concatLines.push(`file '${segPath}'`);
        concatLines.push(`duration ${duration}`);
        console.log(`   🎬 Scène ${i+1} : clip vidéo intégré (${clipDuration}s)`);
      } else {
        // Image statique — comportement normal
        const slidePath = path.join(slidesDir, `slide_${i}.jpg`);
        concatLines.push(`file '${slidePath}'`);
        concatLines.push(`duration ${duration}`);
      }
    }

    // Répéter dernier élément
    if (scriptData.scenes.length > 0) {
      const lastI = scriptData.scenes.length - 1;
      const lastOverride = scriptData.userMediaOverrides?.[lastI];
      if (lastOverride?.imagePath?.endsWith('.mp4')) {
        const lastSeg = path.join(segmentsDir, `seg_${lastI}.mp4`);
        concatLines.push(`file '${lastSeg}'`);
      } else {
        concatLines.push(`file '${path.join(slidesDir, `slide_${lastI}.jpg`)}'`);
      }
    }

    await fs.writeFile(concatFile, concatLines.join('\n'));
    
    // Assembler avec FFmpeg
    let ffmpegCmd = `${FFMPEG_PATH} -f concat -safe 0 -i "${concatFile}" \
      -i "${audioPath}" \
      -c:v libx264 -pix_fmt yuv420p -preset fast \
      -c:a aac -b:a 128k \
      -shortest -r 30`;
    
    // Ajouter sous-titres brûlés si disponibles
    if (hasSubs) {
      ffmpegCmd += ` -vf "subtitles='${srtPath}':force_style='FontName=Helvetica Bold,FontSize=18,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=80'"`;
    }
    
    ffmpegCmd += ` "${outputPath}" -y 2>&1`;
    
    console.log('   Rendering...');
    try {
      execSync(ffmpegCmd, { stdio: 'pipe' });
    } catch (err) {
      console.error('❌ ffmpeg stderr:', err.stderr?.toString());
      console.error('❌ ffmpeg stdout:', err.stdout?.toString());
      throw err;
    }
    
    // Nettoyer fichiers temporaires
    await fs.rm(slidesDir, { recursive: true, force: true });
    await fs.rm(segmentsDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(imagesDir, { recursive: true, force: true });
    await fs.unlink(concatFile).catch(() => {});
    if (hasSubs) await fs.unlink(srtPath).catch(() => {});
    
    console.log('\n✅ Vidéo dynamique générée avec succès !');
    
    return outputPath;
    
  } catch (error) {
    console.error('\n❌ Erreur render:', error.message);
    throw error;
  }
}

module.exports = { renderDynamicVideo };

// CLI
if (require.main === module) {
  const scriptPath = process.argv[2];
  const audioPath = process.argv[3];
  const outputPath = process.argv[4];
  
  if (!scriptPath || !audioPath || !outputPath) {
    console.error('Usage: node render-video-dynamic.js <script.json> <audio.mp3> <output.mp4>');
    process.exit(1);
  }
  
  (async () => {
    const scriptData = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
    await renderDynamicVideo(scriptData, audioPath, outputPath);
    console.log(`\n🎉 Vidéo créée: ${outputPath}`);
  })();
}
