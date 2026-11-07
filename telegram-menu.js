'use strict';

// Boutons de NAVIGATION uniquement : aucun bouton ne publie ni ne génère.
// Les commandes texte historiques sont conservées dans telegram-bot.js.
const LABELS = Object.freeze({
  articles: '📰 Articles News AI',
  videos: '🎬 Vidéos LinkedIn',
  drive: '📂 Choisir un article sur Drive',
  home: '🏠 Retour au menu principal'
});

const CALLBACKS = Object.freeze({
  articles: 'newsai:nav:articles',
  videos: 'newsai:nav:videos',
  drive: 'newsai:nav:drive',
  home: 'newsai:nav:home'
});

function getNavigation(text) {
  const value = String(text || '').trim();
  if (value === LABELS.drive || /^articles drive$/i.test(value)) return 'drive';
  if (value === LABELS.articles) return 'articles';
  if (value === LABELS.videos) return 'videos';
  if (value === LABELS.home || value === '🏠 Menu principal' || /^\/(start|menu|help)(?:@\w+)?$/i.test(value)) return 'home';
  return null;
}

function getCallbackNavigation(callbackData) {
  if (callbackData === CALLBACKS.drive) return 'drive';
  if (callbackData === CALLBACKS.articles) return 'articles';
  if (callbackData === CALLBACKS.videos) return 'videos';
  if (callbackData === CALLBACKS.home) return 'home';
  return null;
}

function getMenu(section = 'home') {
  const inline_keyboard = section === 'home'
    ? [
        [{ text: LABELS.articles, callback_data: CALLBACKS.articles }],
        [{ text: LABELS.videos, callback_data: CALLBACKS.videos }]
      ]
    : [...(section === 'articles' ? [[{ text: LABELS.drive, callback_data: CALLBACKS.drive }]] : []), [{ text: LABELS.home, callback_data: CALLBACKS.home }]];
  const reply_markup = { inline_keyboard };

  if (section === 'articles') {
    return {
      text: [
        '📰 <b>Articles News AI</b>',
        '',
        'Commandes disponibles :',
        '• <code>1 &lt;id&gt;</code> — approuver et publier un article',
        '• <code>2 &lt;id&gt; &lt;instructions&gt;</code> — demander une modification (instructions enregistrées, sans réécriture automatique)',
        '• <code>3 &lt;id&gt;</code> — rejeter un article',
        '• <code>4 [sujet]</code> — générer un nouvel article',
        '• <code>5 [titre]</code> — parcourir ou rechercher les documents Drive',
        '• <code>choisir drive &lt;lien&gt;</code> — ouvrir un document précis',
        'Les commandes en toutes lettres restent disponibles.',
        '',
        '⚠️ Les commandes de génération et d’approbation lancent de vraies opérations.',
        'Les boutons ci-dessous servent uniquement à naviguer.'
      ].join('\n'),
      reply_markup
    };
  }

  if (section === 'videos') {
    return {
      text: [
        '🎬 <b>Vidéos LinkedIn</b>',
        '',
        'Commandes disponibles :',
        '• <code>6 &lt;id&gt;</code> — approuver une vidéo',
        '• <code>7 &lt;id&gt;</code> — rejeter une vidéo',
        '• <code>remplace scène X &lt;id&gt;</code> — joindre une image ou vidéo au même message',
        '• <code>remplace scène X &lt;id&gt; sans sous-titres</code> — remplacer sans sous-titres',
        '• <code>run complet [id]</code> — lancer la génération vidéo depuis un article publié',
        '',
        '⚠️ <code>run complet</code> lance une vraie génération susceptible de consommer des crédits.',
        'Les boutons ci-dessous servent uniquement à naviguer.'
      ].join('\n'),
      reply_markup
    };
  }

  return {
    text: [
      '🤖 <b>MonAssistant57 — menu principal</b>',
      '',
      'Choisis une rubrique avec les boutons sous ce message :',
      '📰 <b>Articles News AI</b> — création et publication Blogger / Facebook',
      '🎬 <b>Vidéos LinkedIn</b> — approbation et montage des vidéos',
      '',
      'Les commandes textuelles habituelles restent disponibles.'
    ].join('\n'),
    reply_markup
  };
}

module.exports = { LABELS, CALLBACKS, getNavigation, getCallbackNavigation, getMenu };
