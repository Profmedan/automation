/**
 * Test de compréhension (11 nov. 2026), obligatoire avant de montrer une vidéo.
 *
 * Un testeur séparé, qui n'a pas lu l'article, ne reçoit que les images du MP4 final (une toutes les 2 s)
 * et les sous-titres. Il écrit l'idée principale, les sous-idées, la conclusion, l'adresse du blog et les
 * sources. Sa réponse est comparée au plan éditorial : tout élément manquant ou faux est listé.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { lireJson, appelerClaude, postClaude } = require('./editorial-plan');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const MODELE = 'claude-haiku-4-5-20251001';

/** Extrait une image toutes les `pas` secondes du MP4 (480 px de large) et renvoie leurs chemins. */
function extraireImages(videoPath, dossier, pas = 2) {
  fs.mkdirSync(dossier, { recursive: true });
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', videoPath, '-vf', `fps=1/${pas},scale=480:-2`, '-q:v', '5', path.join(dossier, 'img-%03d.jpg')]);
  return fs.readdirSync(dossier).filter((f) => /^img-\d+\.jpg$/.test(f)).sort().map((f) => path.join(dossier, f));
}

/** Texte des sous-titres d'un fichier SRT, sans numéros ni minutages. */
function texteSousTitres(srt) {
  return String(srt || '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l))
    .join('\n');
}

const CONSIGNE_TESTEUR = `Tu n'as pas lu l'article dont parle cette vidéo. Tu ne disposes que de ses images (une toutes les 2 s, dans l'ordre) et de ses sous-titres.
Écris ce que tu as compris, sans rien inventer : si un élément n'apparaît pas, laisse-le vide.
Réponds en JSON uniquement :
{ "idee_principale": "une phrase", "sous_idees": ["..."], "conclusion": "...", "adresse_blog": "...", "sources": [ { "titre": "...", "auteur": "..." } ] }`;

async function appelerTesteurClaude(images, sousTitres) {
  const contenu = images.map((f) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(f).toString('base64') } }));
  contenu.push({ type: 'text', text: `SOUS-TITRES :\n${sousTitres}\n\n${CONSIGNE_TESTEUR}` });
  const data = await postClaude({ model: MODELE, max_tokens: 1500, messages: [{ role: 'user', content: contenu }] });
  return data.content[0].text;
}

function normaliserHote(v) {
  return String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

function motsSignificatifs(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((m) => m.length > 3);
}

/** Contrôles exacts : adresse du blog et sources (titre ou auteur reconnu). */
function comparerFaits(reponse, plan) {
  const manques = [];
  const attendue = normaliserHote(plan.appel && plan.appel.adresse_blog);
  if (attendue && normaliserHote(reponse.adresse_blog) !== attendue) {
    manques.push(`adresse du blog : attendu « ${attendue} », compris « ${reponse.adresse_blog || '(rien)'} »`);
  }
  const vu = motsSignificatifs((reponse.sources || []).map((s) => `${s.titre || ''} ${s.auteur || ''}`).join(' '));
  for (const src of plan.sources || []) {
    const cles = [...motsSignificatifs(src.auteur), ...motsSignificatifs(src.titre)];
    if (!cles.some((m) => vu.includes(m))) manques.push(`source non comprise : « ${src.titre} » (${src.auteur})`);
  }
  return manques;
}

const CONSIGNE_JUGE = `Compare ce qu'un spectateur a compris d'une vidéo avec le plan éditorial de cette vidéo.
Pour l'idée principale, chaque sous-idée et la conclusion du plan : "ok" si le spectateur en a retenu le sens (même avec d'autres mots), sinon "manque" ou "faux" avec une raison courte.
Réponds en JSON uniquement :
{ "idee_principale": { "verdict": "ok|manque|faux", "raison": "" }, "sous_idees": [ { "verdict": "ok|manque|faux", "raison": "" } ], "conclusion": { "verdict": "ok|manque|faux", "raison": "" } }`;

/** Contrôles de sens (idée principale, sous-idées, conclusion), confiés à un juge qui voit le plan. */
function lireVerdicts(verdicts, plan) {
  const manques = [];
  const v = (x) => (x && x.verdict) || 'manque';
  if (v(verdicts.idee_principale) !== 'ok') manques.push(`idée principale ${v(verdicts.idee_principale)} : ${(verdicts.idee_principale || {}).raison || ''}`.trim());
  (plan.developpement || []).forEach((d, i) => {
    const x = (verdicts.sous_idees || [])[i];
    if (v(x) !== 'ok') manques.push(`sous-idée ${i + 1} (« ${d.affirmation} ») ${v(x)} : ${(x || {}).raison || ''}`.trim());
  });
  if (v(verdicts.conclusion) !== 'ok') manques.push(`conclusion ${v(verdicts.conclusion)} : ${(verdicts.conclusion || {}).raison || ''}`.trim());
  return manques;
}

/**
 * @param {{videoPath: string, srtPath?: string, texteSecours?: string, plan: object, dossier: string}} entree
 *   texteSecours : narration, si le rendu n'a pas produit de sous-titres
 * @param {{appelerTesteur?: Function, appelerJuge?: Function, extraire?: Function}} options  remplaçables dans les tests
 * @returns {{ok: boolean, manques: string[], reponse: object, verdicts: object, images: number}}
 */
async function testerComprehension(entree, options = {}) {
  const extraire = options.extraire || extraireImages;
  const appelerTesteur = options.appelerTesteur || appelerTesteurClaude;
  const appelerJuge = options.appelerJuge || ((p, s) => appelerClaude(p, s, 1500));
  const images = extraire(entree.videoPath, path.join(entree.dossier, 'comprehension-images'));
  const srt = entree.srtPath && fs.existsSync(entree.srtPath) ? fs.readFileSync(entree.srtPath, 'utf-8') : '';
  const sousTitres = texteSousTitres(srt) || entree.texteSecours || '';
  // Le testeur ne reçoit ni l'article ni le plan
  const reponse = lireJson(await appelerTesteur(images, sousTitres));
  const planSens = { idee_principale: entree.plan.idee_principale, sous_idees: (entree.plan.developpement || []).map((d) => d.affirmation), conclusion: entree.plan.conclusion };
  const verdicts = lireJson(await appelerJuge(
    `PLAN ÉDITORIAL :\n${JSON.stringify(planSens, null, 2)}\n\nCE QUE LE SPECTATEUR A COMPRIS :\n${JSON.stringify(reponse, null, 2)}\n\n${CONSIGNE_JUGE}`,
    'Tu es un juge strict et factuel. Réponds en JSON valide uniquement.',
  ));
  const manques = [...lireVerdicts(verdicts, entree.plan), ...comparerFaits(reponse, entree.plan)];
  return { ok: manques.length === 0, manques, reponse, verdicts, images: images.length };
}

module.exports = { testerComprehension, extraireImages, texteSousTitres, comparerFaits, lireVerdicts, CONSIGNE_TESTEUR };
