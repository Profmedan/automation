const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateVideoScript, validerVisuels } = require('../scripts/generate-script-dynamic');
const { lignesDuPlan } = require('../scripts/editorial-plan');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/plan-plante-le-couteau.json')));
const article = { title: 'Image floue ou retouchée', content: '', url: plan.appel.article_url || 'https://vive-lia.blogspot.com/2026/11/image-floue-ou-retouchee-des-robots.html' };
function proposition() {
  return { title:article.title, motionStyle:'blueprint', scenes:lignesDuPlan(plan).map(planRef=>({
    planRef, comprend:'Une idée vérifiable du plan', duration:4, text:'Une idée précise devient visible',
    narration:planRef==='appel'?plan.appel.texte_voix:planRef==='sources'?'Sources : Robocurve, Perceptual Attacks on Embodied AI ; et l’article de Vive l’IA.':`Narration concrète de ${planRef} : une idée précise et vérifiable.`,
    visuel:{type:'composition',intention:'Montrer une relation du plan',elements:[
      {id:'image_nette',type:'carte',texte:'Image nette',x:5,y:20,w:38,h:40,mouvement:'volet'},
      {id:'décision',type:'carte',texte:'Décision du robot',x:57,y:20,w:38,h:40,mouvement:'zoom'},
    ],liens:[{de:'image_nette',vers:'décision'}]},
  }))};
}

test('les identifiants du modèle sont canoniques sans perdre les liens ni les dessins', async()=>{
  const s = await generateVideoScript(article,plan,{appelerModele:async()=>JSON.stringify(proposition())});
  for(const scene of s.scenes.filter(s=>!['appel','sources'].includes(s.planRef))) {
    assert.equal(scene.visuel.type,'composition');
    assert.deepEqual(scene.visuel.elements.map(e=>e.id),['e0','e1']);
    assert.deepEqual(scene.visuel.liens,[{de:'e0',vers:'e1'}]);
  }
  assert.deepEqual(validerVisuels(s,plan,article),[]);
});

test('un dessin invalide ne devient jamais silencieusement un titre ; le diagnostic conserve la réponse', async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-telegram-'));
  const s=proposition();s.scenes[2].visuel.elements[1].id='image_nette';
  try {
    await assert.rejects(generateVideoScript(article,plan,{dossierDiagnostic:dir,appelerModele:async()=>JSON.stringify(s)}),/Script invalide après 3 essais.*identifiant invalide ou répété/s);
    const journal=JSON.parse(fs.readFileSync(path.join(dir,'script-essai-3.json')));
    assert.equal(journal.script.scenes[2].visuel.elements[0].id,'image_nette');
    assert.ok(journal.erreurs.some(e=>e.includes('identifiant invalide ou répété')));
    await assert.rejects(generateVideoScript(article,plan,{dossierDiagnostic:dir,appelerModele:async()=>JSON.stringify(s)}),/Script invalide après 3 essais/);
    assert.equal(fs.readdirSync(dir).filter(n=>n.startsWith('script-essai-')).length,6,'une seconde production conserve les diagnostics de la première');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('la génération refuse une vidéo qui ignore les compositions ouvertes du développement', async()=>{
  const s=proposition();s.scenes.forEach(s=>{s.visuel={type:'titre'};});
  await assert.rejects(generateVideoScript(article,plan,{appelerModele:async()=>JSON.stringify(s)}),/Script invalide après 3 essais.*compositions originales/s);
});

test('la normalisation ne crée jamais une relation depuis un identifiant inconnu',()=>{
  const {normaliserComposition,validerComposition}=require('../scripts/local/motion-composition');
  const v=proposition().scenes[0].visuel;
  v.liens[0].vers='e0'; // Ce nom ne désigne aucun élément de la réponse originale.
  const original=structuredClone(v);
  normaliserComposition(v);
  assert.deepEqual(v,original);
  assert.ok(validerComposition(v).some(e=>e.includes('extrémité invalide')));
});

test('les sous-titres restent contrastés sur le fond clair de la vraie vidéo',()=>{
  const {htmlSousTitres}=require('../scripts/local/rendu-hyperframes');
  const html=htmlSousTitres([],4,'paper');
  const couleur=html.match(/\.st-groupe\s*\{[^}]*color:\s*(#[a-f0-9]+)/i)[1];
  const luminance=hex=>{
    let h=hex.slice(1);if(h.length===3)h=h.split('').map(c=>c+c).join('');
    return h.match(/../g).map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  };
  const plaque=html.match(/background:\s*(#[a-f0-9]{6})/i)[1];
  const fond=luminance(plaque),texte=luminance(couleur);
  assert.ok((Math.max(fond,texte)+.05)/(Math.min(fond,texte)+.05)>=4.5,'contraste suffisant pour lire les paroles');
});


test('le générateur et ses reprises transmettent uniquement le skill directeur enregistré',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'direction-telegram-')),prompts=[];
 try{
  const r=await generateVideoScript({...article,motionSkill:'lemo-opuscar-video'},plan,{dossierDiagnostic:dir,appelerModele:async p=>{prompts.push(p);return JSON.stringify(proposition());}});
  assert.equal(r.selectionMotion.skill,'lemo-opuscar-video');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'selection-motion.json'))).skill,'lemo-opuscar-video');
  assert.ok(prompts.every(p=>p.includes('[lemo-opuscar-video]')&&!p.includes('[bang-motion-video]')));
  const m=require('../scripts/local/motion-skills').planMotion(r,r.scenes.map((_,i)=>({id:'s'+i,debut:i*4,duree:4})));
  assert.equal(m.selection.skill,'lemo-opuscar-video');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
