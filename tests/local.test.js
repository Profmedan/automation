// Générateur sans service payant sauf Claude (12 nov. 2026) : garde, voix et calage locaux, scènes en code, montage.
// Aucun appel réseau, ni Docker : seuls les calculs et le HTML produit sont testés.
//   node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { verifierUrl, installerGarde, ServicePayantBloque, HOTES_PAYANTS } = require('../scripts/local/services-payants');
const { alignerMots } = require('../scripts/local/whisper-local');
const { texteDit, appliquerPrononciation } = require('../scripts/local/voix-locale');
const { postClaude } = require('../scripts/editorial-plan');
const { validerVisuel, htmlScene, tempsDuNombre } = require('../scripts/local/scenes-visuelles');
const { groupesSousTitres, fenetresScenes, srt } = require('../scripts/local/rendu-hyperframes');

const RACINE = path.join(__dirname, '..');
const planBon = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-plante-le-couteau.json'), 'utf-8'));

test('garde : un service payant arrête le générateur avec un message clair ; Claude et Telegram passent', () => {
  for (const url of ['https://api.openai.com/v1/images/generations', 'https://api.elevenlabs.io/v1/text-to-speech/x', 'https://api.deapi.ai/api/v1/client/txt2img', 'https://queue.fal.run/x']) {
    assert.throws(() => verifierUrl(url), (e) => e instanceof ServicePayantBloque && /Service payant bloqué/.test(e.message) && /seul Claude est autorisé/.test(e.message));
  }
  assert.throws(() => verifierUrl('https://exemple-inconnu.com/api'), /hôte non autorisé/);
  assert.doesNotThrow(() => verifierUrl('https://api.anthropic.com/v1/messages'));
  assert.doesNotThrow(() => verifierUrl('https://api.telegram.org/botX/sendVideo'));
});

test('garde : fetch et axios refusent l\'appel avant qu\'il parte', async () => {
  installerGarde();
  assert.throws(() => fetch('https://api.openai.com/v1/audio/transcriptions'), ServicePayantBloque);
  const axios = require('axios');
  await assert.rejects(axios.post('https://api.elevenlabs.io/v1/text-to-speech/x', {}), ServicePayantBloque);
  await assert.rejects(axios.create().get('https://api.deapi.ai/x'), ServicePayantBloque);
});

test('aucun service payant dans le chemin du générateur ; les anciennes fonctions payantes refusent', () => {
  const chemin = ['generate-video.js', 'scripts/generate-script-dynamic.js', 'scripts/editorial-plan.js', 'scripts/comprehension-test.js',
    'scripts/local/voix-locale.js', 'scripts/local/whisper-local.js', 'scripts/local/rendu-hyperframes.js', 'scripts/local/scenes-visuelles.js', 'scripts/local/config-locale.js'];
  for (const f of chemin) {
    const src = fs.readFileSync(path.join(RACINE, f), 'utf-8');
    for (const hote of Object.keys(HOTES_PAYANTS)) assert.ok(!src.includes(hote), `${f} cite ${hote}`);
    assert.doesNotMatch(src, /require\(['"]\.\/scripts\/(fetch-images|generate-voiceover|render-video-dynamic)/, `${f} charge un ancien module payant`);
  }
  const gv = fs.readFileSync(path.join(RACINE, 'generate-video.js'), 'utf-8');
  assert.ok(gv.indexOf('installerGarde()') > 0 && gv.indexOf('installerGarde()') < gv.indexOf("require('./scripts/generate-script-dynamic')"), 'garde installé avant le reste');
  const anciens = { 'scripts/fetch-images.js': 3, 'scripts/generate-voiceover-fallback.js': 3, 'scripts/render-video-dynamic.js': 1 };
  for (const [f, n] of Object.entries(anciens)) {
    assert.equal((fs.readFileSync(path.join(RACINE, f), 'utf-8').match(/refuser\('/g) || []).length, n, f);
  }
});

test('voix : l\'adresse du blog est épelée et « IA » se dit « i-a »', () => {
  assert.equal(texteDit("L'analyse complète : vive-lia.blogspot.com", 'vive-lia.blogspot.com'), "L'analyse complète : vive-lia point blogspot point com");
  assert.equal(texteDit("Cinq IA ; l'IA voit mal."), "Cinq i-a ; l'i-a voit mal.");
});

test('calage : les mots du script prennent les temps de Whisper, les mots manqués sont interpolés', () => {
  const entendus = [
    { mot: 'Plante', debut: 0.1, fin: 0.4 }, { mot: 'le', debut: 0.4, fin: 0.5 }, { mot: 'couteau', debut: 0.5, fin: 0.9 },
    { mot: 'dans', debut: 0.9, fin: 1.0 }, { mot: "l'objet.", debut: 1.0, fin: 1.5 },
  ];
  const { mots, ressemblance } = alignerMots("Plante le couteau dans l'objet.", entendus, 1.6);
  assert.equal(ressemblance, 1);
  assert.deepEqual(mots.map((m) => m.debut), [0.1, 0.4, 0.5, 0.9, 1.0]);

  const r2 = alignerMots('Flou : 51 tentatives sur 60.', [{ mot: 'Flou,', debut: 0, fin: 0.4 }, { mot: 'sur', debut: 1.6, fin: 1.8 }, { mot: '60.', debut: 1.8, fin: 2.2 }], 2.3);
  assert.ok(r2.ressemblance < 1);
  const t51 = r2.mots.find((m) => m.mot === '51');
  assert.ok(t51.debut >= 0.4 && t51.fin <= 1.6, 'mot manqué placé entre ses voisins');
});

test('calage : « point » dit dans l\'adresse ne compte pas comme un mot manqué', () => {
  const { ressemblance } = alignerMots('Analyse et sources : vive-lia point blogspot point com.',
    [{ mot: 'Analyse', debut: 0, fin: 0.4 }, { mot: 'et', debut: 0.4, fin: 0.5 }, { mot: 'sources,', debut: 0.5, fin: 1 }, { mot: 'vive-lia.blogspot.com', debut: 1, fin: 2.5 }], 2.6);
  assert.ok(ressemblance >= 0.5, String(ressemblance));
});

test('visuels : catalogue fermé, aucun nombre absent du plan', () => {
  const textePlan = JSON.stringify(planBon());
  assert.deepEqual(validerVisuel({ type: 'compteur', valeur: 51, sur: 60, libelle: 'tentatives avec l\'image floutée' }, 's', textePlan), []);
  assert.deepEqual(validerVisuel({ type: 'barres', unite: '%', donnees: [{ libelle: 'Nette', valeur: 27 }, { libelle: 'Floutée', valeur: 87.7 }, { libelle: 'Retouchée', valeur: 97 }] }, 's', textePlan), []);
  assert.ok(validerVisuel({ type: 'compteur', valeur: 42, libelle: 'tentatives' }, 's', textePlan).some((e) => /42 du visuel n'est pas dans le plan/.test(e)));
  assert.deepEqual(validerVisuel({ type: 'compteur', valeur: 1, libelle: 'seul robot testé' }, 's', '{"nuance": "un seul robot"}'), []);
  assert.ok(validerVisuel({ type: 'compteur', valeur: 7, libelle: 'robots' }, 's', '{"nuance": "un seul robot"}').length > 0);
  assert.ok(validerVisuel({ type: 'photo' }, 's', textePlan).some((e) => /type de visuel inconnu/.test(e)));
  assert.ok(validerVisuel({ type: 'etapes', etapes: ['une seule'] }, 's', textePlan).some((e) => /2 à 4/.test(e)));
});

test('scène HTML : texte à l\'écran, source sous le chiffre, compteur calé sur le mot dit', () => {
  const scene = { planRef: 'developpement.1', text: 'Flou : il avance le couteau', source: '« Perceptual Attacks on Embodied AI », Robocurve', comprend: 'x',
    visuel: { type: 'compteur', valeur: 51, sur: 60, libelle: 'tentatives' } };
  const motsScene = [{ mot: 'Flou', debut: 10, fin: 10.3 }, { mot: '51', debut: 11.2, fin: 11.5 }];
  const html = htmlScene(scene, { id: 's2', duree: 5, debut: 10, mots: motsScene, nbSousIdees: 3 });
  assert.match(html, /Flou : il avance le couteau/);
  assert.match(html, /<b>SOURCE<\/b>« Perceptual Attacks on Embodied AI », Robocurve/);
  assert.match(html, /1 \/ 3/);
  assert.match(html, /window\.__timelines\["s2"\] = tl/);
  assert.equal(tempsDuNombre(motsScene, 51, 10, 0.5).toFixed(2), '1.10');
});

test('scènes appel et sources : adresse affichée, titre et auteur de chaque source', () => {
  const plan = planBon();
  const appel = htmlScene({ planRef: 'appel', text: 'Lisez l\'analyse complète', adresse: 'vive-lia.blogspot.com' }, { id: 's8', duree: 4, debut: 50, mots: [], nbSousIdees: 3 });
  assert.match(appel, /vive-lia\.blogspot\.com/);
  const sources = htmlScene({ planRef: 'sources', text: 'Robocurve · Vive l\'IA', sourcesEcran: plan.sources }, { id: 's9', duree: 6, debut: 54, mots: [], nbSousIdees: 3, dernier: true });
  for (const s of plan.sources) {
    assert.ok(sources.includes(s.titre.replace(/'/g, "'")), s.titre);
    assert.ok(sources.includes('Robocurve (C. Leet'));
  }
  assert.doesNotMatch(sources, /tl\.to\("#s9-cam", \{ opacity: 0/, 'la dernière image reste affichée');
});

test('montage : scènes bout à bout, sous-titres sans chevauchement, SRT valide', () => {
  const calage = {
    duree: 8,
    scenes: [
      { id: 's0', debut: 0.25, fin: 3, mots: [{ mot: 'Plante', debut: 0.25, fin: 0.6 }, { mot: 'le', debut: 0.6, fin: 0.7 }, { mot: 'couteau.', debut: 0.7, fin: 1.2 }, { mot: 'Voilà', debut: 1.4, fin: 1.7 }] },
      { id: 's1', debut: 3.35, fin: 8, mots: [{ mot: 'Image', debut: 3.35, fin: 3.7 }, { mot: 'nette', debut: 3.7, fin: 4 }] },
    ],
  };
  const f = fenetresScenes(calage);
  assert.equal(f[0].debut, 0);
  assert.ok(Math.abs(f[0].debut + f[0].duree - f[1].debut) < 0.002, 'pas de trou entre les scènes');
  assert.ok(f[1].debut + f[1].duree > calage.duree, 'la dernière scène reste après la voix');
  const g = groupesSousTitres(calage);
  for (let i = 1; i < g.length; i++) assert.ok(g[i - 1].fin < g[i].debut, `groupes ${i - 1} et ${i}`);
  assert.equal(g[0].mots.map((m) => m.mot).join(' '), 'Plante le couteau.');
  assert.match(srt(g), /^1\n00:00:00,250 --> 00:00:01,360\nPlante le couteau\.\n/);
});

test('article du blog sans champ « content » : le plan reçoit introduction, corps, conclusion et sources', () => {
  const { contenuArticle } = require('../generate-video');
  const texte = contenuArticle({
    title: 'T', introduction: '<p>Intro.</p>', body: '<h2>Partie</h2><p>Corps &nbsp;du texte.</p>', conclusion: '<p>Fin.</p>',
    sources: [{ titre: 'Perceptual Attacks on Embodied AI', media: 'Robocurve', url: 'https://robocurve.org/robospoof/' }],
  });
  assert.match(texte, /Intro\./);
  assert.match(texte, /Partie\nCorps/);
  assert.match(texte, /SOURCES CITÉES PAR L'ARTICLE :\n- « Perceptual Attacks on Embodied AI », Robocurve https:\/\/robocurve\.org\/robospoof\//);
  assert.doesNotMatch(texte, /<p>/);
});

test('voix : « 87,7 % » se dit « 87 virgule 7 pour cent » (cas réel du 12 nov.)', () => {
  assert.equal(texteDit('Image floue : 87,7%. Retouchée : 97 %.'), 'Image floue : 87 virgule 7 pour cent. Retouchée : 97 pour cent.');
});

test('réécoute : un accord qui ne s\'entend pas n\'est pas un mot manqué', () => {
  const { ressemblance } = alignerMots('Images floues trompent les IA',
    [{ mot: 'Images', debut: 0, fin: 0.3 }, { mot: 'floues', debut: 0.3, fin: 0.6 }, { mot: 'trompe', debut: 0.6, fin: 0.9 }, { mot: 'les', debut: 0.9, fin: 1 }, { mot: 'IA', debut: 1, fin: 1.3 }], 1.4);
  assert.equal(ressemblance, 1);
});

test('Claude : une coupure réseau ou un 529 est réessayé, une erreur 400 ne l\'est pas', async () => {
  let n = 0;
  const reponse = (status, corps) => ({ ok: status === 200, status, json: async () => corps, text: async () => JSON.stringify(corps) });
  const data = await postClaude({ model: 'x' }, {
    attente: async () => {},
    envoyer: async () => {
      n++;
      if (n === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
      if (n === 2) return reponse(529, { error: 'overloaded' });
      return reponse(200, { content: [{ text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } });
    },
  });
  assert.equal(data.content[0].text, 'ok');
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(postClaude({}, { attente: async () => {}, envoyer: async () => { n++; return reponse(400, { error: 'bad' }); } }), /erreur 400/);
  assert.equal(n, 1);
});

test('voix : le dictionnaire de prononciation change la voix mot entier par mot entier, jamais l\'adresse', () => {
  const dico = { Robocurve: 'Robo-keurve' };
  assert.equal(appliquerPrononciation('Robocurve, robocurve, Robocurves et Robocurve-X.', dico), 'Robo-keurve, robocurve, Robocurves et Robocurve-X.');
  assert.equal(texteDit("L'étude Robocurve. Blog Vive l'IA : vive-lia.blogspot.com", 'vive-lia.blogspot.com', dico),
    "L'étude Robo-keurve. Blog Vive l'i-a : vive-lia point blogspot point com");
  // Le dictionnaire livré ne contient que des graphies écoutées (aucune le 12 nov. 2026)
  const livre = JSON.parse(fs.readFileSync(path.join(RACINE, 'scripts', 'local', 'prononciation.json'), 'utf-8'));
  assert.equal(typeof livre.mots, 'object');
});
