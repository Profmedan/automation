const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validerVisuel, htmlScene } = require('../scripts/local/scenes-visuelles');
const { planMotion } = require('../scripts/local/motion-skills');
const { MOUVEMENTS, STYLES, validerComposition, reglesComposition, enregistrerBanque, lireBanque } = require('../scripts/local/motion-composition');

const composition = () => ({ type:'composition', intention:'Montrer les échanges entre deux participants',
  elements:[
    {id:'humain',type:'carte',texte:'Les participants',x:2,y:20,w:37,h:34,mouvement:'volet'},
    {id:'ia',type:'carte',texte:'Un assistant',x:61,y:20,w:37,h:34,mouvement:'zoom'},
    {id:'preuve',type:'donnee',valeur:42,unite:'%',texte:'Essais réussis',x:28,y:65,w:44,h:32,mouvement:'impact'},
  ], liens:[{de:'humain',vers:'ia',texte:'Échange'}] });

test('composition ouverte : géométrie libre distincte des faits, mouvements contrôlés', () => {
  assert.deepEqual(validerVisuel(composition(),'scène','Les participants échangent avec un assistant. Essais réussis : 42 %.'),[]);
  const falseData=composition();falseData.elements[2].valeur=99;
  assert.ok(validerVisuel(falseData,'scène','Essais réussis : 42 %.').some(x=>x.includes('99')));
  falseData.elements[2].valeur=0;
  assert.ok(validerVisuel(falseData,'scène','Essais réussis : 42 %.').some(x=>x.includes('0')));
  const out=composition();out.elements[0].x=80;
  assert.ok(validerComposition(out).length);
  const code=composition();code.elements[0].mouvement='eval(document.cookie)';
  assert.ok(validerComposition(code).length);
  const link=composition();link.liens[0].vers='inconnu';
  assert.ok(validerComposition(link).length);
  assert.ok(MOUVEMENTS.length>=16);assert.ok(STYLES.length>=6);
  assert.match(reglesComposition(),/composition/);
});

test('le vrai plan et le vrai HTML exécutent une composition sans identifiant de gabarit', () => {
  const scene={planRef:'developpement.1',text:'Les échanges deviennent visibles',source:'Article',visuel:composition()};
  const script={title:'Un sujet inédit',motionStyle:'neon',scenes:[scene]};
  const p=planMotion(script,[{debut:0,duree:5}]);
  assert.equal(p.scenes[0].design,'composition');assert.equal(p.scenes[0].style,'neon');
  const html=htmlScene(scene,{id:'s0',duree:5,debut:0,mots:[],nbSousIdees:2,motion:p.scenes[0]});
  assert.match(html,/Les participants/);assert.match(html,/>42</);assert.match(html,/s0-noeud-ia/);
  assert.equal(html,htmlScene(scene,{id:'s0',duree:5,debut:0,mots:[],nbSousIdees:2,motion:p.scenes[0]}));
  const calls=[];const tl={};for(const m of ['set','to','fromTo'])tl[m]=(...a)=>{calls.push([m,...a]);return tl;};
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{gsap:{timeline:()=>tl},window:{},document:{}});
  assert.ok(calls.some(x=>x[1]==='#s0-noeud-ia'));
  for(const [m,target,a,b,t] of calls){const vars=m==='fromTo'?b:a,start=m==='fromTo'?t:b;assert.ok(start>=0&&start+(vars.duration||0)<=5, target);}
  const bad=composition();bad.elements[0].texte='<img src=x onerror=alert(1)>';
  const safe=htmlScene({...scene,visuel:bad},{id:'s0',duree:5,debut:0,mots:[],motion:p.scenes[0]});
  assert.doesNotMatch(safe,/<img src=x/);
});

test('styles : choix explicite vérifié ou choix reproductible par vidéo', () => {
  for(const style of STYLES){
    const p=planMotion({title:'Test',motionStyle:style,scenes:[{planRef:'accroche',text:'Une idée nouvelle',visuel:{type:'titre'}}]},[{debut:0,duree:4}]);
    assert.equal(p.scenes[0].style,style);
  }
  const styles=new Set(Array.from({length:30},(_,i)=>planMotion({title:'Sujet '+i,scenes:[{visuel:{type:'titre'}}]},[{debut:0,duree:4}]).scenes[0].style));
  assert.ok(styles.size>=6);
});

test('banque extensible : nouveaux dessins enregistrés, dédupliqués et réutilisables sans faits anciens', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-open-bank-'));
  try{
    const s={scenes:[{visuel:composition()}]};
    const ids=enregistrerBanque(s,dir);assert.equal(ids.length,1);
    s.scenes[0].visuel.elements[2].valeur=99;s.scenes[0].visuel.elements[0].texte='Autre ancien fait';
    assert.deepEqual(enregistrerBanque(s,dir),ids);
    assert.equal(fs.readdirSync(dir).length,1);
    const bank=lireBanque(dir,'Article suivant');
    assert.equal(bank.length,1);assert.deepEqual(validerComposition(bank[0]),[]);
    assert.doesNotMatch(JSON.stringify(bank),/99|Autre ancien fait|Les participants|humain|Essais réussis/);
    const p=JSON.parse(fs.readFileSync(path.join(dir,ids[0]+'.json')));p.gabarit.elements[0].src='https://example.com/secret';
    fs.writeFileSync(path.join(dir,ids[0]+'.json'),JSON.stringify(p));assert.equal(lireBanque(dir,'Test').length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('tous les mouvements compilent ; un seul effet dominant dans une vidéo réelle', () => {
  for(const mouvement of MOUVEMENTS){
    const v=composition();v.elements.forEach(e=>{e.mouvement='fondu';});v.elements[0].mouvement=mouvement;
    const scene={planRef:'developpement.1',text:'Le mouvement sert cette idée',visuel:v};
    const p=planMotion({title:'Test',scenes:[scene]},[{debut:0,duree:3.5}]);
    const html=htmlScene(scene,{id:'s0',duree:3.5,debut:0,mots:[],motion:p.scenes[0]});
    const calls=[];const tl={};for(const m of ['set','to','fromTo'])tl[m]=(...a)=>{calls.push([m,...a]);return tl;};
    vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{gsap:{timeline:()=>tl},window:{},document:{}});
    for(const [m,target,a,b,t] of calls){
      const vars=m==='fromTo'?b:a,start=m==='fromTo'?t:b;assert.ok(start>=0&&start+(vars.duration||0)<=3.5,mouvement+' '+target);
      if(m==='fromTo')for(const k of ['x','y','scale','scaleX','rotation','rotationX','rotationY','skewY'])if(k in a)assert.equal(b[k],k.startsWith('scale')?1:0,mouvement+' état final '+k);
    }
  }
  const scenes=Array.from({length:5},()=>({visuel:composition()}));
  const p=planMotion({title:'Une seule emphase',scenes},scenes.map((_,i)=>({debut:i*4,duree:4})));
  assert.equal(p.scenes.filter(s=>s.emphase).length,1);
});

test('générateur : une composition originale traverse la validation et le prompt reçoit la banque sans faits anciens', async () => {
  const {generateVideoScript}=require('../scripts/generate-script-dynamic');
  const {lignesDuPlan}=require('../scripts/editorial-plan');
  const plan=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/plan-plante-le-couteau.json')));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-script-bank-'));
  const visuel=composition();visuel.elements[2].valeur=27;
  enregistrerBanque({scenes:[{visuel}]},dir);
  const script={title:'Image floue ou retouchée',motionStyle:'cinematic',scenes:lignesDuPlan(plan).map(ref=>({planRef:ref,comprend:'Une idée vérifiable du plan',
    narration:ref==='appel'?plan.appel.texte_voix:ref==='sources'?'Sources : Robocurve, Perceptual Attacks on Embodied AI ; et l’article de Vive l’IA.':`Narration concrète de ${ref} : une idée précise et vérifiable.`,
    text:ref==='appel'?'vive-lia.blogspot.com':ref==='sources'?'Robocurve et Vive l’IA':'Une idée précise devient visible',duration:4,visuel:structuredClone(visuel)}))};
  let prompt='';
  try{
    const result=await generateVideoScript({title:script.title,content:'Texte de l’article.',url:plan.appel.article_url||'https://vive-lia.blogspot.com/2026/11/image-floue-ou-retouchee-des-robots.html'},plan,{banqueMotion:dir,appelerModele:async p=>{prompt=p;return JSON.stringify(script);}});
    assert.equal(result.motionStyle,'cinematic');
    assert.ok(result.scenes.filter(s=>!['appel','sources'].includes(s.planRef)).every(s=>s.visuel.type==='composition'));
    assert.match(prompt,/DISPOSITIONS DE LA BANQUE LOCALE/);
    assert.match(prompt,/BANQUE OUVERTE/);
    const exemplaires=prompt.split('DISPOSITIONS DE LA BANQUE LOCALE')[1].split('VISUELS :')[0];
    assert.doesNotMatch(exemplaires,/Les participants|Essais réussis/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
