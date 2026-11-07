require('dotenv/config');
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
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

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramMessage(text, replyMarkup = null) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text.length > 3900 ? escapeHtml(text.replace(/<[^>]*>/g,'').slice(0, 3500)) + '\nMessage abrégé ; consulte les journaux.' : text,
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    });
  } catch (error) {
    console.error('❌ Erreur envoi Telegram:', error.response?.data?.description || error.code || 'Erreur Telegram');
    throw new Error('Envoi Telegram impossible. Vérifie la connexion et réessaie depuis le menu.');
  }
}

const { createUI } = require(path.join(BLOGGER_AUTOMATION_PATH, 'telegram-ui.cjs'));
const ui = createUI({
  chatId: TELEGRAM_CHAT_ID,
  stateFile: path.join(BLOGGER_AUTOMATION_PATH, 'logs', 'telegram-ui-state.json'),
  articlesDir: PENDING_ARTICLES_DIR, videosDir: LINKEDIN_VIDEOS_DIR,
  send: sendTelegramMessage,
  ack: id => axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: id }),
  driveId: value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['docs.google.com','drive.google.com'].includes(url.hostname)) throw Error('Lien Drive invalide.');
    const id = url.pathname.match(/\/d\/([\w-]+)/)?.[1] || url.searchParams.get('id');
    if (!/^[\w-]{10,200}$/.test(id || '')) throw Error('Identifiant Drive invalide.');
    return id;
  },
  run: args => args[0] === 'video-caption'
    ? runNodeScript(['video-edit.mjs', ...args.slice(1)], { cwd: BLOGGER_AUTOMATION_PATH })
    : runNodeScript(args, { cwd: BLOGGER_AUTOMATION_PATH }),
  generate: async subject => {
    const args = ['index.js','generate']; if (subject) args.push(subject);
    const result = await runNodeScript(args, { cwd: BLOGGER_AUTOMATION_PATH });
    if (result.code !== 0) throw Error('Génération interrompue. Aucun nouvel article prêt à approuver.');
  },
  videoRun: handleFullVideoRun,
  approveVideo: async id => {
    const r = await runNodeScript(['handle-approval.js', `approuve ${id}`], { cwd: LINKEDIN_AUTOMATION_PATH });
    const status = JSON.parse(await fs.readFile(path.join(LINKEDIN_VIDEOS_DIR,id,'status.json'),'utf8'));
    if (r.code !== 0 || status.status !== 'published' || !status.linkedin_url) throw Error('Publication vidéo non confirmée. Vérifie la fiche avant toute nouvelle tentative.');
  },
  rejectVideo: async id => {
    const r = await runNodeScript(['handle-approval.js', `rejette ${id}`], { cwd: LINKEDIN_AUTOMATION_PATH });
    if (r.code !== 0) throw Error('Rejet de la vidéo non confirmé.');
  },
  previewVideo: async id => {
    const file = path.join(LINKEDIN_VIDEOS_DIR, id, 'video.mp4');
    const stat = await fs.stat(file);
    if (stat.size > 49 * 1024 * 1024) throw Error('Vidéo trop volumineuse pour un envoi direct Telegram. Utilise son lien Drive.');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('video', require('node:fs').createReadStream(file));
    await axios.post(`${TELEGRAM_API}/sendVideo`, form, { headers: form.getHeaders(), timeout: 90000 });
  },
  replaceScene: handleReplaceScene
});

const trendFlow = require('./trend-telegram.cjs').createTrendFlow({
  chatId: TELEGRAM_CHAT_ID, root: WORKSPACE_ROOT,
  send: sendTelegramMessage,
  ack: id => axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: id }),
  run: args => runNodeScript(args, { cwd: BLOGGER_AUTOMATION_PATH })
});

const imageFlow = require('./newsai-image-telegram.cjs').createTelegramImageFlow({
  pendingDir: PENDING_ARTICLES_DIR,
  chatId: TELEGRAM_CHAT_ID,
  send: sendTelegramMessage,
  ack: id => axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: id }),
  run: args => runNodeScript(args, { cwd: BLOGGER_AUTOMATION_PATH }),
  precheck: async article => {
    const { pathToFileURL } = require('node:url');
    const { auditEditorialArticle } = await import(pathToFileURL(path.join(BLOGGER_AUTOMATION_PATH, 'editorial-quality.mjs')).href);
    return auditEditorialArticle(article);
  }
});

// /gmail et /partager : import Gmail volontaire et diffusion d'un article déjà publié (module blogger-automation).
const gmailShareFlow = require(path.join(BLOGGER_AUTOMATION_PATH, 'telegram-gmail-share.cjs')).createGmailShareFlow({
  chatId: TELEGRAM_CHAT_ID,
  pendingDir: PENDING_ARTICLES_DIR,
  stateFile: path.join(BLOGGER_AUTOMATION_PATH, 'logs', 'telegram-gmail-share-state.json'),
  tmpDir: path.join(WORKSPACE_ROOT, 'automation-state', 'gmail-tmp'),
  send: sendTelegramMessage,
  ack: id => axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: id }),
  run: args => runNodeScript(args, { cwd: BLOGGER_AUTOMATION_PATH }),
  sharePipeline: () => import(require('node:url').pathToFileURL(path.join(BLOGGER_AUTOMATION_PATH, 'share-pipeline.mjs')).href),
  linkedinReady: async () => {
    const { linkedinConfigStatus } = await import(require('node:url').pathToFileURL(path.join(BLOGGER_AUTOMATION_PATH, 'linkedin-article.mjs')).href);
    return linkedinConfigStatus(BLOGGER_AUTOMATION_PATH).ready;
  },
  linkedinVideo: async blogUrl => {
    const { findLinkedInVideo } = await import(require('node:url').pathToFileURL(path.join(BLOGGER_AUTOMATION_PATH, 'share-pipeline.mjs')).href);
    return findLinkedInVideo(LINKEDIN_VIDEOS_DIR, blogUrl);
  }
});

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
    console.warn('⚠️  Impossible de vérifier/supprimer le webhook:', error.response?.data?.description || error.code || 'Erreur Telegram');
  }
}

/** Menu Telegram natif (bouton « Menu » à côté du champ de saisie).
 * Les commandes existantes de la partie vidéo restent accessibles via /start.
 * Aucun appel ci-dessous ne lance une rédaction, une image ou une publication.
 */
async function registerTelegramCommands() {
  const commands = [
    {command:'menu',description:'Afficher toutes les commandes Vive l’IA'},
    {command:'tendances',description:'Proposer trois sujets IA'},
    {command:'restants',description:'Revoir les sujets non utilisés'},
    {command:'brouillons',description:'Retrouver les articles à lire'},
    {command:'article',description:'Rédiger depuis un lien Web (avec URL)'},
    {command:'gmail',description:'Importer un article depuis Gmail (libellé BLOG_A_PUBLIER)'},
    {command:'partager',description:'Diffuser un article publié sur un autre réseau'},
    {command:'start',description:'Menu principal et vidéos LinkedIn'}
  ];
  try {
    await axios.post(`${TELEGRAM_API}/setMyCommands`,{
      commands, scope:{type:'chat',chat_id:TELEGRAM_CHAT_ID}
    },{timeout:12000});
    await axios.post(`${TELEGRAM_API}/setChatMenuButton`,{
      chat_id:TELEGRAM_CHAT_ID,menu_button:{type:'commands'}
    },{timeout:12000});
    console.log(`✅ Menu Telegram natif actualisé (${commands.length} commandes).`);
  } catch(error) {
    console.warn('⚠️ Menu Telegram natif non actualisé :',error.response?.data?.description || error.message);
  }
}

async function fetchUpdates(offset) {
  try {
    const response = await axios.get(`${TELEGRAM_API}/getUpdates`, {
      params: {
        timeout: 25,
        offset,
        allowed_updates: JSON.stringify(['message', 'callback_query'])
      },
      timeout: 35000
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
      env: require(path.join(BLOGGER_AUTOMATION_PATH, 'child-environment.cjs')).childEnvironment(options.cwd || SCRIPT_DIR)
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

    child.on('error', () => resolve({ code: 1, stdout, stderr: 'Impossible de lancer le programme.' }));
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
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
  if (await gmailShareFlow.handleMessage(message)) return;
  if (await trendFlow.handleMessage(message)) return;
  if (await imageFlow.handleMessage(message)) return;
  if (await ui.message(message)) return;
  await sendTelegramMessage('Commande non reconnue. Utilise les boutons du menu ou réponds « choix 1 » après avoir ouvert une liste.');
  await ui.home();
}

async function processUpdate(update) {
  if (update.callback_query) {
    if (await gmailShareFlow.handleCallback(update.callback_query)) return;
    if (await trendFlow.handleCallback(update.callback_query)) return;
    if (await imageFlow.handleCallback(update.callback_query)) return;
    const cb=update.callback_query;
    const m=/^nv:publish:(blog|facebook|linkedin|both):([A-Za-z0-9_-]{1,120})$/.exec(cb.data||'');
    if (m) {
      if(String(cb.message?.chat?.id)!==String(TELEGRAM_CHAT_ID)) return;
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`,{callback_query_id:cb.id}).catch(()=>{});
      const [,channels,id]=m;
      await sendTelegramMessage(`📰 Publication demandée pour <code>${escapeHtml(id)}</code> : ${escapeHtml(channels)}. Préparation et vérification en cours.`);
      const response=await runNodeScript(['index.js','publish',id,'--channels',channels],{cwd:BLOGGER_AUTOMATION_PATH});
      const statusPath=path.join(PENDING_ARTICLES_DIR,id,'status.json');
      let st={};try{st=JSON.parse(await fs.readFile(statusPath,'utf8'));}catch{}
      if(response.code!==0 || st.status!=='published' || !st.blog_url){
        await sendTelegramMessage(`❌ Publication non confirmée : ${escapeHtml((response.stderr||response.stdout||'Consulter les logs').slice(-600))}`);
      } else {
        const links=[`✅ Blogger : ${escapeHtml(st.blog_url)}`];
        if(channels==='facebook'||channels==='both') links.push(st.facebook_url?`📘 Facebook : ${escapeHtml(st.facebook_url)}`:`⚠️ Facebook : ${escapeHtml(st.facebook_error||st.facebook_state||'non confirmé')}`);
        if(channels==='linkedin'||channels==='both') links.push(st.linkedin_url?`💼 LinkedIn : ${escapeHtml(st.linkedin_url)}`
          :st.linkedin_state==='pending'?`⏸ LinkedIn : en attente — ${escapeHtml(st.linkedin_pending_reason||'connexion LinkedIn requise')}\nBlogger${channels==='both'?' et Facebook':''} non bloqué(s). Après reconnexion LinkedIn, utilise /partager.`
          :`⚠️ LinkedIn : ${escapeHtml(st.linkedin_error||st.linkedin_state||'non confirmé')}`);
        await sendTelegramMessage(links.join('\n'));
      }
      return;
    }
    await ui.callback(update.callback_query);
    return;
  }

  const message = update.message;
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
  await registerTelegramCommands();
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
