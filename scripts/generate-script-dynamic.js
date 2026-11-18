/**
 * Script vidéo écrit À PARTIR DU PLAN ÉDITORIAL (11 nov. 2026).
 *
 * Avant : un prompt « 18 scènes, 90 s, 800 mots » écrit directement depuis l'article, puis une seconde
 * narration réécrite par Haiku et précédée de « Bonjour ». Les scènes pouvaient n'être qu'un mot-titre.
 * Maintenant : chaque scène correspond à une ligne du plan (planRef) et dit concrètement ce que le
 * spectateur comprend ; la narration est la suite des narrations de scènes, sans réécriture.
 */
const {
  validerPlanEditorial, genererPlanEditorial, lignesDuPlan, mots, lireJson, appelerClaude, estMotAbstraitSeul, hoteDuBlog, libelleSource, MAX_MOTS_ECRAN, NOM_BLOG, corrigerNomBlog, nomBlogFautif, ESSAIS, raccourcirTextesEcran,
} = require('./editorial-plan');
const fs = require('node:fs');
const path = require('node:path');
const { lireBanque, choisirStyle, normaliserComposition } = require('./local/motion-composition');
const { consignesMotion, choisirSkill } = require('./local/motion-skills');
const { TYPES_VISUELS, validerVisuel } = require('./local/scenes-visuelles');

// Voix clonée mesurée le 12 nov. 2026 : 165 mots → 77 s de parole, soit ≈ 2,1 mots par seconde.
// 85 à 115 mots tiennent en 45 à 57 s avec les silences (règle des Reels : moins de 60 s).
const MOTS_MIN = 85;
const MOTS_MAX = 115;
const STYLE = 'Style oral, en phrases complètes et naturelles (articles, verbes conjugués) : jamais de style télégraphique. Pour tenir le budget, supprime des idées secondaires, pas des petits mots.';

const TYPE_VISUEL = { accroche: 'hook', idee_principale: 'stat', developpement: 'visual', nuance: 'split', conclusion: 'quote', appel: 'cta', sources: 'cta' };

function typeDeLigne(ref) {
  return ref.split('.')[0];
}

/** Mots dits par scène pour tenir 50 à 60 s (≈ 2,9 mots par seconde) ; les sous-idées prennent le reste. */
function budgetsMots(plan) {
  const b = { accroche: 9, idee_principale: 11, conclusion: 13, appel: 8, sources: 6 };
  (plan.nuances || []).forEach((_, i) => { b[`nuance.${i + 1}`] = 10; });
  const fixe = Object.values(b).reduce((x, y) => x + y, 0);
  const dev = (plan.developpement || []).length || 1;
  const parSousIdee = Math.floor((MOTS_MAX - 5 - fixe) / dev);
  (plan.developpement || []).forEach((_, i) => { b[`developpement.${i + 1}`] = parSousIdee; });
  return b;
}

function promptScript(article, plan, erreursPrecedentes = [], gabarits = [], selectionMotion={skill:"motion-anything-video"}) {
  const direction = choisirStyle(article.title, article.motionStyle);
  const reprise = erreursPrecedentes.length
    ? `\n\nTA PROPOSITION PRÉCÉDENTE A ÉTÉ REFUSÉE POUR CES RAISONS, CORRIGE-LES TOUTES :\n- ${erreursPrecedentes.join('\n- ')}\n`
    : '';
  return `LANGUE : français. Vouvoiement strict.

Écris le script d'une vidéo de 60 s à partir de ce PLAN ÉDITORIAL validé. Le plan fait foi : n'ajoute aucun fait absent du plan ou de l'article.

TITRE : ${article.title}
PLAN ÉDITORIAL :
${JSON.stringify(plan, null, 2)}

RÈGLES DES SCÈNES :
- Une scène par ligne du plan, dans cet ordre : ${lignesDuPlan(plan).join(', ')}. Chaque scène porte "planRef" = le nom de sa ligne.
- ${STYLE}
- BUDGET DE MOTS DITS PAR SCÈNE (à respecter, compte les mots) : ${Object.entries(budgetsMots(plan)).map(([k, v]) => `${k} ${v}`).join(', ')}. Total ${MOTS_MIN} à ${MOTS_MAX} mots. Le plan est plus détaillé que la vidéo : garde l'essentiel de chaque ligne (l'affirmation, le pourquoi en une proposition, la preuve chiffrée).
- Chaque scène répond à : « qu'est-ce que le spectateur comprend ici ? » (champ "comprend").
- Interdit : une scène composée seulement d'un mot abstrait, d'une icône décorative ou d'une transition sans contenu.
- Le texte à l'écran ("text", ${MAX_MOTS_ECRAN} mots au maximum, qui a du sens seul) et la voix ("narration") disent la même idée : l'écran résume, la voix explique.
- Sous-idées : la voix dit l'affirmation, l'explication (pourquoi, comment) et la preuve.
- Toute scène qui affiche un chiffre a "source" = le titre de la source de ce chiffre (affiché à l'écran sous le texte).
- Nuances : chacune dite concrètement (« l'étude ne porte que sur… »), jamais « Nuances » ou « Limites » seul.
- Scène "appel" : la voix dit le nom du blog, exactement « ${NOM_BLOG} », puis son adresse (${plan.appel && plan.appel.adresse_blog}) ; l'écran affiche l'adresse.
- Scène "sources" : la voix nomme la source principale en quelques mots (ex. « Source : l'étude de Robocurve. ») ; la liste complète (titre et auteur) s'affiche automatiquement.
- Minutage : accroche 0–3 s, idée principale 3–8 s, sous-idées 8–42 s, nuances 42–50 s, conclusion 50–55 s, appel et sources 55–60 s.
- La première scène commence directement par l'accroche (pas de « Bonjour »).

${consignesMotion(selectionMotion)}
DIRECTION PROPOSÉE POUR CE SUJET : ${direction}. Tu peux retenir une autre direction de la liste si elle sert mieux le sujet ; conserve-la sur toute la vidéo.
${gabarits.length ? "DISPOSITIONS DE LA BANQUE LOCALE À RÉINTERPRÉTER (remplace tous les textes et nombres par ceux du plan ; tu peux créer une autre disposition) :\n" + JSON.stringify(gabarits) : ""}

${selectionMotion.skill==='lemo-opuscar-video'?'TRAITEMENT LEMO-OPUSCAR : ajoute "traitement" : {"structures":["...","...","..."],"choix":"...","raison":"...","geste_signature":"..."}. Compare trois structures courtes avant de retenir celle qui sert le sujet ; ces notes ne sont pas affichées.':''}
DIRECTION PAR SÉQUENCE : le champ facultatif motionStyle d’une scène peut préciser un second langage compatible avec la direction générale, par exemple handdrawn pour une explication progressive dans un film editorial. Choisir au maximum deux langages cohérents, pas une nouvelle palette à chaque dessin. Varier aussi le cadrage et la taille du sujet, sans déplacer les titres en cours de lecture.
VISUELS : aucune image n'est générée. Chaque scène (sauf "appel" et "sources", dessinées automatiquement) fournit dans "visuel" un schéma dessiné en code qui MONTRE l'idée du plan.
Sur l'ensemble idée principale + développement + nuances, au moins la moitié des scènes utilisent le type "composition" décrit plus haut, avec des dispositions adaptées à leurs relations : pas le même alignement de cartes répété partout. Aucun simple "titre" sur ces scènes explicatives. Fais varier les mouvements utiles à la lecture parmi ceux disponibles ; un seul accent dominant.
Les anciens schémas suivants restent possibles lorsqu'ils expriment mieux un chiffre, une comparaison ou des étapes :
- {"type": "compteur", "valeur": 51, "sur": 60, "unite": "", "libelle": "tentatives avec l'image floue"}  (libellé ≤ 8 mots ; "sur" et "unite" facultatifs)
- {"type": "barres", "unite": "%", "donnees": [{"libelle": "Image nette", "valeur": 27}, {"libelle": "Image floue", "valeur": 87.7}]}  (2 à 4 barres, libellés ≤ 4 mots)
- {"type": "comparaison", "gauche": {"titre": "Ce que voit l'IA", "texte": "une pomme"}, "droite": {"titre": "La vraie scène", "texte": "une poupée"}}  (titres ≤ 4 mots, textes ≤ 10 mots ; à droite, ce qui surprend)
- {"type": "etapes", "etapes": ["L'IA annonce « j'ai fini »", "Un modèle testé juge", "Personne ne vérifie"]}  (2 à 4 étapes de ≤ 7 mots)
- {"type": "citation", "texte": "…", "auteur": "…"}  (≤ 25 mots, citation exacte de l'article)
- {"type": "titre"}  (accroche ou conclusion seulement : texte à l'écran en grand)
Les coordonnées de mise en page d'une composition ne sont pas des données factuelles. Tout nombre affiché d'un visuel doit figurer dans le plan éditorial : aucun chiffre inventé.
LONGUEUR : ${MOTS_MIN} à ${MOTS_MAX} mots dits en tout (vidéo de moins de 60 s).
${reprise}
Réponds en JSON UNIQUEMENT, sans markdown :
{
  "motionStyle": "${direction}",
  "title": "${String(article.title || '').replace(/"/g, '\\"')}",
  "scenes": [
    { "id": 1, "planRef": "accroche", "comprend": "...", "narration": "...", "text": "6 mots max", "source": "", "duration": 3, "visuel": { "type": "titre" } }
  ],
  "hashtags": ["#IA"]
}`;
}

/** Source que le plan donne à une ligne (preuve d'une sous-idée, ou accroche chiffrée). */
function sourceDuPlan(ref, plan) {
  const m = /^developpement\.(\d+)$/.exec(ref || '');
  if (m) return ((plan.developpement || [])[Number(m[1]) - 1] || {}).source || '';
  if (ref === 'accroche') return (plan.accroche || {}).source || '';
  // Une limite de l'étude (« un seul robot ») vient de l'étude elle-même : la source principale
  if (/^nuance\./.test(ref || '')) return ((plan.sources || [])[0] || {}).titre || '';
  return '';
}

/**
 * Corrections mécaniques, sans appel au modèle : nom du blog (« Vivre l'IA » → « Vive l'IA »), « nuances.1 » → « nuance.1 », et texte à l'écran de la scène
 * « sources » fixé (« Sources : Robocurve et 2 autres ») ; la liste complète s'affiche dessous.
 */
function normaliserScenes(script, plan) {
  for (const sc of script.scenes || []) {
    normaliserComposition(sc.visuel);
    sc.narration = corrigerNomBlog(sc.narration);
    sc.text = corrigerNomBlog(sc.text);
    sc.planRef = String(sc.planRef || '').trim()
      .replace(/^nuances\./, 'nuance.').replace(/^d[ée]veloppements?\./, 'developpement.').replace(/^id[ée]e[_ ]principale$/, 'idee_principale');
    if (sc.planRef === 'sources') {
      const p = (plan.sources || [])[0] || {};
      const nom = String(p.auteur || p.titre || '').replace(/\s*\(.*\)\s*/, ' ').split(/[,;]/)[0].trim().split(/\s+/).slice(0, 3).join(' ');
      const autres = (plan.sources || []).length - 1;
      sc.text = nom ? `Sources : ${nom}${autres > 0 ? ` et ${autres} autre${autres > 1 ? 's' : ''}` : ''}` : sc.text;
    }
  }
}

function motsDits(script) {
  return (script.scenes || []).reduce((n, sc) => n + mots(sc.narration).length, 0);
}

/**
 * Raccourcit, une par une, les narrations qui dépassent leur budget : un petit appel par scène
 * (« réécris en N mots au plus, phrases complètes »), vérifié aussitôt, jusqu'à 3 tentatives par scène.
 * Le 12 nov. 2026, un seul appel pour 10 scènes à la fois ne raccourcissait presque rien (193 → 190 mots).
 */
async function condenserNarrations(script, plan, appeler, marge = 2) {
  const budgets = budgetsMots(plan);
  for (const sc of script.scenes || []) {
    const budget = budgets[sc.planRef] || 10;
    for (let k = 1; k <= 3 && mots(sc.narration).length > budget + marge; k++) {
      const prompt = `LANGUE : français. Réécris cette narration de vidéo en ${budget} mots AU MAXIMUM (compte-les un par un).
${STYLE}
Garde l'idée principale, les chiffres, les noms propres et l'adresse du blog s'il y en a une ; n'ajoute aucun fait.
NARRATION (${mots(sc.narration).length} mots) : ${sc.narration}
Réponds en JSON UNIQUEMENT : {"narration": "..."}`;
      let r = null;
      try {
        r = lireJson(await appeler(prompt, 'Tu es secrétaire de rédaction. Tu raccourcis sans trahir. JSON valide uniquement.'));
      } catch (e) {
        if (e && e.name === 'ServicePayantBloque') throw e;
        continue; // réponse illisible (Markdown au lieu du JSON) : tentative suivante
      }
      const nouvelle = String((r && r.narration) || '').trim();
      if (nouvelle && mots(nouvelle).length < mots(sc.narration).length) sc.narration = nouvelle;
    }
  }
}

/**
 * Vérifie le script contre le plan. Renvoie la liste des erreurs (vide si le script est bon).
 */
const sansPonctuation = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Visuels des scènes (sauf appel et sources, dessinés automatiquement). Une citation doit être dans l'article, mot pour mot. */
function validerVisuels(script, plan, article = {}) {
  const textePlan = JSON.stringify(plan);
  const texteArticle = sansPonctuation(`${article.content || ''} ${textePlan}`);
  return (script.scenes || []).flatMap((s, i) => {
    if (['appel', 'sources'].includes(s.planRef)) return [];
    const e = validerVisuel(s.visuel, `scène ${i + 1}`, textePlan);
    if (s.visuel && s.visuel.type === 'citation' && !texteArticle.includes(sansPonctuation(s.visuel.texte))) {
      e.push(`scène ${i + 1} : citation absente de l'article (« ${s.visuel.texte} ») : une citation est reprise mot pour mot, jamais inventée`);
    }
    if (s.visuel?.type === 'composition') {
      for (const element of s.visuel.elements || []) for (const match of String(element?.texte || '').matchAll(/«([^»]+)»/g)) {
        if (!texteArticle.includes(sansPonctuation(match[1]))) e.push(`scène ${i + 1} : citation de composition absente de l'article (« ${match[1]} »)`);
      }
    }
    return e;
  });
}

function validerScript(script, plan) {
  const erreurs = [];
  const scenes = Array.isArray(script && script.scenes) ? script.scenes : [];
  if (scenes.length === 0) return ['script sans scène'];
  const lignes = lignesDuPlan(plan);
  const vues = new Set();
  scenes.forEach((s, i) => {
    const ou = `scène ${i + 1}`;
    if (!lignes.includes(s.planRef)) erreurs.push(`${ou} : planRef « ${s.planRef} » ne correspond à aucune ligne du plan`);
    else vues.add(s.planRef);
    if (!String(s.comprend || '').trim()) erreurs.push(`${ou} : « qu'est-ce que le spectateur comprend ici ? » sans réponse`);
    if (!String(s.narration || '').trim()) erreurs.push(`${ou} : narration vide`);
    const nomFautif = nomBlogFautif(`${s.narration || ''} ${s.text || ''}`);
    if (nomFautif) erreurs.push(`${ou} : le blog s'appelle « ${NOM_BLOG} », pas « ${nomFautif} »`);
    if (!String(s.text || '').trim()) erreurs.push(`${ou} : texte à l'écran vide`);
    else {
      if (mots(s.text).length > MAX_MOTS_ECRAN) erreurs.push(`${ou} : texte à l'écran de plus de ${MAX_MOTS_ECRAN} mots`);
      if (estMotAbstraitSeul(s.text)) erreurs.push(`${ou} : texte à l'écran réduit à un mot abstrait (« ${s.text} »)`);
      if (/\d/.test(s.text) && !['appel', 'sources'].includes(s.planRef) && !String(s.source || '').trim() && !sourceDuPlan(s.planRef, plan)) {
        erreurs.push(`${ou} : chiffre à l'écran sans source`);
      }
    }
  });
  for (const l of lignes) if (!vues.has(l)) erreurs.push(`ligne du plan sans scène : ${l}`);
  const total = scenes.reduce((n, s) => n + mots(s.narration).length, 0);
  if (total > MOTS_MAX) erreurs.push(`narration de ${total} mots : ${MOTS_MAX} au maximum pour rester sous 60 s`);
  if (total < MOTS_MIN) erreurs.push(`narration de ${total} mots : au moins ${MOTS_MIN} pour expliquer chaque idée`);
  if (scenes[0] && scenes[0].planRef !== 'accroche') erreurs.push('la première scène doit être l\'accroche');

  const adresse = plan.appel && plan.appel.adresse_blog;
  const appel = scenes.filter((s) => s.planRef === 'appel');
  if(appel.length&&!appel.some(s=>sansPonctuation(s.narration).includes(sansPonctuation(NOM_BLOG))))erreurs.push(`scène appel : le nom du blog doit être prononcé, exactement « ${NOM_BLOG} »`);
  if (adresse && appel.length && !appel.some((s) => `${s.narration} ${s.text}`.toLowerCase().includes(adresse.toLowerCase().split('.')[0]))) {
    erreurs.push(`scène appel : l'adresse du blog (${adresse}) n'est ni dite ni affichée`);
  }
  // La liste complète des sources (titre et auteur) est affichée automatiquement sur la scène « sources » ;
  // la voix nomme au moins la source principale.
  const voixSources = scenes.filter((s) => s.planRef === 'sources').map((s) => `${s.narration} ${s.text}`.toLowerCase()).join(' ');
  const principale = (plan.sources || [])[0];
  if (principale) {
    const cles = `${principale.auteur || ''} ${principale.titre || ''}`.toLowerCase().split(/[\s,()]+/).filter((m) => m.length > 3);
    if (cles.length && !cles.some((m) => voixSources.includes(m))) erreurs.push(`scène sources : la source principale (« ${principale.titre} », ${principale.auteur}) n'est pas nommée`);
  }
  // Budget de mots par scène : indiqué au modèle quand la narration est trop longue
  if (total > MOTS_MAX) {
    const budgets = budgetsMots(plan);
    const trop = scenes.map((s, i) => ({ i, n: mots(s.narration).length, b: budgets[s.planRef] }))
      .filter((x) => x.b && x.n > x.b + 3).map((x) => `scène ${x.i + 1} : ${x.n} mots pour un budget de ${x.b}`);
    if (trop.length) erreurs.push(`scènes trop longues à raccourcir : ${trop.join(' ; ')}`);
  }
  return erreurs;
}

/** La direction demandée est un contrat vérifié, pas seulement une préférence du prompt. */
function validerDirectionMotion(script) {
  const coeur = (script.scenes || []).filter(s => /^(idee_principale|developpement\.\d+|nuance\.\d+)$/.test(s.planRef));
  const originales = coeur.filter(s => s.visuel?.type === 'composition').length;
  const minimum = Math.ceil(coeur.length / 2);
  const erreurs = originales < minimum ? [`direction motion : ${minimum} compositions originales requises sur ${coeur.length} scènes explicatives ; ${originales} reçues`] : [];
  for (const s of coeur) if (s.visuel?.type === 'titre') erreurs.push(`${s.planRef} : un simple titre ne montre pas l'idée ; dessine une composition explicative`);
  return erreurs;
}

/**
 * @param {{title, content, url}} article
 * @param {object} [plan]  plan éditorial validé ; s'il manque (anciens appelants), il est écrit ici d'abord
 * @param {{appelerModele?: Function, consignes?: string[], dossierDiagnostic?: string}} options
 */
async function generateVideoScript(article, plan, options = {}) {
  // Étape obligatoire : pas de script sans plan éditorial validé
  if (!plan) plan = await genererPlanEditorial(article, options);
  const erreursPlan = validerPlanEditorial(plan, { articleUrl: article.url });
  if (erreursPlan.length) throw new Error(`Plan éditorial invalide : ${erreursPlan.join(' ; ')}`);

  const selectionMotion=options.selectionMotion||choisirSkill(options.dossierDiagnostic,article.motionSkill||process.env.VIDEO_MOTION_SKILL,options);
  const appeler = options.appelerModele || ((p, s) => appelerClaude(p, s, 8192));
  const gabarits = lireBanque(options.banqueMotion, article.title || '');
  const system = 'Tu es scénariste vidéo et motion designer. Tu suis le plan éditorial ligne par ligne. Réponds TOUJOURS en JSON valide uniquement, sans markdown.';
  // Consignes (ex. manques du test de compréhension) et erreurs déjà vues restent dans chaque reprise
  const vues = [...(options.consignes || [])];
  let erreurs = [];
  let script;
  const diagnostic = (essai, brut, erreurs) => {
    if (!options.dossierDiagnostic) return;
    fs.mkdirSync(options.dossierDiagnostic, { recursive: true });
    let fichier = path.join(options.dossierDiagnostic, `script-essai-${essai}.json`);
    let reprise = 2;
    while (fs.existsSync(fichier)) fichier = path.join(options.dossierDiagnostic, `script-essai-${essai}-reprise-${reprise++}.json`);
    fs.writeFileSync(fichier, JSON.stringify({ essai, script: brut, erreurs }, null, 2), { flag: 'wx' });
  };
  for (let essai = 1; essai <= ESSAIS; essai++) {
    console.log(`⏱️  Script depuis le plan éditorial (essai ${essai}/${ESSAIS})...`);
    let reponse;
    try {
      reponse = await appeler(promptScript(article, plan, vues, gabarits, selectionMotion), system);
      script = lireJson(reponse);
    } catch (e) {
      if (e && e.name === 'ServicePayantBloque') throw e;
      erreurs = [`réponse illisible (${e.message}) : JSON seul, sans Markdown`];
      erreurs.forEach((x) => { if (!vues.includes(x)) vues.push(x); });
      console.warn(`⚠️  Script illisible (essai ${essai}/${ESSAIS}) : ${e.message}`);
      diagnostic(essai, reponse || null, erreurs);
      script = { scenes: [] };
      continue;
    }
    const brut = structuredClone(script);
    // Haiku suit mal un budget de mots en écrivant tout le script : une passe ciblée raccourcit les narrations
    normaliserScenes(script, plan);
    if (motsDits(script) > MOTS_MAX) {
      const avant = motsDits(script);
      await condenserNarrations(script, plan, appeler);
      // Encore trop long : second tour, sans marge, sur les scènes au-dessus de leur budget
      if (motsDits(script) > MOTS_MAX) await condenserNarrations(script, plan, appeler, 0);
      console.log(`✂️  Narration raccourcie scène par scène : ${avant} → ${motsDits(script)} mots`);
    }
    await raccourcirTextesEcran((script.scenes || []).filter((sc) => typeof sc.text === 'string').map((cible) => ({ cible, champ: 'text' })), appeler);
    erreurs = [...validerScript(script, plan), ...validerVisuels(script, plan, article), ...validerDirectionMotion(script)];
    diagnostic(essai, brut, erreurs);
    if (erreurs.length === 0) break;
    erreurs.forEach((e) => { if (!vues.includes(e)) vues.push(e); });
    console.warn(`⚠️  Script refusé (essai ${essai}/${ESSAIS}) :\n- ${erreurs.join('\n- ')}`);
  }
  const bloquantes = [...validerScript(script, plan), ...validerVisuels(script, plan, article), ...validerDirectionMotion(script)];
  if (bloquantes.length) throw new Error(`Script invalide après ${ESSAIS} essais : ${bloquantes.join(' ; ')}`);

  script.scenes = script.scenes.map((s, i) => ({
    ...s,
    id: i + 1,
    visualType: TYPE_VISUEL[typeDeLigne(s.planRef)] || 'visual',
    duration: Math.max(2, Math.min(Number(s.duration) || 4, 8)),
    text: String(s.text || '').substring(0, 80),
    // Affiché par le rendu : la source sous un chiffre, l'adresse sur l'appel, la liste des sources à la fin
    source: libelleSource(sourceDuPlan(s.planRef, plan) || s.source, plan),
    ...(s.planRef === 'appel' ? { adresse: plan.appel.adresse_blog } : {}),
    ...(s.planRef === 'sources' ? { sourcesEcran: plan.sources.map((x) => ({ titre: x.titre, auteur: x.auteur })) } : {}),
  }));
  script.selectionMotion=selectionMotion;
  script.editorialPlan = plan;
  script.title = script.title || article.title;
  script.hook = plan.accroche.texte_ecran;
  script.keyPoints = plan.developpement.map((d) => d.affirmation);
  script.sources = plan.sources;
  script.blogAddress = plan.appel.adresse_blog || hoteDuBlog(article.url);
  // La voix dit exactement les narrations des scènes, dans l'ordre du plan
  script.narration = script.scenes.map((s) => s.narration.trim()).join(' ');
  script.duration = script.scenes.reduce((t, s) => t + s.duration, 0);
  script.hashtags = script.hashtags || ['#IA'];
  console.log(`✅ Script généré : ${script.scenes.length} scènes, ${script.duration}s, ${script.narration.split(/\s+/).length} mots`);
  return script;
}

module.exports = { generateVideoScript, validerScript, validerVisuels, promptScript, budgetsMots, condenserNarrations, MOTS_MIN, MOTS_MAX };
