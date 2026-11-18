const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const vm=require('node:vm');
const {decouperPlans,genererStoryboardMotion,plansDeRendu}=require('../scripts/local/storyboard-motion');
const dessin=i=>({type:'composition',intention:'Expliquer la relation du plan',elements:[{id:'acteur',type:'illustration',icone:'robot',texte:'Agent IA',x:i*10,y:10,w:35,h:65,mouvement:i?'volet':'zoom'},{id:'accord',type:'carte',texte:'Accord humain',x:55,y:55,w:40,h:35,mouvement:'monte'}],liens:[{de:'acteur',vers:'accord'}]});
const script={title:'Sujet',editorialPlan:{idee_principale:'Agent IA et accord humain'},scenes:[{planRef:'developpement.1',narration:'L’agent prépare et vous validez.',text:'Vous gardez le contrôle',visuel:dessin(0)}]};
const fenetres=[{id:'s0',debut:0,duree:5.2,voix:{mots:[]}}];

test('les plans couvrent la voix sans trou et aucun dessin ne reste plus de deux secondes',()=>{
 const p=decouperPlans([{id:'s0',debut:0,duree:5.2},{id:'s1',debut:5.2,duree:4.3}]);
 assert.equal(p.length,6);
 p.forEach((f,i)=>{assert.ok(f.duree<=2.001);if(i)assert.ok(Math.abs(p[i-1].debut+p[i-1].duree-f.debut)<.002);});
 assert.ok(Math.abs(p.at(-1).debut+p.at(-1).duree-9.5)<.002);
});

test('le vrai plan de rendu reçoit un dessin distinct animé pour chaque créneau',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storyboard-motion-'));
 try{
  const sb=await genererStoryboardMotion(script,fenetres,dir,{appelerControle:async()=>JSON.stringify({erreurs:[]}),appelerModele:async()=>JSON.stringify({visuels:[dessin(0),dessin(1),dessin(2)]})});
  const plans=plansDeRendu({...script,storyboardMotion:sb},fenetres);
  assert.equal(plans.length,3);assert.equal(new Set(plans.map(p=>JSON.stringify(p.scene.visuel))).size,3);
  const {planMotion}=require('../scripts/local/motion-skills');
  const m=planMotion({...script,scenes:plans.map(p=>p.scene)},plans.map(p=>p.fenetre));
  assert.ok(m.scenes.every(s=>s.design==='composition'),'les plans de moins de deux secondes restent animés');
  assert.ok(plans.every(p=>p.scene.planCourt&&p.fenetre.duree<2));
  const {htmlScene}=require('../scripts/local/scenes-visuelles');
  plans.forEach((p,i)=>{
   const html=htmlScene(p.scene,{id:p.fenetre.id,duree:p.fenetre.duree,debut:p.fenetre.debut,mots:[],motion:m.scenes[i],planCourt:true});
   const calls=[],tl={};for(const method of ['set','to','fromTo'])tl[method]=(...args)=>{calls.push([method,...args]);return tl;};
   vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{gsap:{timeline:()=>tl},window:{},document:{}});
   for(const [method,target,a,b,c] of calls){const v=method==='fromTo'?b:a,t=method==='fromTo'?c:b;assert.ok(t+(v.duration||0)<=p.fenetre.duree+.002,target);}
   assert.ok(calls.some(c=>String(c[1]).includes('-noeud-')),'animation effective sur le nouveau dessin');
  });
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('un simple changement de mouvement ne compte pas comme un nouveau dessin',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storyboard-motion-'));
 try{
  const copies=[dessin(0),dessin(0),dessin(0)];copies[1].elements[0].mouvement='iris';
  await assert.rejects(genererStoryboardMotion(script,fenetres,dir,{appelerControle:async()=>JSON.stringify({erreurs:[]}),appelerModele:async()=>JSON.stringify({visuels:copies})}),/dessins identiques/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('une reprise conserve les dessins valides et ne redemande que le dessin refusé',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storyboard-reprise-'));let appels=0;
 const mauvais=dessin(1);mauvais.elements[0].texte='Donnée 999';
 try{
  const sb=await genererStoryboardMotion(script,fenetres,dir,{appelerControle:async()=>JSON.stringify({erreurs:[]}),appelerModele:async()=>JSON.stringify({visuels:++appels===1?[dessin(0),mauvais,dessin(2)]:[dessin(1)]})});
  assert.equal(appels,2);assert.deepEqual(sb.plans.map(p=>p.visuel.elements[0].x),[0,10,20]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('la mise en page ajuste les boîtes trop étroites et les collisions sans modifier les faits',()=>{
 const {ajusterBoitesCourtes}=require('../scripts/local/storyboard-motion');
 const {validerComposition}=require('../scripts/local/motion-composition');
 const v=dessin(0);v.elements[0].texte='Chiffrement';v.elements[0].w=16;v.elements[1].x=10;v.elements[1].y=10;
 const faits=v.elements.map(({id,type,texte,mouvement})=>({id,type,texte,mouvement})),liens=structuredClone(v.liens);
 assert.equal(ajusterBoitesCourtes(v),true);
 assert.deepEqual(v.elements.map(({id,type,texte,mouvement})=>({id,type,texte,mouvement})),faits);assert.deepEqual(v.liens,liens);
 assert.ok(v.elements[0].w>16);assert.deepEqual(validerComposition(v),[]);
});

test('la compréhension des plans courts est contrôlée avec une image par seconde',async()=>{
 const {testerComprehension}=require('../scripts/comprehension-test');
 const plan=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/plan-plante-le-couteau.json')));
 let pasCapture,pasTesteur;
 const r=await testerComprehension({videoPath:'test.mp4',texteSecours:'Texte',plan,dossier:os.tmpdir(),pasImages:1},{
  extraire:(v,d,pas)=>{pasCapture=pas;return [];},
  appelerTesteur:async(images,texte,pas)=>{pasTesteur=pas;return JSON.stringify({adresse_blog:plan.appel.adresse_blog,sources:plan.sources});},
  appelerJuge:async()=>JSON.stringify({idee_principale:{verdict:'ok'},sous_idees:plan.developpement.map(()=>({verdict:'ok'})),conclusion:{verdict:'ok'}}),
 });
 assert.equal(pasCapture,1);assert.equal(pasTesteur,1);assert.equal(r.ok,true);
});
