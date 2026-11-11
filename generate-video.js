#!/usr/bin/env node

/**
 * LinkedIn Video Generator
 * Génère des vidéos LinkedIn à partir des articles blog
 */

require('dotenv').config();
const fsExtra = require('fs');
const fs = fsExtra.promises;
const path = require('path');
const { generateVideoScript } = require('./scripts/generate-script-dynamic'); // Script écrit depuis le plan éditorial
const { genererPlanEditorial } = require('./scripts/editorial-plan');
const { testerComprehension } = require('./scripts/comprehension-test');
const { generateVoiceoverWithFallback } = require('./scripts/generate-voiceover-fallback');
const { renderDynamicVideo } = require('./scripts/render-video-dynamic'); // Nouveau render
const FormData = require('form-data');
const axios = require('axios');

// Configuration
const CONFIG = {
  openaiKey: process.env.OPENAI_API_KEY,
  elevenLabsKey: process.env.ELEVENLABS_API_KEY,
  voiceId: process.env.ELEVENLABS_VOICE_ID,
  outputPath: process.env.VIDEO_OUTPUT_PATH || path.join(__dirname, '..', 'linkedin-videos'),
};

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(__dirname, '..');
const PENDING_ARTICLES_DIR = process.env.PENDING_ARTICLES_DIR || path.join(WORKSPACE_ROOT, 'pending-articles');
const BLOGGER_TOKEN_PATH = process.env.BLOGGER_TOKEN_PATH || path.join(WORKSPACE_ROOT, 'blogger-automation', 'token.json');
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';
// Même source que le bot : .env de ce dossier, quel que soit le dossier courant.
const { token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID } = require(path.join(WORKSPACE_ROOT, 'blogger-automation', 'telegram-config.cjs')).telegramConfig(__dirname);
const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : null;

async function hydrateArticleFromStatus(article) {
  if (!article.id || article.url) {
    return;
  }

  try {
    const statusPath = path.join(PENDING_ARTICLES_DIR, article.id, 'status.json');
    const statusRaw = await fs.readFile(statusPath, 'utf-8');
    const status = JSON.parse(statusRaw);
    article.url = status.blog_url || status.blogUrl || article.url;
    if (!article.driveId) {
      article.driveId = status.drive_id || status.driveId || article.driveId;
    }
    if (article.url) {
      console.log(`✅ URL article récupérée depuis ${statusPath}`);
    }
  } catch (error) {
    console.log(`⚠️  Impossible de charger status.json pour ${article.id}: ${error.message}`);
  }
}

/**
 * Génère une vidéo LinkedIn à partir d'un article
 * @param {Object} article - Objet article {title, content, url}
 */
async function generateLinkedInVideo(article) {
  await hydrateArticleFromStatus(article);
  console.log('🎬 Début génération vidéo LinkedIn...');
  console.log(`📝 Article: ${article.title}`);

  try {
    // Créer le dossier de sortie si nécessaire
    await fs.mkdir(CONFIG.outputPath, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const videoFolder = path.join(CONFIG.outputPath, timestamp);
    await fs.mkdir(videoFolder, { recursive: true });

    // ÉTAPE 0 (obligatoire) : plan éditorial tiré de l'article, enregistré en JSON et vérifié avant le script
    console.log('\\n🧭 Plan éditorial...');
    const plan = await genererPlanEditorial(article);
    await fs.writeFile(path.join(videoFolder, 'editorial-plan.json'), JSON.stringify(plan, null, 2));
    console.log(`✅ Plan éditorial validé (${plan.developpement.length} sous-idées, ${plan.sources.length} source(s))`);

    // ÉTAPES 1 à 3, refaites une fois avec les manques si le test de compréhension échoue
    const produire = async (consignes = []) => {
      // ÉTAPE 1: Script écrit scène par scène depuis le plan
      console.log('\\n📄 Génération du script vidéo...');
      const videoScript = await generateVideoScript(article, plan, { consignes });
      console.log(`✅ Script généré (${videoScript.duration}s estimé)`);
      await fs.writeFile(
        path.join(videoFolder, 'script.json'),
        JSON.stringify(videoScript, null, 2)
      );

      // ÉTAPE 2: Générer la voix-off (ElevenLabs avec fallback)
      console.log('\\n🎙️  Génération de la voix-off...');
      const audioPath = await generateVoiceoverWithFallback(
        videoScript.narration,
        CONFIG.voiceId,
        path.join(videoFolder, 'voiceover.mp3')
      );
      console.log(`✅ Voix-off générée: ${audioPath}`);
    
      // ÉTAPE 2.5: Synchroniser les durées de scènes avec l'audio réel
      const { execSync } = require('child_process');
      const ffprobeCommand = `"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
      let audioDuration = videoScript.duration; // Default fallback
    
      try {
        audioDuration = parseFloat(
          execSync(ffprobeCommand)
            .toString()
            .trim()
        );
      } catch (error) {
        console.log(`   ⚠️  Impossible de lire la durée audio (ffprobe indisponible), utilisation de la durée estimée: ${videoScript.duration}s`);
      }
    
      // Calculer la durée totale actuelle du script
      const scriptTotalDuration = videoScript.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    
      console.log(`\\n⚖️  Synchronisation durées:`);
      console.log(`   Audio: ${audioDuration.toFixed(2)}s`);
      console.log(`   Script original: ${scriptTotalDuration}s`);
    
      // Ajuster proportionnellement toutes les durées de scènes
      const adjustmentRatio = audioDuration / scriptTotalDuration;
      videoScript.scenes = videoScript.scenes.map(scene => ({
        ...scene,
        duration: Math.max(2, scene.duration * adjustmentRatio) // Minimum 2s par scène
      }));
    
      // Recalculer la durée totale ajustée
      const adjustedTotalDuration = videoScript.scenes.reduce((sum, scene) => sum + scene.duration, 0);
      videoScript.duration = adjustedTotalDuration;
    
      console.log(`   Après ajustement: ${adjustedTotalDuration.toFixed(2)}s`);
      console.log(`   ✅ Synchronisé !`);

      // ÉTAPE 3: Render la vidéo dynamique (images + texte + sous-titres)
      console.log('\\n🎬 Création de la vidéo dynamique...');
      const videoPath = await renderDynamicVideo(
        videoScript,
        audioPath,
        path.join(videoFolder, 'video.mp4'),
        article.url // Passer le lien de l'article pour la scène finale
      );
      console.log(`✅ Vidéo créée: ${videoPath}`);
      return { videoScript, videoPath };
    };

    let { videoScript, videoPath } = await produire();

    // ÉTAPE 3.5 (obligatoire) : test de compréhension sur le MP4 final, par un testeur qui n'a pas lu l'article
    console.log('\\n🧪 Test de compréhension...');
    const tester = () => testerComprehension({
      videoPath, srtPath: path.join(videoFolder, 'subtitles.srt'), texteSecours: videoScript.narration, plan, dossier: videoFolder,
    });
    let comprehension = await tester();
    if (!comprehension.ok) {
      console.warn(`⚠️  Test de compréhension échoué :\\n- ${comprehension.manques.join('\\n- ')}\\n   → scènes refaites une fois`);
      await fs.writeFile(path.join(videoFolder, 'comprehension-test-1.json'), JSON.stringify(comprehension, null, 2));
      ({ videoScript, videoPath } = await produire(comprehension.manques.map((m) => `test de compréhension : ${m}`)));
      comprehension = await tester();
    }
    await fs.writeFile(path.join(videoFolder, 'comprehension-test.json'), JSON.stringify(comprehension, null, 2));
    console.log(comprehension.ok ? '✅ Test de compréhension réussi' : `❌ Test de compréhension toujours échoué : ${comprehension.manques.join(' ; ')}`);

    // ÉTAPE 4: Générer les métadonnées LinkedIn
    const metadata = {
      title: article.title,
      caption: generateCaption(article, videoScript),
      comment: `📖 Article complet: ${article.url}`,
      blogUrl: article.url || '',
      articleUrl: article.url || '',
      hashtags: extractHashtags(article),
      sources: plan.sources,
      comprehension: { ok: comprehension.ok, manques: comprehension.manques },
      videoPath: videoPath,
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(videoFolder, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    console.log('\\n✅ VIDÉO PRÊTE !');
    console.log(`📁 Dossier: ${videoFolder}`);
    console.log(`🎥 Vidéo: ${videoPath}`);
    
    // ÉTAPE 5: Upload différé (sera effectué après approbation Telegram)
    const driveUrls = null;

    return {
      success: true,
      videoPath,
      metadata,
      folder: videoFolder,
      driveUrls
    };

  } catch (error) {
    console.error('❌ Erreur génération vidéo:', error.message);
    throw error;
  }
}

/**
 * Génère la légende LinkedIn
 */
function generateCaption(article, script) {
  const hook = script.scenes[0].text;
  // Les sources du plan éditorial sont reprises dans la description
  const sources = (script.sources || []).map((s) => `• ${s.titre}${s.auteur ? ` — ${s.auteur}` : ''}`).join('\n');
  const mainCaption = `${hook}\n\n${script.keyPoints.map((p, i) => `${i + 1}️⃣ ${p}`).join('\n')}\n\n💡 Plus de détails dans l'article complet (lien en commentaire)${sources ? `\n\n📚 Sources :\n${sources}` : ''}`;
  
  return `${mainCaption}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${LINKEDIN_PROCESS_TEXT}`;
}

/**
 * Texte explicatif du processus automatisé (ajouté à chaque publication)
 */
const LINKEDIN_PROCESS_TEXT = `🤖 Cette vidéo a été entièrement générée par l'IA — voici comment.

Après ma programmation initiale sur OpenClaw (orchestrateur IA open-source) + Claude (Anthropic), voici le processus automatisé qui tourne 1× par jour :

1️⃣ Veille automatique — Extraction des newsletters IA (TLDR AI, Rundown AI, Superhuman, The Futurist, TAAFT...) depuis Gmail + recherche web (SerpAPI)
2️⃣ Rédaction — Article de fond généré par GPT-4o à partir des vraies sources, avec plan SEO optionnel
3️⃣ Image blog — Illustration créée par DALL-E 3 ou deAPI.ai (FLUX), hébergée sur ImgBB
4️⃣ Approbation article — Preview sur Telegram : approuver, rejeter, regénérer sur nouveau sujet, ou regénérer avec mon propre prompt/plan SEO
5️⃣ Publication blog — Publié sur Blogger + sauvegarde Google Drive + email
6️⃣ Plan éditorial — Idée principale, accroche, sous-idées avec preuves, limites, conclusion et sources, tirés de l'article et vérifiés avant le script
7️⃣ Script et narration — Une scène par ligne du plan, écrite par Claude Haiku (Anthropic), puis test de compréhension sur la vidéo finale
8️⃣ Voix-off — Narration avec ma voix clonée via ElevenLabs
9️⃣ Images vidéo — Visuels générés par DALL-E 3 + Fal.ai (FLUX Schnell), ou remplacés par mes propres photos/vidéos via Telegram
🔟 Montage — Vidéo assemblée avec sous-titres automatiques (Whisper) via ffmpeg
1️⃣1️⃣ Approbation vidéo — Preview sur Drive, j'approuve ou je remplace des scènes depuis mon iPhone
1️⃣2️⃣ Publication LinkedIn — Uniquement après approbation explicite

💰 Coût par vidéo : ~0.35$
- GPT-4o (article + script) : ~0.08$
- DALL-E 3 / deAPI.ai (image blog + images vidéo) : ~0.18$
- ElevenLabs (voix-off) : ~0.09$

Abonnements : Claude Pro (~14.5€/mois) + OpenAI (~20$/mois)

⚠️ Bugs résolus : narration parasite corrigée, veille web remplacée par SerpAPI, approbation vidéo rendue obligatoire, anti-doublon renforcé.

✅ Système stable et opérationnel.`;

/**
 * Extrait les hashtags de l'article
 */
function extractHashtags(article) {
  // Hashtags par défaut IA
  const defaultHashtags = ['#IA', '#IntelligenceArtificielle', '#Innovation', '#Tech'];
  
  // Extraire des mots-clés du titre
  const keywords = article.title
    .split(' ')
    .filter(word => word.length > 5 && /^[A-ZÉÈÊ]/.test(word))
    .map(word => `#${word.replace(/[^a-zA-ZÀ-ÿ]/g, '')}`);
  
  return [...new Set([...defaultHashtags, ...keywords.slice(0, 3)])].slice(0, 5);
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadMetadata(videoFolder) {
  try {
    const raw = await fs.readFile(path.join(videoFolder, 'metadata.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function loadDriveLinks(videoFolder, driveUrls) {
  if (driveUrls) {
    return driveUrls;
  }
  try {
    const raw = await fs.readFile(path.join(videoFolder, 'drive-links.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function sendTelegramVideoNotification(videoFolder, videoId, article, driveUrls) {
  if (!TELEGRAM_API_BASE || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️  Notification Telegram vidéo ignorée (token/chat ID manquant)');
    return;
  }
  const metadata = await loadMetadata(videoFolder);
  const driveLinks = await loadDriveLinks(videoFolder, driveUrls);
  const title = metadata.title || article.title || 'Vidéo LinkedIn prête';
  const captionPreview = metadata.caption ? metadata.caption.slice(0, 500) : null;
  const parts = [
    '🎬 <b>Vidéo LinkedIn prête</b>',
    `<b>ID :</b> <code>${escapeHtml(videoId)}</code>`,
    `<b>Titre :</b> ${escapeHtml(title)}`
  ];
  if (article.url) {
    parts.push(`<b>Article :</b> ${escapeHtml(article.url)}`);
  }
  if (driveLinks?.videoUrl) {
    parts.push(`<b>Vidéo :</b> ${escapeHtml(driveLinks.videoUrl)}`);
  }
  if (driveLinks?.recapUrl) {
    parts.push(`<b>Récap :</b> ${escapeHtml(driveLinks.recapUrl)}`);
  }
  if (metadata.comprehension) {
    parts.push(metadata.comprehension.ok
      ? '🧪 <b>Test de compréhension :</b> réussi'
      : `🧪 <b>Test de compréhension : ÉCHOUÉ</b>\n${metadata.comprehension.manques.map((m) => `• ${escapeHtml(m)}`).join('\n')}`);
  }
  if (captionPreview) {
    parts.push(`<b>Légende :</b> ${escapeHtml(captionPreview)}${metadata.caption && metadata.caption.length > 500 ? '…' : ''}`);
  }
  parts.push('<b>Commandes :</b>',
    `<code>approuve vidéo ${escapeHtml(videoId)}</code>`,
    `<code>rejette vidéo ${escapeHtml(videoId)}</code>`,
    `<code>remplace scène X ${escapeHtml(videoId)}</code>`);
  parts.push('📎 Ajoute l\'image ou la vidéo en pièce jointe du même message pour remplacer une scène.');
  const text = parts.join('\n\n');
  await axios.post(`${TELEGRAM_API_BASE}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'HTML',
    reply_markup: require(path.join(__dirname, '..', 'blogger-automation', 'telegram-ui.cjs')).videoButtons(videoId)
  });
  console.log('✅ Notification Telegram envoyée');
}

async function sendVideoFileToTelegram(videoPath, videoId, article) {
  if (!TELEGRAM_API_BASE || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️  Impossible d'envoyer la vidéo sur Telegram (bot non configuré)");
    return;
  }

  try {
    await fs.access(videoPath);
  } catch (error) {
    console.warn('⚠️  Vidéo absente, envoi Telegram annulé:', error.message);
    return;
  }

  try {
    const captionParts = [
      '🎬 <b>Vidéo à approuver</b>',
      `<b>ID :</b> <code>${escapeHtml(videoId)}</code>`
    ];
    if (article.title) {
      captionParts.push(`<b>Titre :</b> ${escapeHtml(article.title)}`);
    }
    if (article.url) {
      captionParts.push(`<b>Article :</b> ${escapeHtml(article.url)}`);
    }
    captionParts.push('<b>Commandes :</b>',
      `<code>approuve vidéo ${escapeHtml(videoId)}</code>`,
      `<code>rejette vidéo ${escapeHtml(videoId)}</code>`,
      `<code>remplace scène X ${escapeHtml(videoId)}</code>`);
    const caption = captionParts.join('\n');

    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('video', fsExtra.createReadStream(videoPath));
    form.append('supports_streaming', 'true');
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');

    await axios.post(`${TELEGRAM_API_BASE}/sendVideo`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    console.log('✅ Vidéo envoyée sur Telegram');
  } catch (error) {
    console.error('⚠️  Envoi vidéo Telegram échoué:', error.message);
  }
}

/**
 * Envoie la vidéo à Pierre sur Telegram pour approbation
 */
async function sendVideoForApproval(videoPath, article, driveUrls) {
  console.log('\n📱 Envoi de la vidéo pour approbation...');
  
  // Génère un ID unique pour la vidéo
  const videoId = path.basename(path.dirname(videoPath));
  
  // Crée un fichier de status
  const statusPath = path.join(path.dirname(videoPath), 'status.json');
  const status = {
    id: videoId,
    article_title: article.title,
    video_path: videoPath,
    status: 'pending_approval',
    created_at: new Date().toISOString(),
    approved_at: null,
    published_at: null,
    modifications: []
  };
  
  await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
  
  // Envoie le chemin de la vidéo dans un fichier lisible
  const approvalPath = path.join(path.dirname(videoPath), 'APPROVAL.txt');
  const approvalText = `🎬 VIDÉO GENERÉE POUR APPROBATION
═════════════════════════════════════════
ID: ${videoId}
Article: ${article.title}
Vidéo: ${videoPath}

COMMANDES:
• approuve vidéo ${videoId}
• rejette vidéo ${videoId}
═════════════════════════════════════════`;
  
  await fs.writeFile(approvalPath, approvalText);
  
  console.log(`✅ Fichiers d'approbation créés: ${approvalPath}`);
  console.log(`\n📹 Vidéo prête pour approbation: ${videoId}`);
  console.log(`Chemin: ${videoPath}`);
  
  await sendVideoFileToTelegram(videoPath, videoId, article);
  // Envoie une notification à Pierre (texte récap)
  await sendTelegramVideoNotification(path.dirname(videoPath), videoId, article, driveUrls);
  console.log(`\n__VIDEO_READY__${JSON.stringify({
    id: videoId,
    title: article.title,
    path: videoPath
  })}__END__`);
}

// Export pour utilisation en module
module.exports = { generateLinkedInVideo, sendVideoForApproval };

// Exécution CLI (seulement quand appelé directement)
if (require.main === module) {
  const articlePath = process.argv[2];
  
  if (!articlePath) {
    console.error('Usage: node generate-video.js <article.json>');
    process.exit(1);
  }

  (async () => {
    try {
      const articleData = JSON.parse(await fs.readFile(articlePath, 'utf-8'));
      const result = await generateLinkedInVideo(articleData);
      
      // Envoie la vidéo pour approbation au lieu de la publier directement
      if (result && result.success && result.videoPath) {
        await sendVideoForApproval(result.videoPath, articleData, result.driveUrls);
      } else {
        console.error('❌ Génération vidéo échouée:', result);
        process.exit(1);
      }
    } catch (error) {
      console.error('\n❌ ERREUR FATALE:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}
