/**
 * Script vidéo écrit À PARTIR DU PLAN ÉDITORIAL (11 nov. 2026).
 *
 * Avant : un prompt « 18 scènes, 90 s, 800 mots » écrit directement depuis l'article, puis une seconde
 * narration réécrite par Haiku et précédée de « Bonjour ». Les scènes pouvaient n'être qu'un mot-titre.
 * Maintenant : chaque scène correspond à une ligne du plan (planRef) et dit concrètement ce que le
 * spectateur comprend ; la narration est la suite des narrations de scènes, sans réécriture.
 */
const {
  validerPlanEditorial, genererPlanEditorial, lignesDuPlan, mots, lireJson, appelerClaude, estMotAbstraitSeul, hoteDuBlog, libelleSource, MAX_MOTS_ECRAN,
} = require('./editorial-plan');

const TYPE_VISUEL = { accroche: 'hook', idee_principale: 'stat', developpement: 'visual', nuance: 'split', conclusion: 'quote', appel: 'cta', sources: 'cta' };

function typeDeLigne(ref) {
  return ref.split('.')[0];
}

function promptScript(article, plan, erreursPrecedentes = []) {
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
- Chaque scène répond à : « qu'est-ce que le spectateur comprend ici ? » (champ "comprend").
- Interdit : une scène composée seulement d'un mot abstrait, d'une icône décorative ou d'une transition sans contenu.
- Le texte à l'écran ("text", ${MAX_MOTS_ECRAN} mots au maximum, qui a du sens seul) et la voix ("narration") disent la même idée : l'écran résume, la voix explique.
- Sous-idées : la voix dit l'affirmation, l'explication (pourquoi, comment) et la preuve.
- Toute scène qui affiche un chiffre a "source" = le titre de la source de ce chiffre (affiché à l'écran sous le texte).
- Nuances : chacune dite concrètement (« l'étude ne porte que sur… »), jamais « Nuances » ou « Limites » seul.
- Scène "appel" : la voix dit l'adresse du blog (${plan.appel && plan.appel.adresse_blog}) et l'écran l'affiche.
- Scène "sources" : la voix et l'écran nomment le titre et l'auteur de chaque source.
- Minutage : accroche 0–3 s, idée principale 3–8 s, sous-idées 8–42 s, nuances 42–50 s, conclusion 50–55 s, appel et sources 55–60 s. Environ 150 mots dits en tout.
- La première scène commence directement par l'accroche (pas de « Bonjour »).

RÈGLES VISUELS (imagePrompt en anglais) : l'image MONTRE l'idée de la scène (schéma, comparaison, objet concret du plan, champ "visuel"), jamais un simple décor ; ajoute toujours "no text, no words, no letters, no writing".
${reprise}
Réponds en JSON UNIQUEMENT, sans markdown :
{
  "title": "${String(article.title || '').replace(/"/g, '\\"')}",
  "scenes": [
    { "id": 1, "planRef": "accroche", "comprend": "...", "narration": "...", "text": "6 mots max", "source": "", "duration": 3, "imagePrompt": "..." }
  ],
  "hashtags": ["#IA"]
}`;
}

/** Source que le plan donne à une ligne (preuve d'une sous-idée, ou accroche chiffrée). */
function sourceDuPlan(ref, plan) {
  const m = /^developpement\.(\d+)$/.exec(ref || '');
  if (m) return ((plan.developpement || [])[Number(m[1]) - 1] || {}).source || '';
  if (ref === 'accroche') return (plan.accroche || {}).source || '';
  return '';
}

/**
 * Vérifie le script contre le plan. Renvoie la liste des erreurs (vide si le script est bon).
 */
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
  if (scenes[0] && scenes[0].planRef !== 'accroche') erreurs.push('la première scène doit être l\'accroche');

  const adresse = plan.appel && plan.appel.adresse_blog;
  const appel = scenes.filter((s) => s.planRef === 'appel');
  if (adresse && appel.length && !appel.some((s) => `${s.narration} ${s.text}`.toLowerCase().includes(adresse.toLowerCase().split('.')[0]))) {
    erreurs.push(`scène appel : l'adresse du blog (${adresse}) n'est ni dite ni affichée`);
  }
  const sourcesScene = scenes.filter((s) => s.planRef === 'sources').map((s) => `${s.narration} ${s.text}`.toLowerCase()).join(' ');
  for (const src of plan.sources || []) {
    const nom = String(src.auteur || src.titre || '').toLowerCase().split(/[\s,]+/).find((m) => m.length > 3);
    if (nom && !sourcesScene.includes(nom)) erreurs.push(`scène sources : « ${src.auteur || src.titre} » n'est pas nommé`);
  }
  return erreurs;
}

/**
 * @param {{title, content, url}} article
 * @param {object} [plan]  plan éditorial validé ; s'il manque (anciens appelants), il est écrit ici d'abord
 * @param {{appelerModele?: Function, consignes?: string[]}} options  consignes : erreurs à corriger (ex. test de compréhension)
 */
async function generateVideoScript(article, plan, options = {}) {
  // Étape obligatoire : pas de script sans plan éditorial validé
  if (!plan) plan = await genererPlanEditorial(article, options);
  const erreursPlan = validerPlanEditorial(plan, { articleUrl: article.url });
  if (erreursPlan.length) throw new Error(`Plan éditorial invalide : ${erreursPlan.join(' ; ')}`);

  const appeler = options.appelerModele || ((p, s) => appelerClaude(p, s, 4096));
  const system = 'Tu es scénariste vidéo. Tu suis le plan éditorial ligne par ligne. Réponds TOUJOURS en JSON valide uniquement, sans markdown.';
  let erreurs = [...(options.consignes || [])];
  let script;
  for (let essai = 1; essai <= 2; essai++) {
    console.log(`⏱️  Script depuis le plan éditorial (essai ${essai})...`);
    script = lireJson(await appeler(promptScript(article, plan, erreurs), system));
    erreurs = validerScript(script, plan);
    if (erreurs.length === 0) break;
    console.warn(`⚠️  Script refusé (essai ${essai}) :\n- ${erreurs.join('\n- ')}`);
  }
  if (erreurs.length) throw new Error(`Script invalide après reprise : ${erreurs.join(' ; ')}`);

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

module.exports = { generateVideoScript, validerScript, promptScript };
