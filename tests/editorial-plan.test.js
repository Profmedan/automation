// Plan éditorial obligatoire, script écrit depuis le plan, test de compréhension (11 nov. 2026).
// Aucun appel réseau : les modèles sont remplacés par des fonctions locales.
//   node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { validerPlanEditorial, estMotAbstraitSeul, genererPlanEditorial, lignesDuPlan, mots } = require('../scripts/editorial-plan');
const { generateVideoScript, validerScript } = require('../scripts/generate-script-dynamic');
const { testerComprehension, comparerFaits, texteSousTitres } = require('../scripts/comprehension-test');

const URL_ARTICLE = 'https://vive-lia.blogspot.com/2026/11/image-floue-ou-retouchee-des-robots.html';
const ARTICLE = { title: 'Image floue ou retouchée', content: 'Texte de l\'article.', url: URL_ARTICLE };
const planBon = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'plan-plante-le-couteau.json'), 'utf-8'));
const contient = (erreurs, motif) => erreurs.some((e) => motif.test(e));

// Script conforme au plan : une scène par ligne, l'adresse dans l'appel, les sources nommées
function scriptBon(plan) {
  return {
    title: ARTICLE.title,
    scenes: lignesDuPlan(plan).map((ref, i) => ({
      id: i + 1,
      planRef: ref,
      comprend: `ce que montre ${ref}`,
      narration: ref === 'appel' ? plan.appel.texte_voix
        : ref === 'sources' ? 'Sources : Robocurve, Perceptual Attacks on Embodied AI ; et l\'article de Vive l\'IA.'
          : `Narration concrète de ${ref} : une idée précise et vérifiable.`,
      text: ref === 'appel' ? 'vive-lia.blogspot.com' : ref === 'sources' ? 'Robocurve · Vive l\'IA' : 'Texte concret de scène',
      duration: 4,
      visuel: { type: 'composition', intention: 'Montrer les éléments du plan', elements: [{ id: 'e0', type: 'carte', texte: 'Image nette', x: 5, y: 20, w: 38, h: 40, mouvement: 'volet' }, { id: 'e1', type: 'carte', texte: 'Décision du robot', x: 57, y: 20, w: 38, h: 40, mouvement: 'zoom' }], liens: [{ de: 'e0', vers: 'e1' }] },
    })),
  };
}

test('le nom du blog doit encore être prononcé après la condensation de l’appel',()=>{
 const plan=planBon(),s=scriptBon(plan);
 s.scenes.find(sc=>sc.planRef==='appel').narration='Lisez l’analyse complète sur vive-lia.blogspot.com';
 assert.ok(validerScript(s,plan).some(e=>e.includes('nom du blog doit être prononcé')));
});

test('le plan de « Plante le couteau » est valide', () => {
  assert.deepEqual(validerPlanEditorial(planBon(), { articleUrl: URL_ARTICLE }), []);
});

test('le plan exige au moins 2 sous-idées, et 3 au maximum', () => {
  const p = planBon();
  p.developpement = p.developpement.slice(0, 1);
  assert.ok(contient(validerPlanEditorial(p), /au moins 2 sous-idées/));
  const q = planBon();
  q.developpement = [...q.developpement, q.developpement[0]];
  assert.ok(contient(validerPlanEditorial(q), /3 sous-idées au maximum/));
});

test('chaque sous-idée a affirmation, explication, preuve et visuel', () => {
  const p = planBon();
  delete p.developpement[1].preuve;
  p.developpement[0].visuel = '';
  const e = validerPlanEditorial(p);
  assert.ok(contient(e, /sous-idée 2 : champ « preuve »/));
  assert.ok(contient(e, /sous-idée 1 : champ « visuel »/));
});

test('le plan exige une conclusion', () => {
  const p = planBon();
  p.conclusion = '  ';
  assert.ok(contient(validerPlanEditorial(p), /conclusion/));
});

test('le plan exige l\'adresse du blog, et celle de l\'article', () => {
  const p = planBon();
  delete p.appel.adresse_blog;
  assert.ok(contient(validerPlanEditorial(p), /adresse du blog manquante/));
  const q = planBon();
  q.appel.adresse_blog = 'autre-blog.example.com';
  assert.ok(contient(validerPlanEditorial(q, { articleUrl: URL_ARTICLE }), /différente de celle de l'article/));
  const r = planBon();
  r.appel.adresse_blog = 'Vive l\'IA';
  assert.ok(contient(validerPlanEditorial(r), /adresse du blog invalide/));
});

test('le plan exige au moins une source, avec titre et auteur', () => {
  const p = planBon();
  p.sources = [];
  assert.ok(contient(validerPlanEditorial(p), /au moins une source/));
  const q = planBon();
  q.sources[0].auteur = '';
  assert.ok(contient(validerPlanEditorial(q), /source 1 : auteur manquant/));
});

test('aucun texte à l\'écran réduit à un seul mot abstrait', () => {
  for (const t of ['Nuances', 'NUANCES', 'Limites :', 'Les limites', 'Conclusion', 'Danger !', 'Contexte et enjeux', '']) {
    assert.equal(estMotAbstraitSeul(t), true, t);
  }
  for (const t of ['97 %', '51 / 60', '1 seul robot, en labo', 'L\'IA voit une pomme', 'vive-lia.blogspot.com', 'Tentatives annoncées, pas vérifiées']) {
    assert.equal(estMotAbstraitSeul(t), false, t);
  }
  const p = planBon();
  p.developpement[2].texte_ecran = 'Danger';
  p.accroche.texte_ecran = 'Introduction';
  const e = validerPlanEditorial(p);
  assert.ok(contient(e, /sous-idée 3 : texte à l'écran réduit à un mot abstrait/));
  assert.ok(contient(e, /accroche : texte à l'écran réduit à un mot abstrait/));
});

test('une nuance réduite à un mot-titre est refusée (cas de la v2 : « Nuances »)', () => {
  const p = planBon();
  p.nuances = [{ texte_voix: 'Nuances', texte_ecran: 'Nuances' }];
  const e = validerPlanEditorial(p);
  assert.ok(contient(e, /nuance 1 : à formuler concrètement/));
  assert.ok(contient(e, /nuance 1 : texte à l'écran réduit à un mot abstrait/));
});

test('le texte à l\'écran fait 6 mots au maximum ; la ponctuation ne compte pas', () => {
  assert.equal(mots('« Plante le couteau dans l\'objet. »').length, 5);
  assert.equal(mots('27 % → 88 % → 97 %').length, 3);
  const p = planBon();
  p.developpement[0].texte_ecran = 'Avec une image floutée le robot obéit presque toujours';
  assert.ok(contient(validerPlanEditorial(p), /sous-idée 1 : texte à l'écran de plus de 6 mots/));
});

test('genererPlanEditorial : 3 essais, chaque reprise reçoit toutes les erreurs déjà vues, puis refus', async () => {
  const prompts = [];
  // Cas réel du 12 nov. : l'essai 1 a une nuance 2 trop longue, l'essai 2 corrige mais allonge la nuance 1
  const p1 = planBon(); p1.nuances[1].texte_ecran = 'Test en laboratoire, pas en conditions réelles';
  const p2 = planBon(); p2.nuances[0].texte_ecran = 'Un seul robot, douze essais par test';
  const reponses = [p1, p2, p2];
  await assert.rejects(
    // La passe de raccourcissement échoue ici (réponse vide) : le refus après 3 essais doit tenir
    genererPlanEditorial(ARTICLE, { appelerModele: async (p) => { if (/RACCOURCIS/.test(p)) return '[]'; prompts.push(p); return JSON.stringify(reponses[prompts.length - 1]); } }),
    /Plan éditorial invalide après 3 essais/,
  );
  assert.equal(prompts.length, 3);
  assert.match(prompts[1], /REFUSÉE[\s\S]*nuance 2/);
  assert.match(prompts[2], /nuance 2[\s\S]*nuance 1|nuance 1[\s\S]*nuance 2/, 'les deux erreurs sont rappelées');
  assert.match(prompts[0], /compte les mots un par un/);

  let n = 0;
  const plan = await genererPlanEditorial(ARTICLE, { appelerModele: async () => JSON.stringify(n++ < 2 ? p1 : planBon()) });
  assert.equal(plan.appel.adresse_blog, 'vive-lia.blogspot.com');
});

test('le script suit le plan ligne par ligne, sans « Bonjour », et garde le plan', async () => {
  const plan = planBon();
  const script = await generateVideoScript(ARTICLE, plan, { appelerModele: async () => JSON.stringify(scriptBon(plan)) });
  assert.deepEqual(script.scenes.map((s) => s.planRef), lignesDuPlan(plan));
  assert.equal(script.editorialPlan, plan);
  assert.doesNotMatch(script.narration, /^Bonjour/);
  assert.match(script.narration, /vive-lia point blogspot point com/);
  assert.deepEqual(script.keyPoints, plan.developpement.map((d) => d.affirmation));
  assert.equal(script.sources.length, 2);
});

test('sans plan fourni, le script écrit d\'abord le plan (étape obligatoire pour tous les appelants)', async () => {
  const plan = planBon();
  const appels = [];
  const script = await generateVideoScript(ARTICLE, undefined, {
    appelerModele: async (p) => { appels.push(p); return JSON.stringify(appels.length === 1 ? plan : scriptBon(plan)); },
  });
  assert.match(appels[0], /PLAN ÉDITORIAL \(vidéo de 60 s\)/);
  assert.match(appels[1], /à partir de ce PLAN ÉDITORIAL validé/);
  assert.equal(script.editorialPlan.idee_principale, plan.idee_principale);
});

test('le script est refusé s\'il oublie une ligne du plan, l\'adresse, une source ou s\'il affiche un mot abstrait', () => {
  const plan = planBon();
  const s1 = scriptBon(plan);
  s1.scenes = s1.scenes.filter((s) => s.planRef !== 'conclusion');
  assert.ok(contient(validerScript(s1, plan), /ligne du plan sans scène : conclusion/));

  const s2 = scriptBon(plan);
  s2.scenes.find((s) => s.planRef === 'nuance.1').text = 'NUANCES';
  assert.ok(contient(validerScript(s2, plan), /mot abstrait/));

  const s3 = scriptBon(plan);
  Object.assign(s3.scenes.find((s) => s.planRef === 'appel'), { narration: 'Lisez l\'article complet.', text: 'Lien en description' });
  assert.ok(contient(validerScript(s3, plan), /adresse du blog/));

  const s4 = scriptBon(plan);
  Object.assign(s4.scenes.find((s) => s.planRef === 'sources'), { narration: 'Merci.', text: 'Fin de la vidéo' });
  assert.ok(contient(validerScript(s4, plan), /scène sources : la source principale/));
});

test('le plan garde 2 nuances au maximum ; un script trop long reçoit le budget de chaque scène', () => {
  const { budgetsMots, MOTS_MAX } = require('../scripts/generate-script-dynamic');
  const p = planBon();
  p.nuances = [...p.nuances, ...p.nuances];
  assert.ok(contient(validerPlanEditorial(p, { articleUrl: URL_ARTICLE }), /nuances : 2 au maximum/));

  const plan = planBon();
  const b = budgetsMots(plan);
  const total = Object.values(b).reduce((x, y) => x + y, 0);
  assert.ok(total <= MOTS_MAX && total >= MOTS_MAX - 10, `budget total ${total}`);
  const long = scriptBon(plan);
  long.scenes.find((x) => x.planRef === 'developpement.1').narration = Array(120).fill('mot').join(' ');
  const e = validerScript(long, plan);
  assert.ok(contient(e, /narration de \d+ mots/));
  assert.ok(contient(e, new RegExp(`scène 3 : 120 mots pour un budget de ${b['developpement.1']}`)));
});

test('generateVideoScript lève une erreur si le script reste invalide après 3 essais', async () => {
  const plan = planBon();
  const mauvais = scriptBon(plan);
  mauvais.scenes = mauvais.scenes.slice(0, 3);
  await assert.rejects(generateVideoScript(ARTICLE, plan, { appelerModele: async () => JSON.stringify(mauvais) }), /Script invalide après 3 essais/);
});

test('test de compréhension : le testeur ne reçoit ni l\'article ni le plan ; réussite', async () => {
  const plan = planBon();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'comprehension-'));
  const srt = path.join(dossier, 'subtitles.srt');
  fs.writeFileSync(srt, '1\n00:00:00,700 --> 00:00:02,000\nPLANTE LE COUTEAU\n\n2\n00:00:58,000 --> 00:00:59,900\nVIVE-LIA.BLOGSPOT.COM\n');
  let vuParTesteur = '';
  const resultat = await testerComprehension({ videoPath: 'video.mp4', srtPath: srt, plan, dossier }, {
    extraire: () => ['img-001.jpg', 'img-002.jpg'],
    appelerTesteur: async (images, sousTitres) => {
      vuParTesteur = sousTitres;
      return JSON.stringify({
        idee_principale: 'Une image floue fait obéir le robot', sous_idees: ['a', 'b', 'c'], conclusion: 'Ne pas confier de gestes risqués',
        adresse_blog: 'https://vive-lia.blogspot.com', sources: [{ titre: 'Perceptual Attacks on Embodied AI', auteur: 'Robocurve' }, { titre: 'Vive l\'IA', auteur: '' }],
      });
    },
    appelerJuge: async () => JSON.stringify({ idee_principale: { verdict: 'ok' }, sous_idees: [{ verdict: 'ok' }, { verdict: 'ok' }, { verdict: 'ok' }], conclusion: { verdict: 'ok' } }),
  });
  assert.equal(vuParTesteur, 'PLANTE LE COUTEAU\nVIVE-LIA.BLOGSPOT.COM');
  assert.doesNotMatch(vuParTesteur, /idee_principale|Texte de l'article/);
  assert.equal(resultat.ok, true, resultat.manques.join(' ; '));
  assert.equal(resultat.images, 2);
});

test('test de compréhension : adresse, source, sous-idée et conclusion manquantes sont listées', async () => {
  const plan = planBon();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'comprehension-'));
  const resultat = await testerComprehension({ videoPath: 'video.mp4', texteSecours: 'narration', plan, dossier }, {
    extraire: () => [],
    appelerTesteur: async () => JSON.stringify({ idee_principale: 'robots', sous_idees: [], conclusion: '', adresse_blog: '', sources: [] }),
    appelerJuge: async () => JSON.stringify({ idee_principale: { verdict: 'ok' }, sous_idees: [{ verdict: 'ok' }, { verdict: 'manque', raison: 'non citée' }], conclusion: { verdict: 'faux', raison: 'absente' } }),
  });
  assert.equal(resultat.ok, false);
  assert.ok(contient(resultat.manques, /sous-idée 2 .* manque/));
  assert.ok(contient(resultat.manques, /sous-idée 3 .* manque/));
  assert.ok(contient(resultat.manques, /conclusion faux/));
  assert.ok(contient(resultat.manques, /adresse du blog/));
  assert.ok(contient(resultat.manques, /source non comprise : « Perceptual Attacks/));
});

test('comparerFaits et texteSousTitres', () => {
  const plan = planBon();
  assert.deepEqual(comparerFaits({ adresse_blog: 'www.vive-lia.blogspot.com/2026', sources: [{ titre: 'Perceptual attacks', auteur: '' }, { titre: '', auteur: 'Pierre Médan' }] }, plan), []);
  assert.equal(texteSousTitres('1\n00:00:01,000 --> 00:00:02,000\nBONJOUR\n\n'), 'BONJOUR');
});

test('generate-video.js : plan avant le script, test de compréhension avant l\'envoi pour approbation', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'generate-video.js'), 'utf-8');
  const corps = src.slice(src.indexOf('async function generateLinkedInVideo'), src.indexOf('function generateCaption'));
  const iPlan = corps.indexOf('await genererPlanEditorial(article)');
  const iEcrit = corps.indexOf("'editorial-plan.json'");
  const iScript = corps.indexOf('generateVideoScript(article, plan');
  const iTest = corps.indexOf('await tester()');
  const iMeta = corps.indexOf('const metadata');
  assert.ok(iPlan > 0 && iEcrit > iPlan && iScript > iEcrit, 'plan écrit et enregistré avant le script');
  assert.ok(iTest > iScript && iMeta > iTest, 'test de compréhension avant les métadonnées et l\'approbation');
  assert.match(corps, /'comprehension-test\.json'/);
  assert.ok(corps.indexOf("'RAPPORT.md'") > iTest, 'rapport (plan + test) écrit après le test');
});

test('script trop long : chaque scène trop longue est raccourcie à part, sans réécrire le reste', async () => {
  const plan = planBon();
  const long = scriptBon(plan);
  long.scenes.find((x) => x.planRef === 'developpement.1').narration = Array(150).fill('détail').join(' ') + ' 51 sur 60.';
  const prompts = [];
  const script = await generateVideoScript(ARTICLE, plan, {
    appelerModele: async (p) => {
      prompts.push(p);
      if (/Réécris cette narration/.test(p)) return JSON.stringify({ narration: 'Avec l\'image floue, le robot tente le geste dans 51 essais sur 60.' });
      return JSON.stringify(long);
    },
  });
  const reecritures = prompts.filter((p) => /Réécris cette narration/.test(p));
  assert.ok(reecritures.some((p) => /détail détail/.test(p)), 'la scène trop longue est raccourcie');
  assert.ok(reecritures.every((p) => !/Texte concret|planRef/.test(p)), 'un appel ne porte que sur une narration');
  assert.match(script.scenes.find((x) => x.planRef === 'developpement.1').narration, /51 essais sur 60\.$/);
  assert.equal(script.scenes.find((x) => x.planRef === 'appel').text, 'vive-lia.blogspot.com', 'texte à l\'écran inchangé');
});

test('plan : un texte à l\'écran de 7 mots est raccourci par une passe ciblée, puis vérifié (cas réel du 12 nov.)', async () => {
  const p = planBon();
  p.nuances[1].texte_ecran = 'Pas de risque documenté en usage réel';
  const prompts = [];
  const plan = await genererPlanEditorial(ARTICLE, {
    appelerModele: async (q) => {
      prompts.push(q);
      if (/RACCOURCIS chaque texte d'écran/.test(q)) return JSON.stringify([{ i: 0, texte: 'Risque réel non documenté' }]);
      return JSON.stringify(p);
    },
  });
  assert.equal(prompts.length, 2, 'un appel pour le plan, un pour raccourcir');
  assert.equal(plan.nuances[1].texte_ecran, 'Risque réel non documenté');
});

test('une réponse illisible (Markdown) compte comme un essai raté, pas comme un plantage', async () => {
  const plan = planBon();
  let n = 0;
  const script = await generateVideoScript(ARTICLE, plan, {
    appelerModele: async () => (n++ === 0 ? '**Voici le script** : *à venir*' : JSON.stringify(scriptBon(plan))),
  });
  assert.equal(script.scenes.length, lignesDuPlan(plan).length);
  let m = 0;
  const p = await genererPlanEditorial(ARTICLE, { appelerModele: async () => (m++ === 0 ? '* pas du JSON' : JSON.stringify(planBon())) });
  assert.equal(p.appel.adresse_blog, 'vive-lia.blogspot.com');
});

test('une nuance chiffrée prend la source principale de l\'étude', async () => {
  const plan = planBon();
  const s = scriptBon(plan);
  s.scenes.find((x) => x.planRef === 'nuance.1').text = '1 seul robot, en labo';
  assert.ok(!contient(validerScript(s, plan), /chiffre à l'écran sans source/));
  const script = await generateVideoScript(ARTICLE, plan, { appelerModele: async () => JSON.stringify(s) });
  assert.match(script.scenes.find((x) => x.planRef === 'nuance.1').source, /Perceptual Attacks on Embodied AI/);
});

test('corrections mécaniques : « nuances.1 » devient « nuance.1 », la scène sources affiche « Sources : … et N autres »', async () => {
  const plan = planBon();
  const s = scriptBon(plan);
  s.scenes.find((x) => x.planRef === 'nuance.1').planRef = 'nuances.1';
  s.scenes.find((x) => x.planRef === 'sources').text = 'Sources';
  const script = await generateVideoScript(ARTICLE, plan, { appelerModele: async () => JSON.stringify(s) });
  assert.ok(script.scenes.some((x) => x.planRef === 'nuance.1'));
  assert.equal(script.scenes.find((x) => x.planRef === 'sources').text, 'Sources : Robocurve et 1 autre');
});

test('une citation inventée bloque la génération plutôt que de supprimer le dessin', async () => {
  const plan = planBon();
  const s = scriptBon(plan);
  s.scenes.find((x) => x.planRef === 'nuance.2').visuel = { type: 'citation', texte: 'Le problème est identifié. Comment le résoudre ?', auteur: 'Question ouverte' };
  const vraie = scriptBon(plan);
  vraie.scenes.find((x) => x.planRef === 'nuance.2').visuel = { type: 'citation', texte: 'la pointe pénètre l\'objet', auteur: 'Robocurve' };
  const article = { ...ARTICLE, content: 'Le robot avance « la pointe pénètre l\'objet », écrit Robocurve.' };
  const { validerVisuels } = require('../scripts/generate-script-dynamic');
  assert.ok(contient(validerVisuels(s, plan, article), /citation absente de l'article/));
  assert.deepEqual(validerVisuels(vraie, plan, article), []);
  await assert.rejects(generateVideoScript(article, plan, { appelerModele: async () => JSON.stringify(s) }), /citation absente de l'article/);
});

test('nom du blog : « Vivre l\'IA » est corrigé avant la voix, un autre nom est refusé, l\'adresse n\'est pas touchée', async () => {
  const { corrigerNomBlog, nomBlogFautif } = require('../scripts/editorial-plan');
  // Écrit par Haiku le 12 nov. 2026 (7e génération)
  assert.equal(corrigerNomBlog("L'analyse complète est sur le blog Vivre l'IA : vive-lia.blogspot.com"),
    "L'analyse complète est sur le blog Vive l'IA : vive-lia.blogspot.com");
  assert.equal(corrigerNomBlog('sur le blog Vive l’I.A. : vive-lia.blogspot.com'), "sur le blog Vive l'IA : vive-lia.blogspot.com");
  assert.equal(corrigerNomBlog('vive-lia.blogspot.com'), 'vive-lia.blogspot.com');
  assert.equal(nomBlogFautif("sur le blog Vive l'IA : vive-lia.blogspot.com"), '');
  assert.equal(nomBlogFautif('sur le blog Vive-lia.blogspot.com'), '');
  assert.equal(nomBlogFautif("sur le blog L'IA au quotidien : vive-lia.blogspot.com"), "L'IA au quotidien");

  const plan = planBon();
  const mauvais = scriptBon(plan);
  mauvais.scenes.find((s) => s.planRef === 'appel').narration = "L'analyse complète est sur le blog L'IA au quotidien : vive-lia.blogspot.com";
  assert.ok(contient(validerScript(mauvais, plan), /le blog s'appelle « Vive l'IA », pas « L'IA au quotidien »/));

  const vivre = scriptBon(plan);
  vivre.scenes.find((s) => s.planRef === 'appel').narration = "L'analyse complète est sur le blog Vivre l'IA : vive-lia.blogspot.com";
  const script = await generateVideoScript(ARTICLE, plan, { appelerModele: async () => JSON.stringify(vivre) });
  assert.match(script.scenes.find((s) => s.planRef === 'appel').narration, /le blog Vive l'IA : vive-lia\.blogspot\.com/);
});
