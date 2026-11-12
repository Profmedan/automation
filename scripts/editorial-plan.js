/**
 * Plan éditorial : étape obligatoire entre l'article et le script vidéo (11 nov. 2026).
 *
 * Le plan est tiré uniquement de l'article et de ses sources, enregistré en JSON
 * (editorial-plan.json dans le dossier de la vidéo) et vérifié avant d'écrire le script.
 * Le script est ensuite écrit scène par scène à partir du plan (generate-script-dynamic.js).
 */
const { jsonrepair } = require('jsonrepair');

const MODELE = 'claude-haiku-4-5-20251001';
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
3. Développement : 2 ou 3 sous-idées. Pour chacune : l'affirmation (une phrase) ; l'explication concrète (pourquoi, comment) ; une preuve ou un exemple de l'article (chiffre, cas, citation) ; le visuel qui MONTRE l'idée (schéma, comparaison, donnée animée), jamais un simple décor ; le texte à l'écran (${MAX_MOTS_ECRAN} mots au maximum, qui a du sens seul).
4. Nuances ou limites, si l'article en donne : chacune formulée concrètement (« l'étude ne porte que sur… »), jamais un mot-titre seul comme « Nuances » ou « Limites ». Liste vide si l'article n'en donne pas.
5. Conclusion de l'article : reformulée fidèlement en une ou deux phrases. C'est la réponse à l'accroche.
6. Appel à l'action : aller lire l'article complet, avec l'adresse du blog (${adresse}) dite et affichée.
7. Sources : titre et auteur de chaque source principale citée par l'article. Chaque preuve chiffrée indique sa source : elle sera affichée à l'écran au moment où le chiffre apparaît, puis reprise en fin de vidéo et dans la description.

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
  "appel": { "texte_voix": "L'analyse complète est sur … : ${adresse}", "adresse_blog": "${adresse}" },
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

async function appelerClaude(prompt, system, maxTokens = 3000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODELE, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!response.ok) throw new Error(`Anthropic API erreur ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.content[0].text;
}

/**
 * Écrit le plan éditorial puis le vérifie ; une seule reprise, avec les erreurs, si le plan est refusé.
 * Lève une erreur si le plan reste invalide : aucune vidéo sans plan valide.
 * @param {{title: string, content: string, url?: string}} article
 * @param {{appelerModele?: Function}} options  appelerModele(prompt, system) → texte (remplaçable dans les tests)
 */
async function genererPlanEditorial(article, options = {}) {
  const appeler = options.appelerModele || appelerClaude;
  const system = 'Tu es rédacteur en chef vidéo. Tu ne reprends que des faits présents dans l\'article. Réponds TOUJOURS en JSON valide uniquement.';
  let erreurs = [];
  for (let essai = 1; essai <= 2; essai++) {
    const plan = lireJson(await appeler(promptPlanEditorial(article, erreurs), system));
    erreurs = validerPlanEditorial(plan, { articleUrl: article.url });
    if (erreurs.length === 0) return plan;
    console.warn(`⚠️  Plan éditorial refusé (essai ${essai}) :\n- ${erreurs.join('\n- ')}`);
  }
  throw new Error(`Plan éditorial invalide après reprise : ${erreurs.join(' ; ')}`);
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
function rapportVideo(plan, comprehension) {
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
  return l.join('\n');
}

module.exports = {
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
};
