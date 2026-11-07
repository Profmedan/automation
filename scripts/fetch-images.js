#!/usr/bin/env node

/**
 * Récupère des images pour les vidéos
 * Sources : DALL-E (haute qualité) + Fal.ai (économique, photoréaliste)
 * ❌ PLUS DE SLIDES UNICOLORES
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// API Keys
const DEAPI_KEY = process.env.DEAPI_API_KEY;
const FAL_KEY = process.env.FAL_API_KEY;

/**
 * Génère une image avec DALL-E 3 (fetch direct — sans SDK)
 * Coût : ~0.04$ par image 1024x1024 standard quality
 */
async function generateDalleImage(prompt) {
  try {
    console.log(`   🎨 DALL-E 3: "${prompt.substring(0, 50)}..."`);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DALL-E API erreur ${response.status}: ${err}`);
    }

    const data = await response.json();
    return {
      url: data.data[0].url,
      downloadUrl: data.data[0].url,
      author: 'DALL-E 3',
      authorUrl: null,
      provider: 'dalle'
    };
  } catch (error) {
    console.error(`⚠️  Erreur DALL-E:`, error.message);
    return null;
  }
}

/**
 * Génère une image avec deAPI.ai (ZImageTurbo)
 */
async function generateDeapiImage(prompt) {
  if (!DEAPI_KEY) {
    console.error('   ⚠️  DEAPI_API_KEY manquante dans .env');
    return null;
  }

  try {
    console.log(`   🤖 deAPI.ai: "${prompt.substring(0, 50)}..."`);
    const init = await axios.post('https://api.deapi.ai/api/v1/client/txt2img', {
      prompt,
      model: 'ZImageTurbo_INT8',
      width: 1024,
      height: 1024,
      guidance: 3.5,
      steps: 4,
      seed: -1
    }, {
      headers: {
        'Authorization': `Bearer ${DEAPI_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const requestId = init.data?.data?.request_id;
    if (!requestId) throw new Error('Pas de request_id deAPI');

    const deadline = Date.now() + 120000;
    let resultUrl = null;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await axios.get(`https://api.deapi.ai/api/v1/client/request-status/${requestId}`, {
        headers: { 'Authorization': `Bearer ${DEAPI_KEY}` }
      });
      const payload = poll.data?.data || {};
      if ((payload.status === 'done' || payload.status === 'completed') && payload.result_url) {
        resultUrl = payload.result_url;
        break;
      }
      if (payload.status === 'error') {
        throw new Error(payload.error || 'Job deAPI en erreur');
      }
    }

    if (!resultUrl) throw new Error('Timeout deAPI 120s sans résultat');

    return {
      url: resultUrl,
      downloadUrl: resultUrl,
      author: 'deAPI.ai (ZImageTurbo)',
      authorUrl: null,
      provider: 'deapi'
    };
  } catch (error) {
    console.error('⚠️  Erreur deAPI:', error.message);
    return null;
  }
}

/**
 * Génère une image avec Fal.ai (FLUX ou autre modèle)
 * Coût : ~0.0027$ par image 1024x1024 (4 steps)
 * Doc: https://docs.fal.ai/
 */
async function generateFalImage(prompt) {
  if (!FAL_KEY) {
    console.error('   ⚠️  FAL_API_KEY manquante dans .env');
    return null;
  }

  try {
    console.log(`   ⚡ Fal.ai FLUX Schnell: "${prompt.substring(0, 50)}..."`);
    const { fal } = require('@fal-ai/client');
    fal.config({ credentials: FAL_KEY });
    
    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: { prompt: prompt, image_size: 'square_hd', num_images: 1 },
      logs: false,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') console.log(`   ⏳ Fal.ai: en cours...`);
      }
    });
    
    const imageUrl = result.data?.images?.[0]?.url;
    if (!imageUrl) throw new Error('Pas d\'URL image dans la réponse Fal.ai');
    console.log(`   ✅ Fal.ai image prête`);
    return { url: imageUrl, downloadUrl: imageUrl, author: 'Fal.ai (FLUX Schnell)', authorUrl: null, provider: 'fal' };

  } catch (error) {
    console.error(`⚠️  Erreur Fal.ai:`, error.message);
    return null;
  }
}

/**
 * Télécharge une image
 */
async function downloadImage(imageData, outputPath) {
  const response = await axios.get(imageData.downloadUrl || imageData.url, {
    responseType: 'arraybuffer'
  });

  await fs.writeFile(outputPath, response.data);
  return outputPath;
}

/**
 * Génère les images pour une vidéo
 * Mix DALL-E (qualité) + Fal.ai (économique)
 * ❌ PLUS DE FALLBACK FOND UNI : toujours génération IA
 */
async function generateVideoImages(scriptData, outputDir) {
  console.log('🖼️  Génération des images IA (mix DALL-E + Fal.ai)...');
  console.log('   ❌ Fini les slides unicolores !');

  await fs.mkdir(outputDir, { recursive: true });

  const images = [];
  const scenes = scriptData.scenes;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const outputPath = path.join(outputDir, `image_${i}.jpg`);

    console.log(`   Image ${i + 1}/${scenes.length} - ${scene.visualType}`);

    // OVERRIDE UTILISATEUR : utiliser le média fourni si disponible
    const userOverride = scriptData.userMediaOverrides?.[i];
    if (userOverride?.imagePath) {
      console.log(`   ✅ Média utilisateur détecté pour scène ${i + 1}`);
      images.push({
        path: userOverride.imagePath,
        type: 'user',
        scene: scene,
        credit: 'Média utilisateur',
        withSubtitles: userOverride.withSubtitles !== false
      });
      continue;
    }

    let imageData = null;

    // STRATÉGIE DE GÉNÉRATION :
    // - 70% des scènes via deAPI.ai (rapide/éco)
    // - 30% via DALL-E 3 (haute qualité) + CTA/titres forcés sur DALL-E
    // - Fal.ai devient un fallback uniquement

    const forceDalle = (scene.visualType === 'title' || scene.visualType === 'cta');
    const primaryProvider = forceDalle
      ? 'dalle'
      : (Math.random() < 0.7 ? 'deapi' : 'dalle');

    // Utiliser le prompt unique généré par GPT-4o pour cette scène
    const prompt = scene.imagePrompt
      ? scene.imagePrompt + ', no text, no words, no letters, photorealistic, 8K'
      : `cinematic scene about ${scriptData.title}, dramatic lighting, photorealistic, no text, no words`;

    if (primaryProvider === 'deapi') {
      imageData = await generateDeapiImage(prompt);
    } else {
      imageData = await generateDalleImage(prompt);
    }

    // Fallback : basculer sur l'autre fournisseur
    if (!imageData) {
      console.log(`   🔄 Fallback vers ${primaryProvider === 'deapi' ? 'DALL-E' : 'deAPI'}...`);
      imageData = primaryProvider === 'deapi'
        ? await generateDalleImage(prompt)
        : await generateDeapiImage(prompt);
    }

    // Dernier recours : Fal.ai
    if (!imageData) {
      console.log(`   🔄 Fallback Fal.ai...`);
      imageData = await generateFalImage(prompt);
    }

    // Dernier recours bis avec prompt simplifié
    if (!imageData) {
      console.log(`   🔄 Retry Fal.ai avec prompt simplifié...`);
      const simplePrompt = `cinematic tech scene, dramatic lighting, photorealistic, no text, no words`;
      imageData = await generateFalImage(simplePrompt);
    }

    // Si vraiment aucune API ne fonctionne, lever une erreur
    if (!imageData) {
      throw new Error(`❌ Impossible de générer l'image ${i + 1}. Vérifier les clés API OPENAI_API_KEY et FAL_API_KEY.`);
    }

    // Télécharger l'image
    try {
      await downloadImage(imageData, outputPath);
      const provider = imageData.provider || (imageData.author.includes('DALL-E') ? 'dalle' : 'fal');
      images.push({
        path: outputPath,
        type: provider,
        scene: scene,
        credit: imageData.author
      });
      console.log(`   ✓ ${imageData.author} - Sauvegardée`);
    } catch (error) {
      console.error(`   ❌ Échec téléchargement:`, error.message);
      throw error; // Pas de fallback fond uni !
    }
  }

  const dalleCount = images.filter(img => img.type === 'dalle').length;
  const falCount = images.filter(img => img.type === 'fal').length;
  const deapiCount = images.filter(img => img.type === 'deapi').length;

  console.log(`\n   ✅ ${images.length} images générées : ${deapiCount}× deAPI, ${dalleCount}× DALL-E, ${falCount}× Fal.ai`);

  return images;
}

/**
 * Génère un prompt adapté pour génération d'images IA
 * Compatible DALL-E et Fal.ai
 */
function generateImagePrompt(scene, videoTitle) {
  // Base : style photoréaliste professionnel
  const basePrompt = `Professional, photorealistic image for social media video about: ${videoTitle}. `;

  if (scene.visualType === 'title') {
    return basePrompt + `Eye-catching hero image, bold, vibrant colors, tech-focused. Style: modern gradient background, abstract tech elements, minimalist design, high-end corporate aesthetic.`;
  }

  if (scene.visualType === 'stat') {
    return basePrompt + `Data visualization, modern infographic style with charts and numbers. Clean, professional, emphasis on growth metrics. Photorealistic 3D rendering, corporate design, blue and orange accent colors.`;
  }

  if (scene.visualType === 'visual') {
    return basePrompt + `Conceptual photorealistic illustration: ${scene.text.substring(0, 100)}. Modern, colorful, tech aesthetic. Clear concept, studio lighting, professional photography style.`;
  }

  if (scene.visualType === 'cta') {
    return basePrompt + `Call to action visual, engaging, bright accent colors, forward motion or arrow elements. Style: modern digital marketing, clean design, photorealistic 3D objects.`;
  }

  // Fallback : scène générique
  return basePrompt + `Scene related to: ${scene.text.substring(0, 100)}. Professional photography style, modern, high-quality, suitable for LinkedIn corporate content. Studio lighting, vibrant but professional colors.`;
}

module.exports = {
  generateVideoImages,
  generateDalleImage,
  generateFalImage
};

// CLI
if (require.main === module) {
  const scriptPath = process.argv[2];
  const outputDir = process.argv[3];

  if (!scriptPath || !outputDir) {
    console.error('Usage: node fetch-images.js <script.json> <output-dir>');
    process.exit(1);
  }

  (async () => {
    const scriptData = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
    const images = await generateVideoImages(scriptData, outputDir);
    console.log(`\n✅ ${images.length} images générées/récupérées`);
  })();
}
