#!/usr/bin/env node
/** Galerie de compositions originales : chaque étude est une scène indépendante, pas une vidéo éditoriale. */
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {MOUVEMENTS,STYLES,validerComposition}=require('./local/motion-composition');
const {htmlScene}=require('./local/scenes-visuelles');
const {CSS_RACINE}=require('./local/rendu-hyperframes');
const {planMotion,revueMotion}=require('./local/motion-skills');
const CONFIG=require('./local/config-locale');

function exemple(index,mouvement){
  const box=(id,texte,x,y,w,h,type='carte')=>({id,texte,x,y,w,h,type,mouvement:'fondu'});
  const layouts=[
    {elements:[box('a','Source',0,20,28,36),box('b','Analyse',36,20,28,36),box('c','Résultat',72,20,28,36)],liens:[{de:'a',vers:'b'},{de:'b',vers:'c'}]},
    {elements:[box('a','Coordination',35,34,30,30,'cercle'),box('b','Mémoire',0,0,28,28),box('c','Outils',72,0,28,28),box('d','Vérification',0,72,28,28),box('e','Réponse',72,72,28,28)],liens:[{de:'a',vers:'b'},{de:'a',vers:'c'},{de:'a',vers:'d'},{de:'a',vers:'e'}]},
    {elements:[box('a','Décision',35,0,30,30),box('b','Première possibilité',0,65,43,30),box('c','Seconde possibilité',57,65,43,30)],liens:[{de:'a',vers:'b'},{de:'a',vers:'c'}]},
    {elements:[box('a','Une idée centrale',0,0,62,45),box('b','Son contexte',66,0,34,45),box('c','Les éléments qui permettent de la vérifier',0,54,100,42)],liens:[]},
    {elements:[box('a','Observer',0,0,32,32,'cercle'),box('b','Tester',68,0,32,32,'cercle'),box('c','Analyser',68,68,32,32,'cercle'),box('d','Décider',0,68,32,32,'cercle')],liens:[{de:'a',vers:'b'},{de:'b',vers:'c'},{de:'c',vers:'d'},{de:'d',vers:'a'}]},
    {elements:[box('a','Interface',0,0,100,25),box('b','Modèle',10,36,80,25),box('c','Données',20,72,60,25)],liens:[{de:'c',vers:'b'},{de:'b',vers:'a'}]},
    {elements:[box('a','Éléments observés',0,0,44,42),box('b','Éléments déduits',56,0,44,42),box('c','Points vérifiés',0,58,44,42),box('d','Points ouverts',56,58,44,42)],liens:[]},
    {elements:[box('a','Une valeur exacte',0,0,100,27),{...box('b','Essais réussis',10,38,60,55,'donnee'),valeur:42,unite:'%'},box('c','Leur contexte',75,38,25,55)],liens:[]},
  ];
  const v={type:'composition',intention:'Étude graphique technique sans fait réel : disposition originale '+(index+1),...layouts[index%layouts.length]};
  v.elements[0].mouvement=mouvement;v.elements[0].accent=true;
  return v;
}

function witness(destination){
  const out=path.resolve(destination),project=path.join(out,'hyperframes');
  for(const d of ['compositions','vendor'])fs.mkdirSync(path.join(project,d),{recursive:true});
  fs.copyFileSync(CONFIG.GSAP,path.join(project,'vendor/gsap.min.js'));
  const studies=MOUVEMENTS.map((m,i)=>({planRef:'developpement.1',text:`Étude : ${m}`,source:'Exemple technique, données fictives',visuel:exemple(i,m),style:STYLES[i%STYLES.length]}));
  const frames=studies.map((_,i)=>({id:`s${i}`,debut:i*3.5,duree:3.5}));
  const decisions=[];
  studies.forEach((s,i)=>{
    const errors=validerComposition(s.visuel);if(errors.length)throw Error(JSON.stringify({i,errors}));
    // Chaque étude indépendante garde son propre style et sa seule emphase, pour comparer le vocabulaire entier.
    const choice=planMotion({title:s.text,motionStyle:s.style,scenes:[s]},[{debut:0,duree:3.5}]).scenes[0];
    decisions.push({...choice,id:`s${i}`,debut:frames[i].debut,composition:s.visuel});
    fs.writeFileSync(path.join(project,`compositions/s${i}.html`),htmlScene(s,{id:`s${i}`,debut:frames[i].debut,duree:3.5,mots:[],nbSousIdees:1,premier:i===0,dernier:i===studies.length-1,motion:choice}));
  });
  fs.writeFileSync(path.join(project,'index.html'),`<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>Études de compositions ouvertes</title><script src="vendor/gsap.min.js"></script><style>${CSS_RACINE}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${studies.length*3.5}" data-width="1080" data-height="1920" data-fps="30">${frames.map(f=>`<div id="${f.id}" data-composition-id="${f.id}" data-composition-src="compositions/${f.id}.html" data-start="${f.debut}" data-duration="3.5" data-width="1080" data-height="1920" data-track-index="1" data-track-kind="graphics"></div>`).join('\n')}</div><script>window.__timelines={main:gsap.timeline({paused:true})};</script></body></html>`);
  fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({private:true,type:'module'}));
  fs.writeFileSync(path.join(project,'hyperframes.json'),JSON.stringify({paths:{blocks:'compositions',assets:'assets'}}));
  fs.writeFileSync(path.join(out,'studies.json'),JSON.stringify(decisions,null,2));
  const run=args=>process.env.HYPERFRAMES_CLI?execFileSync(process.execPath,[process.env.HYPERFRAMES_CLI,...args],{cwd:project,stdio:'pipe',timeout:600000,maxBuffer:64*1024*1024}):execFileSync('npx',['--offline','--yes',CONFIG.HYPERFRAMES,...args],{cwd:project,stdio:'pipe',timeout:600000,maxBuffer:64*1024*1024});
  try{fs.writeFileSync(path.join(out,'hyperframes-check.json'),run(['check','--json']));}catch(e){fs.writeFileSync(path.join(out,'hyperframes-check.json'),String(e.stdout||''));throw e;}
  const video=path.join(out,'motion-open-studies.mp4');
  run(['render','--quality','draft','--output',video,'--quiet']);
  const review=revueMotion(video,frames,out,CONFIG.FFMPEG);
  console.log(JSON.stringify({video,etudes:studies.length,styles:STYLES.length,images:review.images.length,publication:false},null,2));
}

if(require.main===module)witness(process.argv[2]||'/tmp/motion-open-studies');
module.exports={exemple,witness};
