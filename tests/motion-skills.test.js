const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { profilMotion, consignesMotion, planMotion, easeMotion } = require('../scripts/local/motion-skills');
const { htmlScene } = require('../scripts/local/scenes-visuelles');

test('motion : chaque skill actif peut diriger seul le vrai prompt, avec ses sources figées', () => {
  const {promptScript}=require('../scripts/generate-script-dynamic');
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/plan-plante-le-couteau.json')));
  const plan=planMotion({scenes:[{planRef:'accroche',visuel:{type:'titre'}},{planRef:'developpement.1',visuel:{type:'compteur'}}]},[{debut:0,duree:3},{debut:3,duree:4}]);
  assert.equal(plan.scenes[0].recette,'fade-in-up');assert.equal(plan.scenes[1].recette,'count-up');
  assert.equal(plan.bibliotheque.length,10);assert.ok(plan.sources.every(s=>/^[a-f0-9]{40}$/.test(s.commit)));
  for(const skill of plan.bibliotheque){
    const selection={skill},prompt=consignesMotion(selection),complet=promptScript({title:'Test'},fixture,[],[],selection);
    assert.ok(complet.includes(prompt));assert.ok(complet.includes('['+skill+']'));
    for(const autre of plan.bibliotheque.filter(n=>n!==skill))assert.ok(!complet.includes('['+autre+']'),skill+' ne doit pas charger '+autre);
    assert.equal(complet.includes('TRAITEMENT LEMO-OPUSCAR'),skill==='lemo-opuscar-video');
    assert.ok(complet.includes('Earshot local'));assert.ok(complet.includes('Open-A-I'));
  }
  assert.equal(profilMotion('inconnu').recette,'fade-in-up');
});
test('le tirage uniforme couvre les dix skills, persiste et ne change pas pendant les reprises',()=>{
 const {choisirSkill}=require('../scripts/local/motion-skills');const noms=planMotion({scenes:[]},[]).bibliotheque;
 for(let i=0;i<noms.length;i++)assert.equal(choisirSkill(null,null,{tirer:n=>{assert.equal(n,noms.length);return i;}}).skill,noms[i]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tirage-motion-'));
 try{
  const a=choisirSkill(dir,null,{tirer:()=>9});assert.equal(a.skill,'lemo-opuscar-video');assert.equal(a.mode,'aleatoire');
  assert.deepEqual(choisirSkill(dir,null,{tirer:()=>{throw Error('ne pas retirer');}}),a);
  assert.throws(()=>choisirSkill(dir,'inconnu'),/déjà fixée/);
  assert.throws(()=>choisirSkill(null,'inconnu'),/inconnue ou inactive/);
  assert.equal(choisirSkill(null,'anything2explainer-video').mode,'impose');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('motion : le son procédural donne des WAV identiques, bornés et sans appel réseau', () => {
  const { genererKitSons } = require('../scripts/local/motion-skills');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-sfx-test-'));
  try {
    const a = genererKitSons(path.join(tmp, 'a'));
    const b = genererKitSons(path.join(tmp, 'b'));
    for (const name of ['whoosh.wav', 'pop.wav', 'impact.wav']) {
      const x = fs.readFileSync(path.join(a, name));
      const y = fs.readFileSync(path.join(b, name));
      assert.equal(createHash('sha256').update(x).digest('hex'), createHash('sha256').update(y).digest('hex'));
      assert.equal(x.toString('ascii', 0, 4), 'RIFF');
      assert.equal(x.readUInt32LE(24), 48000);
      let peak = 0;
      for (let i = 44; i < x.length; i += 2) peak = Math.max(peak, Math.abs(x.readInt16LE(i)));
      assert.ok(peak > 1000 && peak <= 0.451 * 32767);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('motion : les vraies timelines restent déterministes, bornées et gardent le premier titre visible', () => {
  const scene = { planRef: 'developpement.1', text: 'Un résultat mesuré', source: 'Étude', visuel: { type: 'etapes', etapes: ['Première étape', 'Seconde étape', 'Dernière étape'] } };
  const options = { id: 's0', duree: 3.2, debut: 0, mots: [], nbSousIdees: 2, premier: false };
  const html = htmlScene(scene, options);
  assert.equal(html, htmlScene(scene, options));
  const calls = [];
  const timeline = {};
  for (const method of ['fromTo', 'to', 'set']) timeline[method] = (...args) => { calls.push([method, ...args]); return timeline; };
  const context = { gsap: { timeline: () => timeline }, window: {}, document: {} };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  assert.equal(context.window.__timelines.s0, timeline);
  for (const [method, target, from, to, start] of calls) {
    const vars = method === 'fromTo' ? to : from;
    const t = method === 'fromTo' ? start : to;
    assert.ok(Number.isFinite(t) && t >= 0, `début ${target} : ${t}`);
    assert.ok(t + (vars.duration || 0) <= options.duree + 0.001, `fin ${target}`);
  }
  const entrance = calls.find(x => x[0] === 'fromTo' && x[1] === '#s0-titre');
  assert.equal(entrance[3].duration, profilMotion('titre').entree_s);
  assert.equal(typeof entrance[3].ease, 'function');
  assert.ok(Math.abs(entrance[3].ease(0.5) - easeMotion(0.5)) < 1e-8);
  assert.ok(calls.filter(x => String(x[1]).includes('-e')).every(x => x[3].duration === profilMotion('etapes').entree_s));
  const first = htmlScene({ ...scene, planRef: 'accroche', visuel: { type: 'titre' } }, { ...options, premier: true });
  assert.doesNotMatch(first, /fromTo\("#s0-titre", \{ opacity: 0/);
});

test('motion : courbe Bézier exacte et un seul impact sur la timeline de la voix', () => {
  assert.equal(easeMotion(0), 0);
  assert.equal(easeMotion(1), 1);
  assert.ok(easeMotion(0.5) > 0.96 && easeMotion(0.5) < 0.98);
  let before = 0;
  for (let i = 0; i <= 100; i++) { const v = easeMotion(i/100); assert.ok(v >= before && v <= 1); before = v; }
  const { reperesSons } = require('../scripts/local/rendu-hyperframes');
  const f = [0, 3, 6, 9].map(debut => ({ debut, duree: 3 }));
  const sons = reperesSons(f, { scenes: ['accroche', 'developpement.1', 'conclusion', 'appel'].map(planRef => ({ planRef })) });
  const hits = sons.filter(s => s.fichier === 'impact.ogg');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].t, f[2].debut + 0.25);
});
