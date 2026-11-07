#!/usr/bin/env node
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const { fal } = require('@fal-ai/client');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const EDGE_TTS = '/usr/local/Caskroom/mambaforge/base/bin/edge-tts';
const FFMPEG = process.env.FFMPEG_PATH || '/usr/local/bin/ffmpeg';
const VOICE = 'fr-FR-HenriNeural';
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
fal.config({ credentials: process.env.FAL_API_KEY });

const THEME = { bg_dark: '1a1a2e', bg_light: 'f8f9fa', accent: 'e94560', blue: '0f3460', text_light: 'ffffff', text_dark: '1a1a2e' };


async function fetchArticleContent(url) {
  if (!url) return '';
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Extraire le texte principal en supprimant les balises HTML
        const text = data
          .replace(/<script[^>]*>[sS]*?</script>/gi, '')
          .replace(/<style[^>]*>[sS]*?</style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 4000);
        resolve(text);
      });
      res.on('error', () => resolve(''));
    }).on('error', () => resolve(''));
  });
}

async function generateSlideContent(title, body, intro, source) {
  console.log('\n🤖 Génération slides avec Claude Sonnet...');
  const prompt = `Tu es expert en création de slides LinkedIn techniques et percutantes.

ARTICLE SOURCE :
TITRE: ${title}
INTRO: ${intro}
CONTENU: ${body.substring(0, 3000)}

MISSION : Extrais les informations CONCRÈTES de cet article pour créer 10 slides percutantes.

RÈGLES ABSOLUES :
- Utilise UNIQUEMENT les chiffres et faits réels présents dans l'article
- Chaque slide doit apporter une information ACTIONNABLE
- Texte slide : max 8 mots par ligne, max 3 lignes
- Narration : 20-30 mots, ton direct et expert
- Noms réels uniquement (pas de modèles inventés)
- Au moins 2 slides avec des chiffres précis extraits de l'article
- Au moins 1 slide avec des étapes numérotées concrètes
- Au moins 1 slide comparaison avant/après ou outil A vs B

STRUCTURE IMPOSÉE :
1. hook : stat choc ou fait surprenant tiré de l'article
2. problem : problème concret que l'outil résout
3. solution : l'outil/méthode avec son nom réel
4. stat : chiffre clé réel (vitesse, coût, performance)
5. howto : 3 étapes concrètes pour utiliser l'outil
6. comparison : tableau avant/après ou outil A vs B avec chiffres
7. tip : conseil actionnable tiré de l'article
8. stat : second chiffre clé ou benchmark réel
9. tip : piège à éviter ou erreur courante
10. cta : action précise à faire maintenant

JSON UNIQUEMENT sans backticks :
{"title":"Titre court max 8 mots","slides":[{"type":"hook","headline":"Fait choc en max 8 mots","subtext":"Contexte en max 6 mots","narration":"Phrase percutante 20-30 mots avec chiffre réel","emoji":"⚡"}]}`;

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 2000,
    system: 'Réponds UNIQUEMENT en JSON valide sans backticks.',
    messages: [{ role: 'user', content: prompt }]
  });
  let raw = r.content[0].text.trim().replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  return JSON.parse(raw);
}


async function generateSlideImages(slides, workDir) {
  console.log('🎨 Génération images Fal.ai FLUX...');
  const imagesDir = workDir + '/fal-images';
  fs.mkdirSync(imagesDir, { recursive: true });
  
  const imagePaths = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const imgPath = imagesDir + '/img-' + i + '.jpg';
    
    try {
      const result = await fal.subscribe('fal-ai/flux/schnell', {
        input: {
          prompt: slide.imagePrompt || 'abstract technology background, cinematic, no text',
          image_size: 'landscape_16_9',
          num_inference_steps: 4,
          num_images: 1
        }
      });
      
      const imageUrl = result.data.images[0].url;
      const response = await fetch(imageUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(imgPath, buffer);
      imagePaths.push(imgPath);
      console.log('  ✅ Image ' + (i+1) + '/' + slides.length);
    } catch(e) {
      console.log('  ⚠️  Image ' + (i+1) + ' échouée, fond uni utilisé');
      imagePaths.push(null);
    }
  }
  return imagePaths;
}

function createPresentation(slideData, outputPath, imagePaths = []) {
  console.log('📊 Création PowerPoint avec', imagePaths.filter(Boolean).length, 'images...');
  
  const code = `
const pptxgen = require('pptxgenjs');
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
const T = ${JSON.stringify(THEME)};
const slides = ${JSON.stringify(slideData.slides)};
  const imagePaths = ${JSON.stringify(imagePaths)};
slides.forEach((slide, i) => {
  const s = pres.addSlide();
  const dark = ['hook','cta','stat'].includes(slide.type);
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:'100%',h:'100%',fill:{color:dark?T.bg_dark:T.bg_light},line:{color:dark?T.bg_dark:T.bg_light}});
  // Image de fond
  const imgPath = imagePaths[i];
  if(imgPath) {
    s.addImage({path: imgPath, x:0, y:0, w:'100%', h:'100%', sizing:{type:'cover',w:'100%',h:'100%'}});
    // Overlay sombre pour lisibilité
    s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:'100%',h:'100%',fill:{color:'000000',transparency:45},line:{color:'000000',transparency:100}});
  }
  // Bande colorée haut
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:'100%',h:0.12,fill:{color:T.accent},line:{color:T.accent}});
  // Emoji grand format
  if(slide.emoji) s.addText(slide.emoji,{x:0.4,y:0.25,w:1.8,h:1.8,fontSize:72,align:'center',margin:0});
  // Headline centré grand
  const hl = slide.headline;
  s.addText(hl,{x:0.4,y:slide.emoji?1.9:0.8,w:12.5,h:3.0,fontSize:hl.length>35?38:hl.length>20?46:56,bold:true,color:imgPath?'ffffff':(dark?'ffffff':'111827'),fontFace:'Arial Black',align:'center',valign:'middle',margin:0,wrap:true});
  // Ligne accent centrée
  s.addShape(pres.shapes.RECTANGLE,{x:4.5,y:4.9,w:4.3,h:0.06,fill:{color:T.accent},line:{color:T.accent}});
  // Subtext centré mis en valeur
  if(slide.subtext) s.addText(slide.subtext,{x:0.4,y:5.1,w:12.5,h:0.9,fontSize:26,color:imgPath?'e2e8f0':(dark?'e94560':'0f3460'),fontFace:'Arial',align:'center',bold:true,margin:0});
  // Badge type
  s.addShape(pres.shapes.RECTANGLE,{x:0.4,y:6.75,w:2.4,h:0.5,fill:{color:T.accent},line:{color:T.accent}});
  s.addText(slide.type.toUpperCase(),{x:0.4,y:6.75,w:2.4,h:0.5,fontSize:11,color:'ffffff',fontFace:'Arial',bold:true,align:'center',valign:'middle',margin:0,charSpacing:2});
  // Numéro slide
  s.addText((i+1)+'/'+slides.length,{x:11.8,y:6.85,w:1.1,h:0.4,fontSize:11,color:'cccccc',fontFace:'Arial',align:'right',margin:0});
});
pres.writeFile({fileName:'${outputPath}'}).then(()=>console.log('PPTX OK')).catch(e=>{console.error(e);process.exit(1);});`;
  const tmp = outputPath + '_gen.js';
  fs.writeFileSync(tmp, code);
  execSync(`node ${tmp}`, { stdio: 'inherit' });
  fs.unlinkSync(tmp);
}

function convertToImages(pptxPath, outputDir) {
  console.log('🖼️  Conversion slides en images...');
  fs.mkdirSync(outputDir, { recursive: true });
  execSync(`soffice --headless --convert-to pdf "${pptxPath}" --outdir "${outputDir}"`, { stdio: 'pipe' });
  const pdfPath = path.join(outputDir, path.basename(pptxPath, '.pptx') + '.pdf');
  execSync(`pdftoppm -jpeg -r 150 "${pdfPath}" "${path.join(outputDir, 'slide')}"`, { stdio: 'pipe' });
  const images = fs.readdirSync(outputDir).filter(f => f.startsWith('slide') && f.endsWith('.jpg')).sort().map(f => path.join(outputDir, f));
  console.log(`${images.length} images générées`);
  return images;
}

async function generateVoiceover(slides, outputPath) {
  console.log('🎙️  Génération voix-off...');
  const narration = slides.map(s => s.narration).join(' ');
  const tmp = outputPath + '.txt';
  fs.writeFileSync(tmp, narration);
  execSync(`${EDGE_TTS} --voice "${VOICE}" --file "${tmp}" --write-media "${outputPath}"`, { timeout: 60000 });
  fs.unlinkSync(tmp);
  return narration;
}

function assembleVideo(images, voiceoverPath, outputPath) {
  console.log('🎬 Assemblage vidéo...');
  const concatPath = outputPath + '_concat.txt';
  const lines = images.map(img => `file '${img}'\nduration 8`).join('\n');
  fs.writeFileSync(concatPath, lines);
  execSync(`${FFMPEG} -f concat -safe 0 -i "${concatPath}" -i "${voiceoverPath}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=1a1a2e" -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -shortest "${outputPath}" -y`, { stdio: 'pipe' });
  fs.unlinkSync(concatPath);
}

async function main() {
  const videoFolder = process.argv[2];
  if (!videoFolder) { console.error('Usage: node generate-pptx-video.js <video-folder>'); process.exit(1); }
  const source = JSON.parse(fs.readFileSync(path.join(videoFolder, 'script.json'), 'utf-8'));
source.body = source.scenes ? source.scenes.map(s => s.narration).join(' ') : '';
source.intro = source.hook || '';
  const workDir = path.join(videoFolder, 'pptx-work');
  fs.mkdirSync(workDir, { recursive: true });
  const slideData = await generateSlideContent(source.title, source.body || '', source.intro || '');
  fs.writeFileSync(path.join(workDir, 'slides.json'), JSON.stringify(slideData, null, 2));
  console.log(`${slideData.slides.length} slides`);
  const imagePaths = await generateSlideImages(slideData.slides, workDir);
  const pptxPath = path.join(workDir, 'presentation.pptx');
  createPresentation(slideData, pptxPath, imagePaths);
  const images = convertToImages(pptxPath, path.join(workDir, 'images'));
  const voiceoverPath = path.join(videoFolder, 'voiceover.mp3');
  await generateVoiceover(slideData.slides, voiceoverPath);
  assembleVideo(images, voiceoverPath, path.join(videoFolder, 'video.mp4'));
  console.log('\n✅ VIDÉO PPTX GÉNÉRÉE AVEC SUCCÈS');
}
main();
