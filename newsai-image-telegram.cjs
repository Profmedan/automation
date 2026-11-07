'use strict';

/** Commande d'image isolée du contrôleur Telegram historique.
 * Ne déclenche JAMAIS de génération au premier clic.
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const PREFIX = 'newsai:img:';
const APPROVAL_WINDOW_MS = 10 * 60 * 1000;

function isValidId(id) { return ID_RE.test(String(id || '')); }
function escapeHtml(value = '') {
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function commandId(messageText) {
  const match = /^(?:image|r[eé]g[eé]n[eé]r(?:er|e)\s+image)\s+([A-Za-z0-9_-]{1,120})\s*$/iu.exec(String(messageText || '').trim());
  return match?.[1] || null;
}

function createTelegramImageFlow({ pendingDir, chatId, send, ack, run, precheck = null, now = Date.now, logger = console }) {
  if (!pendingDir || !chatId || !send || !ack || !run) throw new Error('Configuration du flux images incomplète');
  const awaiting = new Map();
  const running = new Set();

  function markup(id, suffix) {
    const data = (action) => {
      const value = `${PREFIX}${action}:${id}`;
      if (Buffer.byteLength(value) > 64) throw new Error('Bouton Telegram trop long');
      return value;
    };
    if (suffix === 'confirm') return { inline_keyboard: [
      [{ text: '✅ Confirmer la génération (API payante)', callback_data: data('go') }],
      [{ text: 'Annuler', callback_data: data('cancel') }]
    ] };
    return { inline_keyboard: [[{ text: '🎨 Régénérer l’image', callback_data: data('ask') }]] };
  }

  async function checkDraft(id) {
    if (!isValidId(id)) throw new Error('Identifiant incorrect');
    const folder = path.join(pendingDir, id);
    const [article, status] = await Promise.all([
      fs.readFile(path.join(folder,'article.json'),'utf8').then(JSON.parse),
      fs.readFile(path.join(folder,'status.json'),'utf8').then(JSON.parse)
    ]);
    if (status.status !== 'pending_approval' || status.blog_url) {
      throw new Error('Cet article n’est pas un brouillon en attente ; aucune génération lancée.');
    }
    return { article, folder };
  }

  async function request(id) {
    const { article } = await checkDraft(id);
    if (precheck) {
      const check = await precheck(article);
      if (!check.ok) {
        await send(`⚠️ <b>Article non conforme avant génération d'image</b> : ${escapeHtml(check.issues.join(' ; '))}. Ouvre la fiche et demande une révision du texte (700 à 850 mots, trois parties) avant de relancer l'image.`);
        return;
      }
    }
    if (running.has(id)) {
      await send(`⏳ Une régénération est déjà en cours pour <code>${escapeHtml(id)}</code>.`);
      return;
    }
    awaiting.set(id, now() + APPROVAL_WINDOW_MS);
    await send([
      '🎨 <b>Régénérer l’image du brouillon ?</b>',
      `<b>${escapeHtml(article.title)}</b>`,
      `ID : <code>${escapeHtml(id)}</code>`,
      'Une nouvelle génération via GPT Image peut entraîner des frais API.',
      'Cette action ne publie pas l’article et ne modifie pas son texte.'
    ].join('\n\n'), markup(id,'confirm'));
  }

  async function regenerate(id) {
    if (running.has(id)) {
      await send('⏳ Régénération déjà en cours, aucune seconde opération lancée.');
      return;
    }
    await checkDraft(id);
    running.add(id);
    await send(`⏳ Régénération d'image lancée pour <code>${escapeHtml(id)}</code>. Le bot reste accessible.`);
    // Aucun await sur cette tâche dans la boucle getUpdates : navigation Telegram reste active.
    void (async () => {
      try {
        const result = await run(['index.js', 'regenerate-image', id]);
        if (result?.code !== 0) {
          await send(`❌ La génération de l'image ou son hébergement a échoué pour <code>${escapeHtml(id)}</code>. Brouillon conservé. Réessayer nécessite une nouvelle confirmation.`);
          return;
        }
        const data = await fs.readFile(path.join(pendingDir,id,'image.json'),'utf8').then(JSON.parse);
        if (typeof data.url !== 'string' || !/^https:\/\//i.test(data.url)) {
          await send('❌ Aucune image hébergée après le traitement. Aucune publication.');
          return;
        }
        const notification = await run(['index.js', 'notify', id]);
        if (notification?.code === 0) {
          await send('✅ Illustration régénérée et nouvelle fiche envoyée dans Telegram. Vérifie le texte et l’image avant d’approuver.');
        } else {
          await send('✅ Image régénérée et enregistrée, mais l’envoi du nouvel aperçu a échoué. Depuis Articles News AI, rouvre le brouillon avant validation.');
        }
      } catch (error) {
        logger.error('News AI image Telegram:', error.message);
        await send('❌ Échec de régénération ou d’envoi. Vérifie les journaux ; aucune publication lancée.');
      } finally {
        running.delete(id);
      }
    })().catch(error => logger.error('News AI image Telegram (tâche) :', error.message));
  }

  async function handleCallback(query) {
    const data = String(query?.data || '');
    if (!data.startsWith(PREFIX)) return false;
    const sender = String(query?.message?.chat?.id || '');
    if (sender !== String(chatId)) return true;
    await ack(query.id);
    const match = /^newsai:img:(ask|go|cancel):([A-Za-z0-9_-]{1,120})$/.exec(data);
    if (!match || !isValidId(match[2])) {
      await send('⚠️ Bouton image invalide ou expiré.');
      return true;
    }
    const [, action, id] = match;
    try {
      if (action === 'ask') await request(id);
      else if (action === 'cancel') {
        awaiting.delete(id);
        await send('✅ Génération annulée. Aucun crédit consommé.');
      } else {
        const expire = awaiting.get(id);
        if (!expire || expire < now()) {
          await send('⚠️ Confirmation expirée. Demande à nouveau la génération avant tout appel payant.', markup(id));
          return true;
        }
        awaiting.delete(id);
        await regenerate(id);
      }
    } catch (e) {
      await send(`⚠️ ${escapeHtml(e.message)}`);
    }
    return true;
  }

  async function handleMessage(message) {
    if (String(message?.chat?.id || '') !== String(chatId)) return false;
    const id = commandId(message?.text);
    if (!id) return false;
    try { await request(id); }
    catch(e) { await send(`⚠️ ${escapeHtml(e.message)}`); }
    return true;
  }

  return { handleCallback, handleMessage, markup, commandId, isValidId };
}

module.exports = { createTelegramImageFlow, commandId, isValidId };
