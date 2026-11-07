require('dotenv/config');
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const SCRIPT_DIR = __dirname;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(SCRIPT_DIR, '..');
const PENDING_ARTICLES_DIR = process.env.PENDING_ARTICLES_DIR || path.join(WORKSPACE_ROOT, 'pending-articles');
const LINKEDIN_VIDEOS_DIR = path.join(WORKSPACE_ROOT, 'linkedin-videos');
const LINKEDIN_AUTOMATION_PATH = path.join(WORKSPACE_ROOT, 'linkedin-video-automation');
const BLOGGER_AUTOMATION_PATH = path.join(WORKSPACE_ROOT, 'blogger-automation');
const MEDIA_INBOUND_DIR = path.join(WORKSPACE_ROOT, '..', 'media', 'inbound');
const TELEGRAM_STATE_PATH = path.join(WORKSPACE_ROOT, 'automation-state', 'telegram-state.json');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : null;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant.');
  process.exit(1);
}

let running = true;
let fullRunInProgress = false;
const requestStop = (signal) => {
  console.log(`\n🛑 (${signal}) Arrêt demandé, fermeture du bot Telegram...`);
  running = false;
};
process.on('SIGINT', () => requestStop('SIGINT'));
process.on('SIGTERM', () => requestStop('SIGTERM'));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureStateDir() {
  await fs.mkdir(path.dirname(TELEGRAM_STATE_PATH), { recursive: true });
}

async function loadState() {
  try {
    const raw = await fs.readFile(TELEGRAM_STATE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { offset: 0 };
  }
}

async function saveState(state) {
  await ensureStateDir();
  await fs.writeFile(TELEGRAM_STATE_PATH, JSON.stringify(state, null, 2));
}

function normalizeText(value = '') {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramMessage(text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('❌ Erreur envoi Telegram:', error.response?.data || error.message);
  }
}

function pickTelegramMedia(message) {
  if (message.document) {
    return { type: 'document', payload: message.document };
  }
  if (message.video) {
    return { type: 'video', payload: message.video };
  }
  if (Array.isArray(message.photo) && message.photo.length) {
    return { type: 'photo', payload: message.photo[message.photo.length - 1] };
  }
  if (message.animation) {
    return { type: 'animation', payload: message.animation };
  }
  return null;
}

async function downloadTelegramFile(fileId, filenameHint) {
  if (!TELEGRAM_API) {
    throw new Error('API Telegram non initialisée');
  }
  const fileResponse = await axios.get(`${TELEGRAM_API}/getFile`, { params: { file_id: fileId } });
  const filePath = fileResponse.data?.result?.file_path;
  if (!filePath) {
    throw new Error('file_path introuvable pour le média Telegram');
  }
  const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
  await fs.mkdir(MEDIA_INBOUND_DIR, { recursive: true });
  const safeName = (filenameHint || path.basename(filePath)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const finalName = `${Date.now()}_${safeName}`;
  const destPath = path.join(MEDIA_INBOUND_DIR, finalName);
  const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
  await fs.writeFile(destPath, Buffer.from(response.data));
  return destPath;
}

async function ensurePollingMode() {
  if (!TELEGRAM_API) {
    return;
  }
  try {
    const info = await axios.get(`${TELEGRAM_API}/getWebhookInfo`);
    const url = info.data?.result?.url;
    if (url) {
      console.log(`⚙️  Webhook détecté (${url}) → suppression pour getUpdates`);
      await axios.post(`${TELEGRAM_API}/deleteWebhook`, { drop_pending_updates: false });
    }
  } catch (error) {
    console.warn('⚠️  Impossible de vérifier/supprimer le webhook:', error.response?.data || error.message);
  }
}

async function fetchUpdates(offset) {
  try {
    const response = await axios.get(`${TELEGRAM_API}/getUpdates`, {
      params: {
        timeout: 25,
        offset
      }
    });
    if (!response.data?.ok) {
      throw new Error(response.data?.description || 'Réponse Telegram invalide');
    }
    return response.data.result || [];
  } catch (error) {
    const detail = error.response?.data?.description || error.message;
    throw new Error(detail);
  }
}

async function runNodeScript(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', args, {
      cwd: options.cwd || SCRIPT_DIR,
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function getLatestPendingArticleId() {
  try {
    const entries = await fs.readdir(PENDING_ARTICLES_DIR, { withFileTypes: true });
    const sorted = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .sort()
      .reverse();

    for (const folder of sorted) {
      try {
        const statusPath = path.join(PENDING_ARTICLES_DIR, folder, 'status.json');
        const raw = await fs.readFile(statusPath, 'utf-8');
        const status = JSON.parse(raw);
        if (status.status === 'pending_approval') {
          return folder;
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.warn('⚠️  Impossible de lister les pending-articles:', error.message);
  }
  return null;
}

async function getLatestPublishedArticleId() {
  try {
    const entries = await fs.readdir(PENDING_ARTICLES_DIR, { withFileTypes: true });
    const sorted = entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .sort()
      .reverse();

    for (const folder of sorted) {
      try {
        const statusPath = path.join(PENDING_ARTICLES_DIR, folder, 'status.json');
        const raw = await fs.readFile(statusPath, 'utf-8');
        const status = JSON.parse(raw);
        if (status.status === 'published') {
          return folder;
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.warn('⚠️  Impossible de lister les articles publiés:', error.message);
  }
  return null;
}

function splitIdAndText(text = '') {
  const trimmed = text.trim();
  if (!trimmed) {
    return { id: null, remainder: '' };
  }
  const parts = trimmed.split(/\s+/);
  const id = parts.shift();
  const remainder = parts.length ? trimmed.slice(id.length).trim() : '';
  return { id, remainder };
}

function splitSubjectAndSource(text = '') {
  const trimmed = text.trim();
  if (!trimmed) {
    return { subject: null, source: null };
  }
  const tokens = trimmed.split(/\s+/);
  const sourceIndex = tokens.findIndex((token) => /^https?:\/\//i.test(token) || token.includes(':'));

  if (sourceIndex >= 0) {
    const source = tokens[sourceIndex];
    const subjectParts = tokens.slice(0, sourceIndex);
    const subject = subjectParts.length ? subjectParts.join(' ') : null;
    return { subject, source };
  }

  return { subject: trimmed, source: null };
}

function extractBlogUrl(text = '') {
  const match = text.match(/https?:\/\/[^\s]+blogspot[^\s]*/i);
  return match ? match[0] : null;
}

function looksLikeVideoId(id) {
  if (!id) return false;
  return /\d{4}-\d{2}-\d{2}T/.test(id);
}

function parseCommand(originalText) {
  const trimmed = originalText.trim();
  const normalized = normalizeText(trimmed);

  const numericMatch = normalized.match(/^(\d)(?:\s+(.*))?$/);
  if (numericMatch) {
    const choice = numericMatch[1];
    const hasRest = originalText.includes(' ');
    const originalRest = hasRest ? originalText.slice(originalText.indexOf(' ') + 1).trim() : '';

    if (choice === '1') {
      const { id } = splitIdAndText(originalRest);
      return { type: 'approve_article', id }; 
    }

    if (choice === '2') {
      const { id, remainder } = splitIdAndText(originalRest);
      return { type: 'modify_article', id, instructions: remainder };
    }

    if (choice === '3') {
      const { subject, source } = splitSubjectAndSource(originalRest);
      return { type: 'generate_article', subject, source };
    }
  }

  const approveMatch = trimmed.match(/approuve\s+article\s+(\S+)/i);
  if (approveMatch) {
    return { type: 'approve_article', id: approveMatch[1] };
  }

  const nouvelMatch = trimmed.match(/nouvel\s+article(?:\s+complet)?\s*(.*)/i);
  if (nouvelMatch) {
    let remainder = (nouvelMatch[1] || '').trim();
    remainder = remainder.replace(/^sur\s+/i, '').trim();
    const { subject, source } = splitSubjectAndSource(remainder);
    return { type: 'generate_article', subject, source };
  }

  const replaceMatch = trimmed.match(/remplace\s+sc[ée]ne\s+(\d+)\s+(\S+)(.*)/i);
  if (replaceMatch) {
    const sceneNumber = parseInt(replaceMatch[1], 10);
    const videoId = replaceMatch[2];
    const tail = replaceMatch[3] || '';
    const noSubtitles = /sans\s+sous[-\s]?titres/i.test(tail);
    return { type: 'replace_scene', videoId, sceneNumber, withSubtitles: !noSubtitles };
  }

  // Video approval: approuve vidéo <id>
  const approveVideoMatch = trimmed.match(/approuve\s+vid[ée]o\s+(\S+)/i);
  if (approveVideoMatch) {
    return { type: 'approve_video', id: approveVideoMatch[1] };
  }

  // Video rejection: rejette vidéo <id>
  const rejectVideoMatch = trimmed.match(/rejette\s+vid[ée]o\s+(\S+)/i);
  if (rejectVideoMatch) {
    return { type: 'reject_video', id: rejectVideoMatch[1] };
  }

  // Full run: run complet (variantes: /run complet, run complet maintenant, lance run complet)
  const runMatch = trimmed.match(/^\/?run\s+complet(?:\s+(\S+))?/i);
  if (runMatch) {
    return { type: 'run_full_video', id: runMatch[1] || null };
  }
  const runAltMatch = trimmed.match(/^lance\s+run\s+complet(?:\s+(\S+))?/i);
  if (runAltMatch) {
    return { type: 'run_full_video', id: runAltMatch[1] || null };
  }

  return null;
}

async function handleApproveArticle(id) {
  let articleId = id;
  if (!articleId) {
    articleId = await getLatestPendingArticleId();
    if (!articleId) {
      await sendTelegramMessage('⚠️ Aucun article en attente trouvé. Précisez l\'ID, ex: <code>1 2026-03-24T08-27-12</code>.');
      return;
    }
  }

  console.log(`🟢 Publication demandée pour l'article ${articleId}`);
  await sendTelegramMessage(`⏳ Publication en cours pour l'article <code>${escapeHtml(articleId)}</code>...`);
  const result = await runNodeScript(['index.js', 'publish', articleId], { cwd: BLOGGER_AUTOMATION_PATH });

  if (result.code === 0) {
    const blogUrl = extractBlogUrl(result.stdout);
    let successMsg = blogUrl
      ? `✅ Article <code>${escapeHtml(articleId)}</code> publié.\n${blogUrl}`
      : `✅ Article <code>${escapeHtml(articleId)}</code> publié.`;
    // Page Facebook (2026-10-22) : index.js écrit « 📘 Facebook : <url> » ou
    // « ⚠️  Facebook : publication échouée — <motif> ».
    const fbOk = result.stdout.match(/📘 Facebook : (\S+)/);
    const fbKo = `${result.stdout}\n${result.stderr}`.match(/Facebook : publication échouée — (.+)/);
    if (fbOk) successMsg += `\n📘 Facebook : ${escapeHtml(fbOk[1])}`;
    else if (fbKo) successMsg += `\n⚠️ Facebook : ${escapeHtml(fbKo[1].slice(0, 300))}`;
    await sendTelegramMessage(successMsg);
  } else {
    await sendTelegramMessage(`❌ Publication échouée pour <code>${escapeHtml(articleId)}</code>.\n${result.stderr || 'Voir les logs pour plus de détails.'}`);
  }
}

async function handleModificationRequest(id, instructions) {
  if (!id) {
    await sendTelegramMessage('⚠️ Commande 2 : merci d\'indiquer l\'ID de l\'article (ex: <code>2 2026-03-24T08-27-12 ajouter chiffres</code>).');
    return;
  }

  const articleDir = path.join(PENDING_ARTICLES_DIR, id);
  try {
    await fs.access(articleDir);
  } catch {
    await sendTelegramMessage(`⚠️ Impossible de trouver l'article <code>${escapeHtml(id)}</code> dans pending-articles.`);
    return;
  }

  if (!instructions) {
    await sendTelegramMessage('✏️ Commande 2 : ajoutez les instructions après l\'ID (titre, angle, sections...).');
    return;
  }

  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${instructions}${os.EOL}`;
  const logPath = path.join(articleDir, 'modifications.log');
  await fs.appendFile(logPath, logLine, { encoding: 'utf-8' });

  const statusPath = path.join(articleDir, 'status.json');
  try {
    const raw = await fs.readFile(statusPath, 'utf-8');
    const status = JSON.parse(raw);
    if (!Array.isArray(status.modifications)) {
      status.modifications = [];
    }
    status.modifications.push({
      type: 'modification_request',
      source: 'telegram',
      instructions,
      timestamp
    });
    await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
  } catch (error) {
    console.warn(`⚠️ Impossible de mettre à jour status.json pour ${id}:`, error.message);
  }

  await sendTelegramMessage(`📌 Modifications enregistrées pour <code>${escapeHtml(id)}</code>. Je traiterai la demande dès que possible.`);
}


async function handleGenerateArticle(subject, source) {
  const args = ['index.js', 'generate'];
  if (subject) {
    args.push(subject);
    if (source) {
      args.push(source);
    }
  } else if (source) {
    args.push(source);
  }

  console.log("🆕 Demande de génération d'article", { subject, source });
  await sendTelegramMessage("🛠️ Génération d'un nouvel article lancée. Je t'enverrai l'aperçu comme d'habitude.");
  const result = await runNodeScript(args, { cwd: BLOGGER_AUTOMATION_PATH });
  if (result.code !== 0) {
    await sendTelegramMessage(`❌ Erreur pendant la génération. ${result.stderr || result.stdout || ''}`);
  }
}

function inferFileName(mediaRef) {
  if (mediaRef.payload?.file_name) {
    return mediaRef.payload.file_name;
  }
  if (mediaRef.type === 'photo') {
    return `photo_${mediaRef.payload.file_id}.jpg`;
  }
  if (mediaRef.type === 'video' || mediaRef.type === 'animation') {
    return `video_${mediaRef.payload.file_id}.mp4`;
  }
  return `media_${mediaRef.payload?.file_id || Date.now()}`;
}



async function handleApproveVideo(id) {
  if (!id) {
    await sendTelegramMessage('⚠️ ID vidéo manquant. Exemple: <code>approuve vidéo 2026-03-24T09-08-18</code>');
    return;
  }
  const videoPath = path.join(LINKEDIN_VIDEOS_DIR, id);
  try {
    await fs.access(videoPath);
  } catch {
    await sendTelegramMessage(`❌ Vidéo <code>${escapeHtml(id)}</code> introuvable.`);
    return;
  }

  console.log(`🎬 Approbation vidéo demandée: ${id}`);
  await sendTelegramMessage(`⏳ Approbation + upload Drive pour <code>${escapeHtml(id)}</code>...`);

  const result = await runNodeScript(['handle-approval.js', `approuve ${id}`], { cwd: LINKEDIN_AUTOMATION_PATH });

  if (result.code === 0) {
    const summary = await readVideoSummary(id);
    const parts = [`✅ Vidéo <code>${escapeHtml(id)}</code> approuvée.`];
    if (summary.driveUrl) {
      parts.push(`📁 Drive : ${escapeHtml(summary.driveUrl)}`);
    }
    if (summary.recapUrl) {
      parts.push(`🗒️ Récap : ${escapeHtml(summary.recapUrl)}`);
    }
    if (summary.linkedinUrl) {
      parts.push(`🔗 LinkedIn : ${escapeHtml(summary.linkedinUrl)}`);
    } else {
      parts.push('⚠️ Publication LinkedIn à vérifier.');
    }
    if (summary.facebookAttempted) {
      if (summary.facebookUrl) {
        parts.push(`📘 Facebook : ${escapeHtml(summary.facebookUrl)}`);
      } else if (summary.facebookError) {
        parts.push(`⚠️ Facebook : ${escapeHtml(summary.facebookError)}`);
      } else {
        parts.push('⚠️ Facebook : statut inconnu (à vérifier).');
      }
    }
    await sendTelegramMessage(parts.join('\n'));
  } else {
    const detail = (result.stderr || result.stdout || '').trim();
    await sendTelegramMessage(`❌ Erreur traitement vidéo <code>${escapeHtml(id)}</code>:\n${escapeHtml(detail || 'Voir les logs pour plus de détails.')}`);
  }
}

async function handleRejectVideo(id) {
  if (!id) {
    await sendTelegramMessage('⚠️ ID vidéo manquant. Exemple: <code>rejette vidéo 2026-03-24T09-08-18</code>');
    return;
  }
  const videoPath = path.join(LINKEDIN_VIDEOS_DIR, id);
  try {
    await fs.access(videoPath);
  } catch {
    await sendTelegramMessage(`❌ Vidéo <code>${escapeHtml(id)}</code> introuvable.`);
    return;
  }
  console.log(`❌ Rejet vidéo demandé: ${id}`);
  await sendTelegramMessage(`⏳ Rejet de la vidéo <code>${escapeHtml(id)}</code>...`);
  
  const result = await runNodeScript(['handle-approval.js', `rejette ${id}`], { cwd: LINKEDIN_AUTOMATION_PATH });
  
  if (result.code === 0) {
    await sendTelegramMessage(`❌ Vidéo <code>${escapeHtml(id)}</code> rejetée.`);
  } else {
    await sendTelegramMessage(`❌ Erreur rejet vidéo <code>${escapeHtml(id)}</code>:\n${escapeHtml(result.stderr || result.stdout.slice(-500))}`);
  }
}

async function readVideoSummary(id) {
  const folder = path.join(LINKEDIN_VIDEOS_DIR, id);
  const summary = { driveUrl: null, recapUrl: null, linkedinUrl: null, facebookUrl: null, facebookError: null, facebookAttempted: false };
  try {
    const driveLinks = JSON.parse(await fs.readFile(path.join(folder, 'drive-links.json'), 'utf-8'));
    summary.driveUrl = driveLinks.videoUrl || driveLinks.folderUrl || null;
    summary.recapUrl = driveLinks.recapUrl || null;
  } catch {}
  try {
    const status = JSON.parse(await fs.readFile(path.join(folder, 'status.json'), 'utf-8'));
    summary.linkedinUrl = status.linkedin_url || status.linkedinUrl || null;
    summary.facebookUrl = status.facebook_url || status.facebookUrl || null;
    summary.facebookError = status.facebook_error || status.facebookError || null;
    const attempted = status.facebook_attempted;
    const attemptedCamel = status.facebookAttempted;
    if (typeof attempted === 'boolean') {
      summary.facebookAttempted = attempted;
    } else if (typeof attemptedCamel === 'boolean') {
      summary.facebookAttempted = attemptedCamel;
    } else if (summary.facebookUrl || summary.facebookError) {
      summary.facebookAttempted = true;
    }
  } catch {}
  return summary;
}

async function handleFullVideoRun(requestedId) {
  if (fullRunInProgress) {
    await sendTelegramMessage("⚠️ Un run complet est déjà en cours. Attends la fin avant d'en lancer un nouveau.");
    return;
  }
  fullRunInProgress = true;
  try {
    let articleId = requestedId ? requestedId.trim() : null;
    if (!articleId) {
      articleId = await getLatestPublishedArticleId();
    }
    if (!articleId) {
      await sendTelegramMessage("⚠️ Aucun article publié trouvé. Utilise <code>run complet &lt;id&gt;</code> pour préciser un ID.");
      return;
    }

    const articlePath = path.join(PENDING_ARTICLES_DIR, articleId, 'article.json');
    try {
      await fs.access(articlePath);
    } catch {
      await sendTelegramMessage(`❌ Article <code>${escapeHtml(articleId)}</code> introuvable ou pas encore généré.`);
      return;
    }

    await sendTelegramMessage(`🚀 Run complet lancé pour <code>${escapeHtml(articleId)}</code>...`);
    const result = await runNodeScript(['generate-video.js', articlePath], { cwd: LINKEDIN_AUTOMATION_PATH });
    if (result.code === 0) {
      await sendTelegramMessage(`✅ Run complet terminé pour <code>${escapeHtml(articleId)}</code>.
Je t'enverrai la vidéo dès qu'elle sera prête pour approbation.`);
    } else {
      const detail = (result.stderr || result.stdout || '').trim().slice(-1000);
      await sendTelegramMessage(`❌ Run complet échoué pour <code>${escapeHtml(articleId)}</code>.
<pre>${escapeHtml(detail || 'Voir les logs pour plus de détails.')}</pre>`);
    }
  } catch (error) {
    await sendTelegramMessage(`❌ Run complet interrompu : ${escapeHtml(error.message || 'erreur inconnue')}`);
  } finally {
    fullRunInProgress = false;
  }
}

async function handleReplaceScene(command, message) {
  const { videoId, sceneNumber, withSubtitles } = command;
  if (!videoId || !sceneNumber) {
    await sendTelegramMessage('⚠️ Commande invalide. Exemple : <code>remplace scène 3 2026-03-24T08-37-21</code>');
    return;
  }
  const mediaRef = pickTelegramMedia(message);
  if (!mediaRef) {
    await sendTelegramMessage('📎 Ajoute l\'image ou la vidéo en pièce jointe dans le même message.');
    return;
  }
  const filenameHint = inferFileName(mediaRef);
  let mediaPath;
  try {
    mediaPath = await downloadTelegramFile(mediaRef.payload.file_id, filenameHint);
  } catch (error) {
    await sendTelegramMessage(`❌ Impossible de récupérer la pièce jointe : ${escapeHtml(error.message)}`);
    return;
  }
  await sendTelegramMessage(`⏳ Remplacement de la scène ${sceneNumber} pour <code>${escapeHtml(videoId)}</code>...`);
  const args = ['replace-scene.js', videoId, String(sceneNumber), mediaPath];
  if (!withSubtitles) {
    args.push('sans-sous-titres');
  }
  const result = await runNodeScript(args, { cwd: LINKEDIN_AUTOMATION_PATH });
  if (result.code === 0) {
    await sendTelegramMessage(`✅ Scène ${sceneNumber} remplacée pour <code>${escapeHtml(videoId)}</code>.`);
  } else {
    await sendTelegramMessage(`❌ Erreur pendant le remplacement de la scène ${sceneNumber} : ${escapeHtml(result.stderr || result.stdout || 'voir logs')}`);
  }
}

async function handleMessage(message) {
  const textContent = (message.text || message.caption || '').trim();
  if (!textContent) {
    return;
  }
  const command = parseCommand(textContent);

  if (!command) {
    await sendTelegramMessage('ℹ️ Commandes disponibles :\n<code>1 &lt;id&gt;</code> → approuver\n<code>2 &lt;id&gt; &lt;instructions&gt;</code> → demander des modifications\n<code>3 [sujet]</code> → relancer un article\n<code>remplace scène X &lt;id&gt; [sans sous-titres]</code> + pièce jointe\n<code>nouvel article ...</code> → génération personnalisée\n<code>run complet</code> → lancer generate-video.js en run complet');
    return;
  }

  if ((command.type === 'approve_article' || command.type === 'modify_article') && command.id && looksLikeVideoId(command.id)) {
    const videoPath = path.join(LINKEDIN_VIDEOS_DIR, command.id);
    try {
      await fs.access(videoPath);
      if (command.type === 'approve_article') {
        await handleApproveVideo(command.id);
      } else {
        await sendTelegramMessage('🎥 Pour les vidéos, utilise <code>approuve vidéo &lt;id&gt;</code>, <code>rejette vidéo &lt;id&gt;</code> ou <code>remplace scène X &lt;id&gt;</code>.');
      }
      return;
    } catch {
      // not a video folder, continue
    }
  }

  switch (command.type) {
    case 'approve_article':
      await handleApproveArticle(command.id);
      break;
    case 'modify_article':
      await handleModificationRequest(command.id, command.instructions);
      break;
    case 'generate_article':
      await handleGenerateArticle(command.subject, command.source);
      break;
    case 'replace_scene':
      await handleReplaceScene(command, message);
      break;
    case 'approve_video':
      await handleApproveVideo(command.id);
      break;
    case 'reject_video':
      await handleRejectVideo(command.id);
      break;
    case 'run_full_video':
      await handleFullVideoRun(command.id);
      break;
    default:
      await sendTelegramMessage('❔ Commande inconnue.');
  }
}

async function processUpdate(update) {
  const message = update.message || update.edited_message;
  if (!message || (!message.text && !message.caption)) {
    return;
  }

  if (`${message.chat.id}` !== `${TELEGRAM_CHAT_ID}`) {
    console.log('↩️  Message ignoré (chat non autorisé):', message.chat.id);
    return;
  }

  const text = (message.text || message.caption || '').trim();
  console.log(`📩 Message Telegram reçu: ${text}`);
  await handleMessage(message);
}

async function main() {
  console.log('🤖 Bot Telegram d\'approbation démarré. Ctrl+C pour arrêter.');
  await ensurePollingMode();
  const state = await loadState();
  let offset = state.offset || 0;

  while (running) {
    try {
      const updates = await fetchUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        await saveState({ offset });
        await processUpdate(update);
      }
    } catch (error) {
      console.error('⚠️  Erreur polling Telegram:', error.message);
      await delay(5000);
    }
  }

  await saveState({ offset });
  console.log('✅ Bot Telegram arrêté.');
}

main().catch((error) => {
  console.error('❌ Bot Telegram stoppé suite à une erreur:', error);
  process.exit(1);
});
