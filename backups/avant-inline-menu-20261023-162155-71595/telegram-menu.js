'use strict';

// Menu purement informatif : aucun bouton ne lance une génération ou publication.
// Les commandes historiques continuent à être traitées par telegram-bot.js.
const LABELS = Object.freeze({
  articles: '📰 Articles News AI',
  videos: '🎬 Vidéos LinkedIn',
  home: '🏠 Menu principal'
});

function getNavigation(text) {
  const value = String(text || '').trim();
  if (value === LABELS.articles) return 'articles';
  if (value === LABELS.videos) return 'videos';
  if (value === LABELS.home || /^\/(start|menu|help)(?:@\w+)?$/i.test(value)) return 'home';
  return null;
}

function getMenu(section = 'home') {
  const buttons = [[LABELS.articles, LABELS.videos]];
  if (section !== 'home') buttons.push([LABELS.home]);

  const reply_markup = {
    keyboard: buttons,
    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: false,
    input_field_placeholder: 'Choisissez une rubrique ou saisissez une commande'
  };

  if (section === 'articles') {
    return {
      text: [
        '📰 <b>Articles News AI</b>',
        '',
        'Commandes disponibles :',
        '• <code>1 &lt;id&gt;</code> — approuver un article (ou <code>1</code> pour le dernier en attente)',
        '• <code>2 &lt;id&gt; &lt;instructions&gt;</code> — enregistrer des modifications',
        '• <code>3 [sujet]</code> — lancer une nouvelle génération',
        '• <code>nouvel article sur [sujet]</code> — demander un article personnalisé',
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
        '• <code>approuve vidéo &lt;id&gt;</code> — approuver une vidéo',
        '• <code>rejette vidéo &lt;id&gt;</code> — rejeter une vidéo',
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
      'Choisis une rubrique avec les boutons ci-dessous :',
      '📰 <b>Articles News AI</b> — création et publication Blogger / Facebook',
      '🎬 <b>Vidéos LinkedIn</b> — approbation et montage des vidéos',
      '',
      'Les commandes textuelles habituelles restent disponibles.'
    ].join('\n'),
    reply_markup
  };
}

module.exports = { LABELS, getNavigation, getMenu };
