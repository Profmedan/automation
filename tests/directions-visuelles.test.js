const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {preparerDirection,AUTOMATIQUES,tokens}=require('../scripts/local/directions-visuelles');
const {validerComposition}=require('../scripts/local/motion-composition');
const {htmlScene}=require('../scripts/local/scenes-visuelles');
const {planMotion}=require('../scripts/local/motion-skills');

const dessin={type:'composition',intention:'Montrer un paiement validé',elements:[{id:'portefeuille',type:'illustration',icone:'portefeuille',texte:'Votre portefeuille',x:5,y:5,w:45,h:80,mouvement:'dessine',accent:true},{id:'validation',type:'illustration',traces:[{d:'M15 50 L40 75 L85 20',role:'accent'}],texte:'Vous validez',x:55,y:5,w:40,h:80,mouvement:'zoom'}],liens:[]};
test('les nouvelles directions changent réellement le support, les couleurs et la typographie',()=>{
 const signatures=new Set(AUTOMATIQUES.map(style=>{const t=tokens(style);return [t.base,t.ink,t.display,t.support].join(':');}));
 assert.equal(signatures.size,AUTOMATIQUES.length);
 assert.ok(new Set(AUTOMATIQUES.map(s=>tokens(s).support)).size>=4);
 const lum=h=>h.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 for(const style of AUTOMATIQUES)for(const decor of ['principal','contraste','accent']){
  const t=tokens(style,decor),a=lum(t.base),b=lum(t.ink);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,style+' '+decor);
 }
});
test('la direction est enregistrée avant le storyboard et évite celle du rendu précédent',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'direction-video-'));
 try{
  fs.mkdirSync(path.join(dir,'precedent'));fs.writeFileSync(path.join(dir,'precedent/motion-plan.json'),JSON.stringify({style:'editorial'}));
  const script={motionStyle:'editorial',scenes:[{planRef:'developpement.1'},{planRef:'nuance.1'}]};
  const out=path.join(dir,'nouveau'),d=preparerDirection(script,out);
  assert.notEqual(d.style,'editorial');assert.equal(script.motionStyle,d.style);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'direction-artistique.json'))).style,d.style);
  assert.deepEqual(d.decors.map(s=>s.decor),['principal','contraste']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('les objets illustrés et les tracés originaux sont compilés en SVG animé, sans code libre',()=>{
 assert.deepEqual(validerComposition(dessin),[]);
 const scene={planRef:'developpement.1',text:'Vous gardez le contrôle',visuel:dessin,planCourt:true};
 const plan=planMotion({motionStyle:'handdrawn',scenes:[scene]},[{id:'test',debut:0,duree:1.8}]);
 const html=htmlScene(scene,{id:'test',duree:1.8,debut:0,mots:[],motion:plan.scenes[0],planCourt:true});
 assert.match(html,/<svg[^>]*class="illustration"/);assert.ok(html.includes('M15 50 L40 75 L85 20'));
 const calls=[],tl={};for(const fn of ['fromTo','to','set'])tl[fn]=(...args)=>{calls.push([fn,...args]);return tl;};
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{gsap:{timeline:()=>tl},window:{},document:{}});
 assert.ok(calls.some(c=>String(c[1]).endsWith(' path')&&c[2].strokeDashoffset===1&&c[3].strokeDashoffset===0));
 assert.ok(calls.some(c=>c[1]==='#test-decor'));assert.ok(calls.some(c=>c[1]==='#test-dessin'));assert.ok(calls.some(c=>c[1]==='#test-grain'));
 const mauvais=structuredClone(dessin);mauvais.elements[1].traces[0].d='M0 0 <script>alert(1)</script>';
 assert.ok(validerComposition(mauvais).some(e=>e.includes('tracé déclaratif invalide')));
 mauvais.elements[1].traces[0]={d:'M0 0 L900 900',role:'accent'};assert.ok(validerComposition(mauvais).some(e=>e.includes('hors limites')));
});
test('une vérification Hyperframes manquante ou sans contrôle du navigateur bloque le rendu',()=>{
 const {verifierControleHyperframes}=require('../scripts/local/rendu-hyperframes');
 const ok={ok:true,browserSkipped:false,runtime:{ok:true},layout:{ok:true,samples:[.5]},contrast:{ok:true}};
 assert.equal(verifierControleHyperframes(JSON.stringify(ok)).ok,true);
 for(const v of [{...ok,ok:false},{...ok,browserSkipped:true},{...ok,layout:{ok:true,samples:[]}},{}])assert.throws(()=>verifierControleHyperframes(JSON.stringify(v)),/arrêté avant export/);
 assert.throws(()=>verifierControleHyperframes('pas un rapport'),/illisible/);
});
test('une promesse factuelle fausse bloque le storyboard et une modification invalide la revue précédente',async()=>{
 const {verifierStoryboardFactuel}=require('../scripts/local/controle-storyboard');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faits-dessins-'));
 try{
  const script={editorialPlan:{idee_principale:'Chaque paiement exige votre accord.'},scenes:[{planRef:'idee_principale',narration:'Vous validez.'}]};
  const sb={plans:[{id:'s0p0',scene:0,visuel:structuredClone(dessin)}]};
  await assert.rejects(verifierStoryboardFactuel(script,sb,dir,{appelerControle:async()=>JSON.stringify({erreurs:[{id:'s0p0',raison:'Le dessin affirme sans risque.'}]})}),/factuellement incorrect/);
  let appels=0;const options={appelerControle:async()=>{appels++;return JSON.stringify({erreurs:[]});}};
  await verifierStoryboardFactuel(script,sb,dir,options);await verifierStoryboardFactuel(script,sb,dir,options);assert.equal(appels,1);
  sb.plans[0].visuel.elements[0].texte='Agent autonome';await verifierStoryboardFactuel(script,sb,dir,options);assert.equal(appels,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('les crédits restent disponibles pendant toute la conclusion des sources, avec un focus animé différent',()=>{
 const {decouperPlans,plansDeRendu}=require('../scripts/local/storyboard-motion');
 const fenetres=[{id:'s0',debut:0,duree:6,voix:{mots:[]}}],sources=[{titre:'Article A',auteur:'Auteur A'},{titre:'Article B',auteur:'Auteur B'},{titre:'Article C',auteur:'Auteur C'}];
 const plans=decouperPlans(fenetres).map((p,i)=>({...p,visuel:{type:'titre'},variante:i,sourcesEcran:[sources[i]]}));
 const script={scenes:[{planRef:'sources',text:'Nos sources',sourcesEcran:sources}],storyboardMotion:{plans}};
 const rendus=plansDeRendu(script,fenetres);
 assert.ok(rendus.every(p=>p.scene.sourcesContinues&&p.scene.sourcesEcran.length===3));
 for(const [i,p] of rendus.entries()){
  const html=htmlScene(p.scene,{id:'s'+i,duree:2,debut:i*2,mots:[],planCourt:true});
  for(const s of sources)assert.ok(html.includes(s.titre));assert.ok(html.includes(`id="s${i}-focus">${sources[i].auteur}`));
 }
});
test('la banque conserve la disposition et neutralise le sujet des illustrations précédentes',()=>{
 const {enregistrerBanque,lireBanque}=require('../scripts/local/motion-composition');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'banque-illustrations-'));
 try{
  enregistrerBanque({scenes:[{visuel:dessin}]},dir);
  const [g]=lireBanque(dir,'Autre sujet');assert.ok(g);
  assert.ok(g.elements.every(n=>n.icone==='question'&&!n.traces&&n.texte==='Texte'));
  assert.deepEqual(g.elements.map(n=>[n.x,n.y,n.w,n.h]),dessin.elements.map(n=>[n.x,n.y,n.w,n.h]));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('les connecteurs rejoignent les bords sans traverser les libellés',()=>{
 const {extremitesLien}=require('../scripts/local/motion-composition');
 const a={x:10,y:20,w:80,h:50},b={x:15,y:72,w:70,h:18};
 const p=extremitesLien(a,b);
 assert.equal(p.ax,450);assert.equal(p.bx,450);
 assert.ok(p.ay>=420&&p.ay<p.by&&p.by<=432);
 const q=extremitesLien({x:0,y:0,w:40,h:50},{x:60,y:0,w:40,h:50});
 assert.ok(q.ax>=360&&q.bx<=540&&q.ax<q.bx);
});
test('la direction secondaire est effectivement transmise au dessin du plan',()=>{
 const {decouperPlans,plansDeRendu}=require('../scripts/local/storyboard-motion');
 const f=[{id:'s0',debut:0,duree:1.8,voix:{mots:[]}}];
 const script={motionStyle:'editorial',scenes:[{planRef:'developpement.1',motionStyle:'handdrawn',text:'Vous validez'}],storyboardMotion:{plans:decouperPlans(f).map(p=>({...p,visuel:dessin}))}};
 const p=plansDeRendu(script,f);const m=planMotion({...script,scenes:p.map(x=>x.scene)},p.map(x=>x.fenetre));
 assert.equal(m.scenes[0].style,'handdrawn');
 const h=htmlScene(p[0].scene,{id:'s0',duree:1.8,debut:0,mots:[],motion:m.scenes[0]});
 assert.ok(h.includes('direction: handdrawn'));
});
test('chaque plan de clôture contient un dessin distinct et animé, avec crédits conservés',()=>{
 const d=[];
 for(let i=0;i<4;i++){
  const h=htmlScene({planRef:'sources',text:'Sources',sourcesContinues:true,sourcesEcran:[{titre:'Source vérifiable',auteur:'Auteur'}],variante:i},{id:'fin'+i,duree:1.8,debut:i*1.8,mots:[]});
  assert.ok(h.includes('Source vérifiable'));
  const art=h.match(/<svg id="fin\d-cloture-art"[\s\S]*?<\/svg>/)[0];
  d.push(art.replaceAll(/fin\d/g,'fin'));
  const calls=[],tl={};for(const f of ['fromTo','to','set'])tl[f]=(...args)=>{calls.push(args);return tl;};
  vm.runInNewContext(h.match(/<script>([\s\S]*?)<\/script>/)[1],{gsap:{timeline:()=>tl},window:{},document:{}});
  assert.ok(calls.some(c=>c[1]?.strokeDashoffset===1&&c[2]?.strokeDashoffset===0));
 }
 assert.equal(new Set(d).size,4);
});

test('le budget de lecture compte les mots, pas les signes de ponctuation française',()=>{
 const {decouperPlans,plansDeRendu}=require('../scripts/local/storyboard-motion');
 const f=[{id:'s0',debut:0,duree:1.8,voix:{mots:[]}}];
 const v={type:'composition',intention:'Poser une question sur chaque achat',elements:[{id:'e0',type:'illustration',icone:'validation',texte:'Europe : qui validerait l’achat ?',x:12,y:0,w:76,h:96,mouvement:'dessine'}],liens:[]};
 const s={scenes:[{planRef:'conclusion',text:'Assistant, pas acheteur autonome'}],storyboardMotion:{plans:decouperPlans(f).map(p=>({...p,visuel:v}))}};
 assert.doesNotThrow(()=>plansDeRendu(s,f));
 v.elements[0].texte='Qui validerait chaque achat pour Pierre ?';
 assert.throws(()=>plansDeRendu(s,f),/cinq mots maximum/);
});
