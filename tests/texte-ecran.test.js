// Texte à l'écran des vidéos du bot (12 nov. 2026) : le gabarit veut le texte de chaque scène affiché,
// l'adresse du blog affichée, la source affichée quand un chiffre apparaît, et les sources reprises à la fin.
//   node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { calquesTexte, couperLignes, argumentsSlide, FFMPEG } = require('../scripts/texte-ecran');
const { validerPlanEditorial, lignesDuPlan, rapportVideo } = require('../scripts/editorial-plan');
const { generateVideoScript, validerScript } = require('../scripts/generate-script-dynamic');

const URL_ARTICLE = 'https://vive-lia.blogspot.com/2026/11/image-floue-ou-retouchee-des-robots.html';
const ARTICLE = { title: 'Image floue ou retouchée', content: 'Texte de l\'article.', url: URL_ARTICLE };
const planBon = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-plante-le-couteau.json'), 'utf-8'));
const contient = (erreurs, motif) => erreurs.some((e) => motif.test(e));
const textes = (calques) => calques.map((c) => c.texte).join('\n');

function scriptAvecChiffres(plan) {
  return {
    title: ARTICLE.title,
    scenes: lignesDuPlan(plan).map((ref, i) => ({
      id: i + 1,
      planRef: ref,
      comprend: `ce que montre ${ref}`,
      narration: ref === 'appel' ? plan.appel.texte_voix
        : ref === 'sources' ? 'Sources : Robocurve, Perceptual Attacks on Embodied AI ; et l\'article de Vive l\'IA.'
          : `Narration concrète de ${ref} : une idée précise et vérifiable.`,
      text: ref === 'appel' ? 'vive-lia.blogspot.com' : ref === 'sources' ? 'Robocurve · Vive l\'IA'
        : ref === 'developpement.1' ? 'Flou : 51 sur 60' : 'Texte concret de scène',
      source: '',
      duration: 4,
      visuel: { type: 'composition', intention: 'Montrer les éléments du plan', elements: [{ id: 'e0', type: 'carte', texte: 'Image nette', x: 5, y: 20, w: 38, h: 40, mouvement: 'volet' }, { id: 'e1', type: 'carte', texte: 'Décision du robot', x: 57, y: 20, w: 38, h: 40, mouvement: 'zoom' }], liens: [{ de: 'e0', vers: 'e1' }] },
    })),
  };
}

test('plan : une preuve chiffrée exige sa source', () => {
  const plan = planBon();
  delete plan.developpement[0].source;
  assert.ok(contient(validerPlanEditorial(plan, { articleUrl: URL_ARTICLE }), /sous-idée 1 : preuve chiffrée sans source/));
  const sansChiffre = planBon();
  sansChiffre.developpement[1].preuve = 'La poupée devient une pomme pour tous les modèles.';
  delete sansChiffre.developpement[1].source;
  assert.deepEqual(validerPlanEditorial(sansChiffre, { articleUrl: URL_ARTICLE }), []);
});

test('script : un chiffre à l\'écran sans source est refusé', () => {
  const plan = planBon();
  const s = scriptAvecChiffres(plan);
  s.scenes.find((x) => x.planRef === 'accroche').text = '97 % de tentatives';
  assert.ok(contient(validerScript(s, plan), /scène 1 : chiffre à l'écran sans source/));
});

test('script : la source du plan, l\'adresse et la liste des sources sont reportées sur les scènes', async () => {
  const plan = planBon();
  const script = await generateVideoScript(ARTICLE, plan, { appelerModele: async () => JSON.stringify(scriptAvecChiffres(plan)) });
  const parRef = Object.fromEntries(script.scenes.map((s) => [s.planRef, s]));
  assert.match(parRef['developpement.1'].source, /Perceptual Attacks on Embodied AI/);
  assert.match(parRef['developpement.1'].source, /Robocurve/);
  assert.equal(parRef.appel.adresse, 'vive-lia.blogspot.com');
  assert.equal(parRef.sources.sourcesEcran.length, 2);
  assert.match(parRef.sources.sourcesEcran[1].titre, /Image floue ou retouchée/);
});

test('couperLignes : coupe aux espaces, aucune ligne trop longue, rien de perdu', () => {
  const lignes = couperLignes('Image floutée : la même IA avance le couteau', 22);
  assert.ok(lignes.every((l) => l.length <= 22));
  assert.equal(lignes.join(' '), 'Image floutée : la même IA avance le couteau');
});

test('couperLignes : ni « : » ni « ? » en début de ligne, ni « « » seul en fin de ligne', () => {
  for (const t of ['Net : il refuse. Flou : 51/60', 'Elle voit mal ? Aucun geste risqué', 'Il a dit « Plante le couteau dans l\'objet. »']) {
    const lignes = couperLignes(t, 22);
    assert.equal(lignes.join(' '), t);
    assert.ok(lignes.every((l) => !/^[:;!?»]/.test(l) && !/«$/.test(l)), lignes.join(' | '));
  }
});

test('calques : texte de scène affiché, source affichée sous le chiffre', () => {
  const c = calquesTexte({ planRef: 'developpement.1', text: 'Flou : 51 sur 60', source: '« Perceptual Attacks on Embodied AI », Robocurve' });
  assert.match(textes(c), /Flou : 51 sur 60/);
  assert.match(textes(c), /Source : « Perceptual Attacks on Embodied AI », Robocurve/);
  assert.ok(c.every((k) => k.y >= 40 && k.y <= 1040), 'tout reste dans l\'image 1080 × 1080');
});

test('calques : l\'adresse du blog est affichée en grand sur la scène appel', () => {
  const c = calquesTexte({ planRef: 'appel', text: 'L\'analyse complète', adresse: 'vive-lia.blogspot.com' });
  const adresse = c.find((k) => k.texte === 'vive-lia.blogspot.com');
  assert.ok(adresse && adresse.taille >= 56);
});

test('calques : la scène sources affiche titre et auteur de chaque source', () => {
  const plan = planBon();
  const c = calquesTexte({ planRef: 'sources', text: 'Robocurve · Vive l\'IA', sourcesEcran: plan.sources });
  const t = textes(c).replace(/\n/g, ' ');
  for (const s of plan.sources) {
    assert.ok(t.includes(s.auteur.split(' ')[0]), `auteur ${s.auteur}`);
    assert.ok(t.includes(s.titre.split(' ').slice(0, 3).join(' ')), `titre ${s.titre}`);
  }
});

test('slide rendue par ffmpeg avec le texte (accents, « % », guillemets)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-'));
  const sortie = path.join(dir, 'slide.jpg');
  const scene = { planRef: 'developpement.3', visualType: 'visual', text: '27 % → 88 % → 97 %', source: '« Perceptual Attacks on Embodied AI », Robocurve' };
  execFileSync(FFMPEG, argumentsSlide(null, scene, sortie, dir), { stdio: 'pipe' });
  assert.ok(fs.statSync(sortie).size > 5000);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rapport de la vidéo : plan éditorial et résultat du test de compréhension', () => {
  const plan = planBon();
  const md = rapportVideo(plan, { ok: false, manques: ['adresse du blog absente'], reponse: { idee_principale: 'Une image floue trompe le robot.' } });
  assert.match(md, /## Plan éditorial/);
  assert.match(md, new RegExp(plan.idee_principale.slice(0, 30)));
  assert.match(md, /vive-lia\.blogspot\.com/);
  assert.match(md, /## Test de compréhension : ÉCHOUÉ/);
  assert.match(md, /adresse du blog absente/);
  assert.match(md, /Une image floue trompe le robot/);
});
