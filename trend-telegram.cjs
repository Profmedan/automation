'use strict';
/** Veille IA : chaque sujet du lot est utilisable une fois, indépendamment des autres.
 * Choix humain avant rédaction; jamais de publication automatique.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

function escape(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const AGE_MAX_MS = 7*24*60*60*1000;
function safeWebUrl(str) {
  try {
    const url = new URL(String(str));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')) return null;
    const h = url.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return null;
    if (/^(?:\d+\.){3}\d+$/.test(h) || h.includes(':')) return null; // Bloque IPv4 littéral/IPv6; aucun réseau privé.
    return url.href;
  } catch { return null; }
}
async function atomicJson(filename,data) {
  const tmp=`${filename}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
  try { await fs.writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600}); await fs.rename(tmp,filename); }
  finally { await fs.unlink(tmp).catch(()=>{}); }
}
function usedIndices(data) {
  const indices=new Set(Array.isArray(data.used_indices) ? data.used_indices : []);
  // Compatibilité avec le premier correctif : la sélection précédente ne redevient jamais payante.
  if (Number.isInteger(data.chosen_index)) indices.add(data.chosen_index);
  return indices;
}
function articleIdFromResult(stdout) {
  const m = String(stdout||'').match(/__ARTICLE_READY__(\{[^\n]+\})__END__/);
  if (!m) return null;
  try { const id=JSON.parse(m[1]).id; return /^\d{4}-\d{2}-\d{2}T[0-9-]+$/.test(id) ? id : null; }
  catch { return null; }
}
function createTrendFlow({ chatId, root, send, ack, run }) {
  const pendingDir = process.env.PENDING_ARTICLES_DIR || path.join(root,'pending-articles');
  const ARTICLE_ID_RE = /^\d{4}-\d{2}-\d{2}T[0-9-]+$/;
  function previewButtons(id) {
    return { inline_keyboard: [
      [{ text:'📖 Afficher la fiche du brouillon',callback_data:`tv:preview:${id}` }],
      [{ text:'📋 Choisir un autre sujet',callback_data:'tv:remaining' }],
      [{ text:'🗂 Mes brouillons',callback_data:'tv:drafts' }],
      [{ text:'☰ Commandes',callback_data:'tv:menu' }]
    ] };
  }
  async function showDrafts() {
    let files = [];
    try { files=await fs.readdir(pendingDir,{withFileTypes:true}); }
    catch(e) {
      if(e.code==='ENOENT') {await send('ℹ️ Aucun brouillon enregistré.');return;}
      throw e;
    }
    const drafts=[];
    for(const f of files.filter(e=>e.isDirectory()&&ARTICLE_ID_RE.test(e.name)).sort((a,b)=>b.name.localeCompare(a.name))) {
      try {
        const dir=path.join(pendingDir,f.name);
        const state=JSON.parse(await fs.readFile(path.join(dir,'status.json'),'utf8'));
        if(state.status!=='pending_approval') continue;
        const summary=JSON.parse(await fs.readFile(path.join(dir,'summary.json'),'utf8'));
        drafts.push({id:f.name,title:String(summary.title||'Article sans titre').slice(0,180)});
        if(drafts.length===8)break;
      } catch(e) { console.warn('⚠️ Brouillon ignoré:',f.name,e.message); }
    }
    if(!drafts.length){await send('ℹ️ Aucun brouillon actuellement en attente d’approbation.');return;}
    await send(`🗂 <b>Mes derniers brouillons à examiner</b>\n${drafts.map((d,i)=>`${i+1}. ${escape(d.title)}`).join('\n')}\n\nChoisis un bouton pour recevoir la fiche complète et ses commandes.`,
      {inline_keyboard:[...drafts.map((d,i)=>[{text:`📖 Lire le brouillon ${i+1}`,callback_data:`tv:preview:${d.id}`}]),[{text:'☰ Commandes',callback_data:'tv:menu'}]]});
  }
  function commandMenuMarkup() {
    return { inline_keyboard: [
      [{ text:'🔎 Trois nouveaux sujets',callback_data:'tv:trends' }],
      [{ text:'📋 Mes sujets restants',callback_data:'tv:remaining' }],
      [{ text:'🗂 Mes brouillons à lire',callback_data:'tv:drafts' }],
      [{ text:'🔗 Rédiger depuis un lien Web',callback_data:'tv:article-help' }]
    ] };
  }
  async function showCommandMenu() {
    await send('☰ <b>Commandes Vive l’IA</b>\n\nChoisis une action ci-dessous.\nPour consulter les fonctions vidéo LinkedIn, utilise /start.\nAucun article ni aucune image ne sera créé par la simple ouverture de ce menu.', commandMenuMarkup());
  }
  async function askForLink() {
    await send('🔗 Pour rédiger un article à partir d’une page Web, envoie :\n<code>/article https://exemple.fr/actualite</code>\n\nTu pourras relire le brouillon avant toute publication.',{inline_keyboard:[[{text:'☰ Toutes les commandes',callback_data:'tv:menu'}]]});
  }
  async function showRemaining() {
    const result=await run(['index.js','restants']);
    if(result.code!==0)await send('❌ Impossible de retrouver les sujets restants. Consulte les journaux.');
    else if(result.stdout.includes('Aucun sujet restant'))await send('ℹ️ Aucun sujet restant sur les sept derniers jours. Tape /tendances pour une nouvelle sélection.');
  }
  async function showPreview(id) {
    if(!ARTICLE_ID_RE.test(id)) {await send('⚠️ Identifiant de brouillon invalide.');return;}
    const dir=path.join(pendingDir,id);
    let status;
    try {status=JSON.parse(await fs.readFile(path.join(dir,'status.json'),'utf8'));}
    catch {await send('⚠️ Brouillon introuvable. Tape /brouillons.');return;}
    if(status.status!=='pending_approval'){
      await send(`ℹ️ Ce brouillon a le statut ${escape(status.status)}. Il n’est plus à approuver.`);return;
    }
    const result=await run(['index.js','notify',id]);
    if(result.code!==0)await send(`❌ Fiche Telegram non envoyée pour <code>${escape(id)}</code>. Vérifie les journaux, ou /brouillons.`);
  }
  const base = path.join(root,'automation-state','trend-selection');
  const active = new Set();
  let manualActive=false;
  async function generateManualLink(url) {
    if (manualActive) { await send('ℹ️ Un article à partir d’un lien est déjà en cours.'); return; }
    manualActive=true;
    try {
      const result=await run(['index.js','generate','Article IA à partir de la source fournie',url]);
      if (result.code!==0 || !articleIdFromResult(result.stdout)) await send('❌ Aucun brouillon valide créé depuis ce lien. Aucun article publié. Consulte les journaux.');
      else await send('✅ Article rédigé à partir du lien. Consulte la fiche reçue dans Telegram avant de publier.');
    } catch(e) { console.error('❌ Lien Web:',e.message); await send('❌ Rédaction à partir du lien interrompue. Aucune relance automatique.'); }
    finally { manualActive=false; }
  }
  async function handleMessage(message) {
    const txt=String(message?.text||'').trim();
    if (/^\/(?:menu|commandes)(?:@\w+)?$/i.test(txt) || /^☰\s*Commandes$/i.test(txt)) {
      if (`${message.chat?.id}`!==`${chatId}`) return true;
      await showCommandMenu(); return true;
    }
    if (/^\/(?:tendances|sujets)(?:@\w+)?$/i.test(txt)) {
      if (`${message.chat?.id}`!==`${chatId}`) return true;
      await send('🔎 Nouvelle recherche Agent Reach (Web + YouTube + X), Gmail IA et contrôle des sujets déjà traités. Les anciennes propositions restent accessibles via /restants. Aucun article ni image à cette étape.');
      void run(['index.js','generate']).then(result=>{
        if(result.code!==0) return send('❌ Recherche des sujets interrompue. Aucune image et aucune publication. Consulte les journaux.');
      }).catch(e=>{ console.error('❌ Tendances:',e.message);return send('❌ Recherche interrompue. Consulte les journaux.');});
      return true;
    }
    if (/^\/(?:restants|mes-sujets)(?:@\w+)?$/i.test(txt)) {
      if (`${message.chat?.id}`!==`${chatId}`) return true;
      await showRemaining();
      return true;
    }
    if (/^\/(?:brouillons|mes-brouillons)(?:@\w+)?$/i.test(txt)) {
      if (`${message.chat?.id}`!==`${chatId}`) return true;
      await showDrafts();return true;
    }
    const view=/^\/voir(?:@\w+)?\s+(\d{4}-\d{2}-\d{2}T[0-9-]+)$/i.exec(txt);
    if(view){
      if (`${message.chat?.id}`!==`${chatId}`) return true;
      await showPreview(view[1]);return true;
    }
    const match=/^\/(?:article|lien)(?:@\w+)?(?:\s+(.+))?$/i.exec(txt);
    if (!match) return false;
    if (`${message.chat?.id}`!==`${chatId}`) return true;
    const url=safeWebUrl((match[1]||'').trim());
    if (!url) { await send('🔗 Pour proposer ton propre sujet : /article https://adresse-de-l-article.fr/page\nSeuls les liens HTTPS publics sont acceptés.');return true; }
    await send(`🔗 Lien reçu : ${escape(url)}\nClaude va vérifier cette source et rédiger un article. L’image sera produite seulement après validation éditoriale ; rien ne sera publié sans ton accord.`);
    void generateManualLink(url);
    return true;
  }
  async function handleCallback(callback) {
    const callbackData=String(callback?.data||'');
    if (['tv:menu','tv:article-help','tv:trends','tv:remaining','tv:drafts'].includes(callbackData)||/^tv:preview:\d{4}-\d{2}-\d{2}T[0-9-]+$/.test(callbackData)) {
      if (`${callback.message?.chat?.id}`!==`${chatId}`) return true;
      await ack(callback.id).catch(()=>{});
      if(callbackData==='tv:menu')await showCommandMenu();
      else if(callbackData==='tv:article-help')await askForLink();
      else if(callbackData==='tv:trends')await handleMessage({chat:callback.message.chat,text:'/tendances'});
      else if(callbackData==='tv:remaining')await showRemaining();
      else if(callbackData==='tv:drafts')await showDrafts();
      else await showPreview(callbackData.slice('tv:preview:'.length));
      return true;
    }
    const m=/^tv:pick:([a-f0-9]{10}):([012])$/.exec(String(callback?.data||''));
    if(!m) return false;
    if (`${callback.message?.chat?.id}`!==`${chatId}`) return true;
    await ack(callback.id).catch(()=>{});
    const [,id,indexRaw]=m;
    const index=Number(indexRaw),filename=path.join(base,`choices-${id}.json`);
    let data;
    try { data=JSON.parse(await fs.readFile(filename,'utf8')); }
    catch { await send('⚠️ Cette sélection est introuvable. Tape /tendances pour rechercher des sujets.');return true; }
    if(data.id!==id || !Array.isArray(data.options) || !data.options[index]) {
      await send('⚠️ Choix invalide. Aucune rédaction lancée.');return true;
    }
    const age=Date.now()-Date.parse(data.created_at||'');
    if(!Number.isFinite(age)||age>AGE_MAX_MS||age< -3600000) {
      await send('⌛ Cette liste a plus de sept jours. Tape /tendances pour une nouvelle sélection.');return true;
    }
    if(usedIndices(data).has(index)) { await send(`ℹ️ Le sujet ${index+1} a déjà été traité. Choisis un autre sujet dans la même liste.`);return true; }
    if(data.status==='generating' || data.status==='selected' || active.has(id)) {
      await send('ℹ️ Une rédaction est encore en cours pour cette liste. Choisis un autre sujet une fois celle-ci terminée.');return true;
    }
    if(data.status==='exhausted') { await send('ℹ️ Les trois sujets de cette liste ont déjà été traités. Tape /tendances.');return true; }
    // Un verrou sur le LOT empêche deux clics simultanés mais sera supprimé à la fin.
    const lockfile=`${filename}.v2.lock`;
    let lock;
    try { lock=await fs.open(lockfile,'wx',0o600); }
    catch(e) {
      if(e.code==='EEXIST'){await send('ℹ️ Une rédaction est en cours ou a été interrompue. Consulte les journaux avant de retenter.');return true;}
      throw e;
    }
    active.add(id);
    let launched=false;
    try {
      // Relire sous verrou, au cas où un autre processus a réservé l'option.
      data=JSON.parse(await fs.readFile(filename,'utf8'));
      if(usedIndices(data).has(index)||data.status==='generating'||data.status==='selected') {
        await send('ℹ️ Sujet déjà utilisé ou rédaction en cours.');return true;
      }
      const used=usedIndices(data);
      used.add(index);
      data.used_indices=[...used].sort();
      data.status='generating';
      data.active_index=index;
      data.results={...(data.results||{}),[index]:{status:'generating',started_at:new Date().toISOString()}};
      await atomicJson(filename,data);
      const chosen=data.options[index];
      launched=true;
      // Un échec d'envoi Telegram ne doit pas laisser le lot verrouillé sans rédaction.
      try { await send(`📝 Sujet ${index+1} à développer : <b>${escape(chosen.title)}</b>\nClaude commence la rédaction. Les autres sujets restent disponibles via /restants après cette tentative. Aucune publication automatique.`); }
      catch(e) { console.warn('⚠️ Confirmation Telegram indisponible, rédaction maintenue:',e.message); }
      void (async()=>{
        let success=false,articleId=null;
        try {
          const result=await run(['index.js','generate',chosen.title,chosen.source_url]);
          articleId=result.code===0?articleIdFromResult(result.stdout):null;
          success=!!articleId;
        } catch(e) {console.error('❌ Rédaction tendance:',e.message);}
        try {
          const latest=JSON.parse(await fs.readFile(filename,'utf8'));
          latest.status=usedIndices(latest).size===3?'exhausted':'offered';
          latest.active_index=null;
          latest.results={...(latest.results||{}),[index]:{
            status:success?'draft_ready':'generation_failed',
            finished_at:new Date().toISOString(),...(articleId?{article_id:articleId}:{})
          }};
          await atomicJson(filename,latest);
          if(success) await send(`✅ <b>Brouillon du sujet ${index+1} prêt</b> : <b>${escape(chosen.title)}</b>\nOuvre sa fiche avec le bouton ci-dessous pour lire l'article, consulter l'image et décider de sa publication. Les autres sujets restent accessibles sans remonter les anciens messages.`, previewButtons(articleId));
          else await send(`❌ Le sujet ${index+1} n’a pas produit de brouillon confirmé. La tentative reste enregistrée pour éviter une deuxième génération payante accidentelle. Vérifie /brouillons : un article a pu être sauvegardé avant une erreur de notification. Les autres sujets restent accessibles via /restants.`,
              {inline_keyboard:[[{text:'🗂 Vérifier les brouillons',callback_data:'tv:drafts'}],[{text:'📋 Autres sujets',callback_data:'tv:remaining'}],[{text:'☰ Commandes',callback_data:'tv:menu'}]]});
        } catch(e){console.error('❌ Fin sélection:',e.message);await send('⚠️ État de la sélection non confirmé. Consulte les journaux avant de réessayer.').catch(()=>{});}
      })().finally(async()=>{active.delete(id);await lock.close().catch(()=>{});await fs.unlink(lockfile).catch(()=>{});});
    } finally {
      // Aucun job lancé : libérer immédiatement.
      if(!launched){active.delete(id);await lock.close().catch(()=>{});await fs.unlink(lockfile).catch(()=>{});}
    }
    return true;
  }
  return {handleMessage,handleCallback};
}
module.exports={createTrendFlow,safeWebUrl,usedIndices,articleIdFromResult};
