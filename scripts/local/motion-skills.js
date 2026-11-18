/** Adaptation locale de ressources motion figées et de six packs de direction. Aucun code upstream n'est chargé dans le navigateur. */
const fs = require('node:fs');
const path = require('node:path');
const {randomInt}=require('node:crypto');
const { execFileSync } = require('node:child_process');
const { choisirMotions, consignesRecettes } = require('./motion-recipes');
const { STYLES, choisirStyle, reglesComposition } = require('./motion-composition');
const SKILLS = path.resolve(__dirname, '../../.agents/skills');
const HISTORIQUES=['motion-anything-video','claude-motion-video','iart-motion-video'];
const REGISTRE=JSON.parse(fs.readFileSync(path.join(SKILLS,'video-directions-registry.json'),'utf8'));
const NOMS=[...HISTORIQUES,...REGISTRE.filter(s=>s.statut==='actif').map(s=>s.skill)];
const {decorScene}=require('./directions-visuelles');
const lire = (nom, fichier) => fs.readFileSync(path.join(SKILLS, nom, 'references', fichier), 'utf8');
const catalogue = JSON.parse(lire(NOMS[0], 'recipes-index.json'));

/** Tirage uniforme une fois par vidéo ; reprises et storyboard relisent le même choix. */
function choisirSkill(dossier,demande,options={}){
 const fichier=dossier&&path.join(dossier,'selection-motion.json');
 const verifier=selection=>{if(!NOMS.includes(selection?.skill))throw Error('Skill motion inconnue ou inactive : '+selection?.skill);return selection;};
 if(fichier&&fs.existsSync(fichier)){
  const selection=verifier(JSON.parse(fs.readFileSync(fichier,'utf8')));
  if(demande&&demande!==selection.skill)throw Error('La direction de cette vidéo est déjà fixée : '+selection.skill);
  return selection;
 }
 const skill=demande||NOMS[(options.tirer||randomInt)(NOMS.length)];
 const selection=verifier({skill,mode:demande?'impose':'aleatoire',date:new Date().toISOString(),candidats:[...NOMS],regle:'Un skill directeur par vidéo ; choix conservé dans toutes les reprises.'});
 if(fichier){fs.mkdirSync(dossier,{recursive:true});fs.writeFileSync(fichier,JSON.stringify(selection,null,2),{flag:'wx'});}
 return selection;
}
function consignesMotion(selection={skill:HISTORIQUES[0]}) {
 if(!NOMS.includes(selection.skill))throw Error('Skill motion inconnue ou inactive : '+selection.skill);
 return '\nSKILL DIRECTEUR UNIQUE : ['+selection.skill+']. Appliquer son langage ; ne pas fusionner les autres directions.\n'+lire(selection.skill,'video-rules.md').trim()+
  '\nCONTRAT COMMUN DE PIERRE : français, faits et sources du plan, avatar, orthographe usuelle à l’écran. Voix locale : OpenAI → Open-A-I, ChatGPT → tchat gépété, IA → i-a et l’IA → l’i-a ; prises brutes ×1,10 avant le calage. Nouveau dessin animé ≤2 s après mesure de la voix, lecture stable, direction adaptée au sujet et compositions variées. Earshot local sur le MP4 final, mesures/timeline/critique/planche ; contrôle visuel, compréhension et approbation avant publication. Aucune nouvelle API payante, aucun téléversement audio.\n'+consignesRecettes()+reglesComposition();
}

function profilMotion(type) {
  const recette = type === 'compteur' ? 'count-up' : ['barres', 'etapes', 'comparaison', 'sources'].includes(type) ? 'stagger-list' : 'fade-in-up';
  const r = catalogue.find(x => x.id === recette && !x.parse_error);
  if (!r || r.license?.spdx !== 'Apache-2.0') throw Error(`Recette motion absente ou licence inattendue : ${recette}`);
  return { recette, entree_s: 0.46, sortie_s: 0.22, decalage_s: 0.07, distance_px: 24,
    ease: 'cubic-bezier(0.16,1,0.3,1)', courbe: [0.16, 1, 0.3, 1],
    avoid_when: r.avoid_when, licence: r.license.spdx, manifeste: r.manifest };
}

/** Bézier de claude-motion/MOTION-SPEC ; inversion de x pour obtenir y au temps exact. */
function easeMotion(progress) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const valeur = (t, a, b) => 3 * (1-t) * (1-t) * t * a + 3 * (1-t) * t * t * b + t*t*t;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (valeur(mid, 0.16, 0.3) < progress) lo = mid; else hi = mid;
  }
  return valeur((lo + hi) / 2, 1, 1);
}

function planMotion(script, fenetres) {
  const choix = choisirMotions(script.scenes, fenetres, script.title || '');
  const style = choisirStyle(script.title || '', script.motionStyle);
  const utilisees=script.selectionMotion?[...new Set(['motion-anything-video','claude-motion-video',script.selectionMotion.skill])]:NOMS;
  return { version: 5, style, selection:script.selectionMotion||null, bibliotheque:[...NOMS], direction:script.directionArtistique||null, moteur: 'Hyperframes/GSAP',
    ressources_indisponibles:REGISTRE.filter(s=>s.statut!=='actif').map(({skill,statut,license})=>({skill,statut,license})),
    sources: utilisees.map(n => ({ skill: n, ...JSON.parse(lire(n, 'provenance.json'))[0] })),
    references_completes: utilisees.flatMap(n => JSON.parse(lire(n, 'provenance.json'))),
    scenes: script.scenes.map((s, i) => ({ id: fenetres[i].id || `s${i}`, planRef: s.planRef,
      debut: fenetres[i].debut, duree: fenetres[i].duree,
      ...profilMotion(['appel', 'sources'].includes(s.planRef) ? s.planRef : s.visuel?.type),
      ...choix[i], style:STYLES.includes(s.motionStyle)?s.motionStyle:style, decor:decorScene(s.planRef), cadrage:s.visuel?.elements?.some(n=>n.type==='illustration')?'objets_illustres':'composition',
      profondeur:{fond:0.35,objet:0.7,avant:1.4,texte:0},
      adaptation: 'Timeline GSAP pausée ; révélation calée sur la voix ; aucune RAF upstream.' })) };
}

function genererKitSons(dossier) {
  const sortie = path.join(dossier, 'motion-sfx');
  execFileSync('python3', [path.join(SKILLS, 'claude-motion-video/scripts/generate_sfx.py'), sortie], { stdio: 'pipe', timeout: 30000 });
  return sortie;
}

/** Images de début, milieu, fin de chaque scène ; elles restent à examiner, pas d'auto-certification. */
function revueMotion(video, fenetres, dossier, ffmpeg) {
  const sortie = path.join(dossier, 'motion-review');
  fs.mkdirSync(sortie, { recursive: true });
  const images = [];
  fenetres.forEach((f, i) => {
    const offsets = [0, Math.min(0.7, f.duree / 2), Math.max(0, f.duree - 0.25)];
    offsets.forEach((dt, j) => {
      const t = f.debut + dt;
      const fichier = `s${i}-${j}.jpg`;
      execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', t.toFixed(3), '-i', video, '-frames:v', '1', '-vf', 'scale=270:-2', path.join(sortie, fichier)], { stdio: 'pipe', timeout: 30000 });
      images.push({ fichier, t: +t.toFixed(3), scene: `s${i}` });
    });
  });
  const planches = [];
  for (let n = 0; n < images.length; n += 9) {
    const page = images.slice(n, n+9);
    const args = page.flatMap(x => ['-i', path.join(sortie, x.fichier)]);
    // Grille 3 × 3 ; la position correspond aux entrées datées de review.json.
    const layout = page.map((_, i) => `${(i % 3) * 270}_${Math.floor(i / 3) * 480}`).join('|');
    const fichier = `contact-sheet-${Math.floor(n / 9)+1}.png`;
    const filtre = page.length === 1 ? '[0:v]null[out]' : page.map((_, i) => `[${i}:v]`).join('') + `xstack=inputs=${page.length}:layout=${layout}:fill=black[out]`;
    execFileSync(ffmpeg, ['-v', 'error', '-y', ...args, '-filter_complex', filtre, '-map', '[out]', '-frames:v', '1', path.join(sortie, fichier)], { stdio: 'pipe', timeout: 30000 });
    planches.push(fichier);
  }
  const rapport = { statut: 'images_a_examiner', images, planches,
    controles: ['Première image lisible', 'Texte immobile pendant la lecture', 'Sources et avatar sans collision', 'Un centre d’attention', 'Transitions sans trou noir'] };
  fs.writeFileSync(path.join(sortie, 'review.json'), JSON.stringify(rapport, null, 2));
  return rapport;
}

module.exports = { choisirSkill, consignesMotion, profilMotion, easeMotion, planMotion, genererKitSons, revueMotion };
