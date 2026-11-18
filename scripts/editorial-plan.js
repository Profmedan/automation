/**
 * Plan éditorial : étape obligatoire entre l'article et le script vidéo (11 nov. 2026).
 *
 * Le plan est tiré uniquement de l'article et de ses sources, enregistré en JSON
 * (editorial-plan.json dans le dossier de la vidéo) et vérifié avant d'écrire le script.
 * Le script est ensuite écrit scène par scène à partir du plan (generate-script-dynamic.js).
 */
const { jsonrepair } = require('jsonrepair');

const MODELE = 'claude-haiku-4-5-20251001';
// Tarif Claude Haiku 4.5 (Anthropic, relevé le 12 nov. 2026) : 1 $ par million de jetons en entrée, 5 $ en sortie
const TARIF_USD = { entree: 1 / 1e6, sortie: 5 / 1e6 };
const USAGE = { appels: 0, entree: 0, sortie: 0 };

/** Ajoute l'usage d'une réponse de l'API (plan, script, testeur, juge). */
function noterUsage(usage) {
  if (!usage) return;
  USAGE.appels += 1;
  USAGE.entree += (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  USAGE.sortie += usage.output_tokens || 0;
}

/** Jetons consommés depuis le lancement et coût estimé en dollars. */
function usageClaude() {
  return { modele: MODELE, ...USAGE, cout_usd: +(USAGE.entree * TARIF_USD.entree + USAGE.sortie * TARIF_USD.sortie).toFixed(4) };
}
const MAX_MOTS_ECRAN = 6;

// Mots-titres qui n'expliquent rien quand ils sont seuls à l'écran
const MOTS_ABSTRAITS = [
  'nuance', 'nuances', 'limite', 'limites', 'conclusion', 'introduction', 'contexte', 'enjeu', 'enjeux',
  'danger', 'dangers', 'attention', 'bref', 'résumé', 'resume', 'analyse', 'avenir', 'futur', 'problème',
  'probleme', 'solution', 'solutions', 'révélation', 'revelation', 'impact', 'innovation', 'technologie',
  'risque', 'risques', 'sources', 'source', 'découverte', 'decouverte', 'question', 'réponse', 'reponse',
];
const ARTICLES = ['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'et', 'en', 'sa', 'ses', 'son', 'leur', 'leurs'];

// Un mot = un groupe qui contient une lettre ou un chiffre : « : », « → », « % » ou « « » ne comptent pas
function mots(texte) {
  return String(texte || '').trim().split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m));
}

/**
 * Vrai si le texte n'est qu'un mot abstrait (« Nuances », « Les limites… ») :
 * un seul mot sans chiffre, ou seulement des articles et des mots-titres de la liste.
 */
function estMotAbstraitSeul(texte) {
  const brut = String(texte || '').trim();
  if (!brut) return true;
  if (/\d/.test(brut)) return false;
  const nus = brut.toLowerCase().replace(/[’']/g, ' ').replace(/[^\p{L}\s-]/gu, ' ').split(/\s+/).filter(Boolean);
  if (nus.length <= 1) return true;
  const pleins = nus.filter((m) => !ARTICLES.includes(m));
  return pleins.length > 0 && pleins.every((m) => MOTS_ABSTRAITS.includes(m));
}

function verifierTexteEcran(texte, ou, erreurs) {
  if (!String(texte || '').trim()) {
    erreurs.push(`${ou} : texte à l'écran manquant`);
    return;
  }
  if (mots(texte).length > MAX_MOTS_ECRAN) erreurs.push(`${ou} : texte à l'écran de plus de ${MAX_MOTS_ECRAN} mots (« ${texte} »)`);
  if (estMotAbstraitSeul(texte)) erreurs.push(`${ou} : texte à l'écran réduit à un mot abstrait (« ${texte} »)`);
}

function remplie(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Nom du blog, tel qu'il est dit et écrit. Le 12 nov. 2026, Haiku a écrit « le blog Vivre l'IA ».
const NOM_BLOG = process.env.NOM_BLOG || "Vive l'IA";

/** Remet le bon nom du blog (« Vivre l'IA », « Vive l'I.A. » → « Vive l'IA ») ; l'adresse vive-lia.blogspot.com n'est pas touchée. */
function corrigerNomBlog(texte) {
  if (typeof texte !== 'string') return texte;
  return texte.replace(/(?<![\w.-])viv(?:r?e|ez)\s+l['’]\s*i\.?\s?a\b\.?/gi, NOM_BLOG);
}

/** Nom donné au blog dans un texte (« le blog X : … »), s'il n'est pas le bon. Renvoie '' si tout va bien. */
function nomBlogFautif(texte) {
  const m = /\bblog\s+([A-ZÀ-Ý][^:,.;!?]*?)\s*(?=[:,.;!?]|$)/.exec(String(texte || ''));
  if (!m) return '';
  // « le blog Vive-lia.blogspot.com » : c'est l'adresse, pas un nom
  if (/^\.[a-z]/i.test(String(texte).slice(m.index + m[0].length))) return '';
  const nom = m[1].trim();
  return nom.toLowerCase() === NOM_BLOG.toLowerCase() ? '' : nom;
}

function hoteDuBlog(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Vérifie un plan éditorial. Renvoie la liste des erreurs (vide si le plan est bon).
 * @param {object} plan
 * @param {{articleUrl?: string}} options  l'adresse du blog doit être celle de l'article
 */
function validerPlanEditorial(plan, options = {}) {
  const erreurs = [];
  if (!plan || typeof plan !== 'object') return ['plan absent ou illisible'];

  if (!remplie(plan.idee_principale)) erreurs.push('idée principale manquante');
  else if (mots(plan.idee_principale).length < 6) erreurs.push('idée principale : une phrase complète est attendue');

  const acc = plan.accroche || {};
  if (!remplie(acc.texte_voix)) erreurs.push('accroche : texte dit manquant');
  verifierTexteEcran(acc.texte_ecran, 'accroche', erreurs);

  const dev = Array.isArray(plan.developpement) ? plan.developpement : [];
  if (dev.length < 2) erreurs.push(`développement : au moins 2 sous-idées attendues (${dev.length} trouvée(s))`);
  if (dev.length > 3) erreurs.push(`développement : 3 sous-idées au maximum pour 60 s (${dev.length} trouvées)`);
  dev.forEach((s, i) => {
    const ou = `sous-idée ${i + 1}`;
    for (const champ of ['affirmation', 'explication', 'preuve', 'visuel']) {
      if (!remplie(s && s[champ])) erreurs.push(`${ou} : champ « ${champ} » manquant`);
    }
    verifierTexteEcran(s && s.texte_ecran, ou, erreurs);
    // La source s'affiche au moment où le chiffre apparaît : elle doit donc être connue dès le plan
    if (/\d/.test(`${(s && s.preuve) || ''} ${(s && s.texte_ecran) || ''}`) && !remplie(s && s.source)) {
      erreurs.push(`${ou} : preuve chiffrée sans source (titre de la source du chiffre)`);
    }
  });
  if (/\d/.test(acc.texte_ecran || '') && !remplie(acc.source)) erreurs.push('accroche : chiffre à l\'écran sans source');

  const nuances = Array.isArray(plan.nuances) ? plan.nuances : [];
  // Gabarit : 8 s pour les nuances (42–50 s) → 2 au maximum, les plus importantes
  if (nuances.length > 2) erreurs.push(`nuances : 2 au maximum pour 60 s, les plus importantes (${nuances.length} trouvées)`);
  nuances.forEach((n, i) => {
    const ou = `nuance ${i + 1}`;
    if (!remplie(n && n.texte_voix)) erreurs.push(`${ou} : formulation concrète manquante`);
    else if (mots(n.texte_voix).length < 5 || estMotAbstraitSeul(n.texte_voix)) {
      erreurs.push(`${ou} : à formuler concrètement (« l'étude ne porte que sur… »), pas un mot-titre (« ${n.texte_voix} »)`);
    }
    verifierTexteEcran(n && n.texte_ecran, ou, erreurs);
  });

  if (!remplie(plan.conclusion)) erreurs.push('conclusion de l\'article manquante');

  const appel = plan.appel || {};
  if (!remplie(appel.texte_voix)) erreurs.push('appel à l\'action : texte dit manquant');
  if (!remplie(appel.adresse_blog)) erreurs.push('appel à l\'action : adresse du blog manquante');
  else {
    const attendu = hoteDuBlog(options.articleUrl);
    const donne = appel.adresse_blog.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(donne)) erreurs.push(`appel à l'action : adresse du blog invalide (« ${appel.adresse_blog} »)`);
    else if (attendu && donne !== attendu) erreurs.push(`appel à l'action : adresse « ${donne} » différente de celle de l'article (« ${attendu} »)`);
  }

  const sources = Array.isArray(plan.sources) ? plan.sources : [];
  if (sources.length < 1) erreurs.push('au moins une source attendue');
  sources.forEach((s, i) => {
    if (!remplie(s && s.titre)) erreurs.push(`source ${i + 1} : titre manquant`);
    if (!remplie(s && s.auteur)) erreurs.push(`source ${i + 1} : auteur manquant`);
  });

  return erreurs;
}

function promptPlanEditorial(article, erreursPrecedentes = []) {
  const adresse = hoteDuBlog(article.url) || 'adresse du blog';
  const reprise = erreursPrecedentes.length
    ? `\n\nTA PROPOSITION PRÉCÉDENTE A ÉTÉ REFUSÉE POUR CES RAISONS, CORRIGE-LES TOUTES :\n- ${erreursPrecedentes.join('\n- ')}\n`
    : '';
  return `LANGUE : français. Vouvoiement.

Avant toute vidéo, écris le PLAN ÉDITORIAL de l'article ci-dessous, tiré UNIQUEMENT de l'article et de ses sources. N'invente aucun fait, chiffre, nom ni citation.

ARTICLE : ${article.title}
${article.content}

PLAN ÉDITORIAL (vidéo de 60 s) :
1. Idée principale : une phrase qui dit ce que le spectateur doit retenir.
2. Accroche (0–3 s) : une question, un chiffre ou un contraste fort tiré de l'article, qui donne envie de comprendre l'idée principale.
3. Développement : 2 sous-idées (3 seulement si l'article l'exige : la vidéo dure moins de 60 s). Pour chacune : l'affirmation (une phrase) ; l'explication concrète (pourquoi, comment) ; une preuve ou un exemple de l'article (chiffre, cas, citation) ; le visuel qui MONTRE l'idée (schéma, comparaison, donnée animée), jamais un simple décor ; le texte à l'écran (${MAX_MOTS_ECRAN} mots au maximum, qui a du sens seul).
4. Nuances ou limites, si l'article en donne : chacune formulée concrètement (« l'étude ne porte que sur… »), jamais un mot-titre seul comme « Nuances » ou « Limites ». 2 au maximum (les plus importantes) ; liste vide si l'article n'en donne pas.
5. Conclusion de l'article : reformulée fidèlement en une ou deux phrases. C'est la réponse à l'accroche.
6. Appel à l'action : aller lire l'article complet, avec l'adresse du blog (${adresse}) dite et affichée.
7. Sources : titre et auteur de chaque source principale citée par l'article. Chaque preuve chiffrée indique sa source : elle sera affichée à l'écran au moment où le chiffre apparaît, puis reprise en fin de vidéo et dans la description.

TEXTES À L'ÉCRAN : compte les mots un par un avant de répondre ; ${MAX_MOTS_ECRAN} au maximum (« Un seul robot, en laboratoire » = 5 mots). Si c'est plus long, coupe : la voix explique, l'écran résume.

Minutage indicatif : accroche 0–3 s, idée principale 3–8 s, sous-idées 8–42 s, nuances 42–50 s, conclusion 50–55 s, appel et sources 55–60 s.
${reprise}
Réponds en JSON UNIQUEMENT, sans markdown :
{
  "idee_principale": "une phrase",
  "accroche": { "type": "question|chiffre|contraste", "texte_voix": "...", "texte_ecran": "6 mots max", "preuve": "le fait de l'article utilisé", "source": "titre de la source si l'accroche affiche un chiffre" },
  "developpement": [
    { "affirmation": "...", "explication": "...", "preuve": "...", "visuel": "...", "texte_ecran": "6 mots max", "source": "titre de la source du chiffre (obligatoire si la preuve contient un chiffre)" }
  ],
  "nuances": [ { "texte_voix": "l'étude ne porte que sur…", "texte_ecran": "6 mots max" } ],
  "conclusion": "une ou deux phrases",
  "appel": { "texte_voix": "L'analyse complète est sur le blog ${NOM_BLOG} : ${adresse}", "adresse_blog": "${adresse}" },
  "sources": [ { "titre": "...", "auteur": "...", "url": "..." } ]
}`;
}

function lireJson(raw) {
  const net = String(raw || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(net);
  } catch {
    const a = net.indexOf('{');
    const b = net.lastIndexOf('}');
    return JSON.parse(jsonrepair(a !== -1 && b !== -1 ? net.slice(a, b + 1) : net));
  }
}

/**
 * POST vers l'API Claude, avec 3 nouvelles tentatives (2, 6 puis 15 s) si le réseau coupe ou si l'API répond 429/5xx.
 * Le 12 nov. 2026, une coupure passagère (« fetch failed ») a fait perdre une génération de 39 min juste avant le test.
 */
async function postClaude(corps, { attente = (ms) => new Promise((r) => setTimeout(r, ms)), envoyer = fetch } = {}) {
  const delais = [2000, 6000, 15000];
  for (let essai = 0; ; essai++) {
    let response;
    try {
      response = await envoyer('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      });
    } catch (e) {
      if (e && e.name === 'ServicePayantBloque') throw e;
      if (essai >= delais.length) throw e;
      console.warn(`⚠️  Claude injoignable (${e.message}${e.cause ? ` : ${e.cause.code || e.cause.message}` : ''}) → nouvel essai dans ${delais[essai] / 1000} s`);
      await attente(delais[essai]);
      continue;
    }
    if (response.ok) {
      const data = await response.json();
      noterUsage(data.usage);
      return data;
    }
    const texte = await response.text();
    if ((response.status === 429 || response.status >= 500) && essai < delais.length) {
      console.warn(`⚠️  Claude répond ${response.status} → nouvel essai dans ${delais[essai] / 1000} s`);
      await attente(delais[essai]);
      continue;
    }
    throw new Error(`Anthropic API erreur ${response.status}: ${texte}`);
  }
}

async function appelerClaude(prompt, system, maxTokens = 3000) {
  const data = await postClaude({ model: MODELE, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] });
  return data.content[0].text;
}

/**
 * Textes à l'écran de plus de 6 mots : un appel ciblé les raccourcit (Haiku dépasse souvent d'un mot en écrivant
 * tout le plan). Modifie `objets` sur place ; chaque entrée : {cible: objet, champ: 'texte_ecran'|'text'}.
 */
async function raccourcirTextesEcran(entrees, appeler) {
  const trop = entrees.filter((e) => mots(e.cible[e.champ]).length > MAX_MOTS_ECRAN);
  if (!trop.length) return 0;
  const liste = trop.map((e, i) => ({ i, texte: e.cible[e.champ] }));
  const prompt = `LANGUE : français. RACCOURCIS chaque texte d'écran à ${MAX_MOTS_ECRAN} mots AU MAXIMUM (compte les mots un par un ; la ponctuation ne compte pas).
Le texte doit garder son sens et avoir du sens seul ; garde les chiffres ; n'ajoute aucun fait. Jamais un mot-titre seul (« Nuances », « Limites »).
${JSON.stringify(liste, null, 1)}
Réponds en JSON UNIQUEMENT : [{"i": 0, "texte": "..."}, ...]`;
  let sortie = [];
  try {
    sortie = lireJson(await appeler(prompt, 'Tu es secrétaire de rédaction. Tu raccourcis sans trahir. JSON valide uniquement.'));
  } catch (e) {
    if (e && e.name === 'ServicePayantBloque') throw e;
    return 0; // réponse illisible : la vérification du plan dira ce qui reste trop long
  }
  for (const x of Array.isArray(sortie) ? sortie : []) {
    if (trop[x.i] && String(x.texte || '').trim()) trop[x.i].cible[trop[x.i].champ] = String(x.texte).trim();
  }
  return trop.length;
}

function textesEcranDuPlan(plan) {
  return [plan.accroche, ...(plan.developpement || []), ...(plan.nuances || [])]
    .filter((o) => o && typeof o === 'object' && typeof o.texte_ecran === 'string').map((cible) => ({ cible, champ: 'texte_ecran' }));
}

// Le modèle corrige souvent une erreur et en crée une autre (ex. un texte à l'écran de 7 mots) : 3 essais,
// avec toutes les erreurs déjà vues, coûtent moins d'un centime de plus et évitent d'arrêter la vidéo.
const ESSAIS = 3;

/**
 * Écrit le plan éditorial puis le vérifie ; jusqu'à 3 essais, chaque reprise reçoit toutes les erreurs déjà vues.
 * Lève une erreur si le plan reste invalide : aucune vidéo sans plan valide.
 * @param {{title: string, content: string, url?: string}} article
 * @param {{appelerModele?: Function}} options  appelerModele(prompt, system) → texte (remplaçable dans les tests)
 */
async function genererPlanEditorial(article, options = {}) {
  const appeler = options.appelerModele || appelerClaude;
  const system = 'Tu es rédacteur en chef vidéo. Tu ne reprends que des faits présents dans l\'article. Réponds TOUJOURS en JSON valide uniquement.';
  const vues = [];
  let erreurs = [];
  for (let essai = 1; essai <= ESSAIS; essai++) {
    let plan;
    try {
      plan = lireJson(await appeler(promptPlanEditorial(article, vues), system));
    } catch (e) {
      if (e && e.name === 'ServicePayantBloque') throw e;
      erreurs = [`réponse illisible (${e.message}) : JSON seul, sans Markdown`];
      erreurs.forEach((x) => { if (!vues.includes(x)) vues.push(x); });
      console.warn(`⚠️  Plan éditorial illisible (essai ${essai}/${ESSAIS}) : ${e.message}`);
      continue;
    }
    const n = await raccourcirTextesEcran(textesEcranDuPlan(plan), appeler);
    if (n) console.log(`✂️  ${n} texte(s) à l'écran raccourci(s) à ${MAX_MOTS_ECRAN} mots`);
    erreurs = validerPlanEditorial(plan, { articleUrl: article.url });
    if (erreurs.length === 0) return plan;
    erreurs.forEach((e) => { if (!vues.includes(e)) vues.push(e); });
    console.warn(`⚠️  Plan éditorial refusé (essai ${essai}/${ESSAIS}) :\n- ${erreurs.join('\n- ')}`);
  }
  throw new Error(`Plan éditorial invalide après ${ESSAIS} essais : ${erreurs.join(' ; ')}`);
}

/** Les lignes du plan, dans l'ordre de la vidéo : chaque scène du script doit en citer une. */
function lignesDuPlan(plan) {
  return [
    'accroche',
    'idee_principale',
    ...(plan.developpement || []).map((_, i) => `developpement.${i + 1}`),
    ...(plan.nuances || []).map((_, i) => `nuance.${i + 1}`),
    'conclusion',
    'appel',
    'sources',
  ];
}

/** Libellé affiché d'une source du plan : « titre », auteur (retrouvé dans plan.sources si possible). */
function libelleSource(nom, plan) {
  const n = String(nom || '').trim();
  if (!n) return '';
  const bas = n.toLowerCase();
  const s = (plan.sources || []).find((x) => [x.titre, x.auteur].some((v) => v && (bas.includes(String(v).toLowerCase()) || String(v).toLowerCase().includes(bas))));
  if (!s) return n;
  const auteur = String(s.auteur || '').replace(/\s*\(.*\)\s*/, ' ').trim();
  return auteur ? `« ${s.titre} », ${auteur}` : `« ${s.titre} »`;
}

/** Rapport lisible joint à chaque vidéo : le plan éditorial puis le résultat du test de compréhension. */
function rapportVideo(plan, comprehension, production) {
  const l = ['# Rapport de la vidéo', '', '## Plan éditorial', '',
    `**Idée principale :** ${plan.idee_principale}`, '',
    `**Accroche (${(plan.accroche || {}).type || '?'}) :** ${(plan.accroche || {}).texte_voix || ''} — écran : « ${(plan.accroche || {}).texte_ecran || ''} »`, '',
    '**Sous-idées :**'];
  (plan.developpement || []).forEach((d, i) => {
    l.push(`${i + 1}. ${d.affirmation}`, `   - Pourquoi : ${d.explication}`, `   - Preuve : ${d.preuve}${d.source ? ` (source : ${d.source})` : ''}`,
      `   - Visuel : ${d.visuel}`, `   - Écran : « ${d.texte_ecran} »`);
  });
  l.push('', '**Nuances :**', ...((plan.nuances || []).length ? plan.nuances.map((n) => `- ${n.texte_voix}`) : ['- (aucune dans l\'article)']));
  l.push('', `**Conclusion :** ${plan.conclusion}`, '', `**Appel :** ${(plan.appel || {}).texte_voix || ''} — adresse affichée : ${(plan.appel || {}).adresse_blog || ''}`, '',
    '**Sources :**', ...(plan.sources || []).map((s) => `- « ${s.titre} », ${s.auteur}${s.url ? ` — ${s.url}` : ''}`), '');
  if (!comprehension) {
    l.push('## Test de compréhension : NON FAIT', '');
    return l.join('\n');
  }
  l.push(`## Test de compréhension : ${comprehension.ok ? 'RÉUSSI' : 'ÉCHOUÉ'}`, '',
    'Testeur séparé : il n\'a lu ni l\'article ni le plan ; il n\'a reçu que les images du MP4 final (une toutes les 2 s) et les sous-titres.', '');
  if ((comprehension.manques || []).length) l.push('**Manques ou erreurs :**', ...comprehension.manques.map((m) => `- ${m}`), '');
  l.push('**Ce que le testeur a compris :**', '```json', JSON.stringify(comprehension.reponse || {}, null, 2), '```', '');
  if (production) {
    const t = production.temps_s || {};
    l.push('## Production (outils locaux et gratuits, sauf Claude)', '',
      `- Durée de la vidéo : ${production.duree_video_s} s ; produite ${production.productions} fois`,
      `- Temps sur ce Mac : script ${Math.round(t.script || 0)} s, voix ${Math.round(t.voix || 0)} s, rendu ${Math.round(t.rendu || 0)} s (dont Hyperframes ${Math.round(production.rendu_hyperframes_s || 0)} s), test ${Math.round(t.test || 0)} s`,
      `- Voix : ${production.voix}`, ...(production.voix_journal || []).map((x) => `  - ${x}`),
      `- Réécoute Whisper (part des mots du script retrouvés) : ${(production.ressemblance_whisper || []).join(', ')}`,
      `- Son : ${production.son.lufs} LUFS, crête ${production.son.crete_dBTP} dBTP ; musique ${production.musique} ; ${production.motion ? production.motion.sons : 'bruitages CC0 (skill sound-effects)'}`,
      `- Claude (${production.claude.modele}) : ${production.claude.appels} appels, ${production.claude.entree} jetons en entrée, ${production.claude.sortie} en sortie ≈ ${production.claude.cout_usd} $`, '');
  }
  if (production?.motion) l.push('## Motion design', '', `- Recettes et provenance : ${production.motion.plan}`, `- Images de contrôle : ${production.motion.revue} (${production.motion.planches} planches ; ${production.motion.statut})`, '- Les images doivent être examinées ; leur extraction ne constitue pas une validation visuelle.', '');
  return l.join('\n');
}

module.exports = {
  postClaude,
  ESSAIS,
  raccourcirTextesEcran,
  noterUsage,
  usageClaude,
  libelleSource,
  rapportVideo,
  MAX_MOTS_ECRAN,
  mots,
  estMotAbstraitSeul,
  validerPlanEditorial,
  promptPlanEditorial,
  genererPlanEditorial,
  lignesDuPlan,
  lireJson,
  appelerClaude,
  hoteDuBlog,
  NOM_BLOG,
  corrigerNomBlog,
  nomBlogFautif,
};
