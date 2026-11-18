#!/usr/bin/env node
/** Témoin de rendu court et local : aucune voix, aucun article réel, aucune publication. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { htmlScene } = require('./local/scenes-visuelles');
const { CSS_RACINE } = require('./local/rendu-hyperframes');
const { planMotion, genererKitSons, revueMotion } = require('./local/motion-skills');
const CONFIG = require('./local/config-locale');
const { RECETTES } = require('./local/motion-recipes');

function witness(destination, catalogue = false) {
  const out = path.resolve(destination);
  const project = path.join(out, 'hyperframes');
  for (const d of ['compositions', 'vendor']) fs.mkdirSync(path.join(project, d), { recursive: true });
  fs.copyFileSync(CONFIG.GSAP, path.join(project, 'vendor/gsap.min.js'));
  const scenes = [
    { planRef: 'accroche', text: 'Un mouvement, une idée', visuel: { type: 'titre' } },
    { planRef: 'developpement.1', text: 'Une donnée reste exacte', source: 'Donnée fictive du témoin technique', visuel: { type: 'compteur', valeur: 42, libelle: 'Exemple de compteur' } },
    { planRef: 'developpement.2', text: 'Les étapes restent lisibles', visuel: { type: 'etapes', etapes: ['Choisir une recette', 'Respecter la parole', 'Vérifier le rendu'] } },
  ];
  if (catalogue) {
    const exemples = {
      titre: {type:'titre'},
      compteur: {type:'compteur',valeur:42,sur:100,unite:'%',libelle:'Part des essais réussis'},
      barres: {type:'barres',unite:'%',donnees:[{libelle:'Avant',valeur:27},{libelle:'Après',valeur:87.7}]},
      comparaison: {type:'comparaison',gauche:{titre:'Avant',texte:'Les notes sont écrites manuellement'},droite:{titre:'Après',texte:'La transcription aide les participants'}},
      etapes: {type:'etapes',etapes:['Observer le résultat','Vérifier les sources','Partager les conclusions']},
      citation: {type:'citation',texte:'La preuve précède la conclusion.',auteur:'Auteur du témoin'},
    };
    scenes.splice(0, scenes.length, ...RECETTES.map(r => ({planRef:'developpement.1',text:r.nom,source:'Données fictives du témoin technique',visuel:exemples[r.type],motion:{recette:r.id}})));
  }
  const frames = scenes.map((s, i) => ({ id: `s${i}`, debut: i * 3.5, duree: 3.5 }));
  const motionPlan = planMotion({ title: 'Témoin des compositions', scenes }, frames);
  scenes.forEach((s, i) => fs.writeFileSync(path.join(project, `compositions/s${i}.html`), htmlScene(s,
    { id: `s${i}`, debut: frames[i].debut, duree: frames[i].duree, nbSousIdees: 2, mots: [], premier: i === 0, dernier: i === scenes.length-1, motion: motionPlan.scenes[i] })));
  fs.writeFileSync(path.join(out, 'motion-plan.json'), JSON.stringify(motionPlan, null, 2));
  fs.writeFileSync(path.join(project, 'index.html'), `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>Témoin motion skills</title><script src="vendor/gsap.min.js"></script><style>${CSS_RACINE}</style></head><body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${scenes.length*3.5}" data-width="1080" data-height="1920" data-fps="30">
  ${frames.map(f => `<div id="${f.id}" data-composition-id="${f.id}" data-composition-src="compositions/${f.id}.html" data-start="${f.debut}" data-duration="${f.duree}" data-width="1080" data-height="1920" data-track-index="1" data-track-kind="graphics"></div>`).join('\n')}
  </div><script>window.__timelines = {main: gsap.timeline({paused:true})};</script></body></html>`);
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  fs.writeFileSync(path.join(project, 'hyperframes.json'), JSON.stringify({ paths: { blocks: 'compositions', assets: 'assets' } }));
  const video = path.join(out, 'motion-skills-witness.mp4');
  const run = args => process.env.HYPERFRAMES_CLI
    ? execFileSync(process.execPath, [process.env.HYPERFRAMES_CLI, ...args], { cwd: project, stdio: 'pipe', timeout: 300000, maxBuffer: 32 * 1024 * 1024 })
    : execFileSync('npx', ['--offline', '--yes', CONFIG.HYPERFRAMES, ...args], { cwd: project, stdio: 'pipe', timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
  fs.writeFileSync(path.join(out, 'hyperframes-check.json'), run(['check', '--json']));
  run(['render', '--quality', 'draft', '--output', video, '--quiet']);
  const review = revueMotion(video, frames, out, CONFIG.FFMPEG);
  const kit = genererKitSons(out);
  fs.writeFileSync(path.join(out, 'temoin.json'), JSON.stringify({ video, kit, review, duree_attendue: scenes.length*3.5, designs:motionPlan.scenes.map(s=>s.design), publication: false }, null, 2));
  console.log(JSON.stringify({ video, images: review.images.length, designs: motionPlan.scenes.map(s=>s.design), kit }, null, 2));
}

if (require.main === module) witness(process.argv[2] || path.join(os.tmpdir(), 'motion-skills-witness'), process.argv.includes('--catalogue'));
module.exports = { witness };
