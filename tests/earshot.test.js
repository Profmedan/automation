const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {auditerAudio}=require('../scripts/local/revue-audio');

test('chaque audit Earshot porte sur le MP4 final, hors réseau, et conserve ses résultats',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'earshot-test-'));const video=path.join(dir,'video.mp4');fs.writeFileSync(video,'MP4');
 let argsRecus;
 try{
  const r=auditerAudio(video,dir,[{debut:0,id:'s0p0'},{debut:2,id:'s0p1'}],{executer:(cmd,args)=>{
   assert.equal(cmd,'docker');argsRecus=args;
   const out=args.find(a=>a.endsWith(':/output')).slice(0,-8);
   for(const [f,v] of Object.entries({'measure.json':{duration:4,lufs:-16.2,true_peak_dbtp:-5,clipped_samples:0},'timeline.json':{summary:'Audio analysé'},'critique.json':{verdict:'close',score:.8,critical_issues:0}}))fs.writeFileSync(path.join(out,f),JSON.stringify(v));
   fs.writeFileSync(path.join(out,'sheet.png'),'PNG');return Buffer.from('Analyse terminée');
  }});
  assert.ok(argsRecus.includes('none'));assert.ok(argsRecus.some(a=>a.endsWith('video.mp4:/input/video.mp4:ro')));
  assert.ok(argsRecus.includes('EARSHOT_OFFLINE=1'));assert.ok(!argsRecus.some(a=>/API_KEY|yes-upload/.test(a)));
  assert.equal(r.statut,'analyse_effectuee');assert.equal(r.lufs,-16.2);
  assert.ok(fs.existsSync(path.join(dir,'audio-review/earshot.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,r.rapport,'cues.json'))).events[1].t,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('une erreur Earshot ou un son saturé bloque le rendu prêt à approuver',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'earshot-gate-'));const video=path.join(dir,'video.mp4');fs.writeFileSync(video,'MP4');
 try{
  assert.throws(()=>auditerAudio(video,dir,[],{executer:()=>{throw Error('modèles absents');}}),/Earshot.*modèles absents/s);
  assert.ok(fs.existsSync(path.join(dir,'audio-review/passage-1/erreur.json')));
  assert.throws(()=>auditerAudio(video,dir,[],{executer:(cmd,args)=>{
   const out=args.find(a=>a.endsWith(':/output')).slice(0,-8);fs.writeFileSync(path.join(out,'measure.json'),JSON.stringify({duration:4,lufs:-5,true_peak_dbtp:1,clipped_samples:4}));
   fs.writeFileSync(path.join(out,'timeline.json'),'{}');fs.writeFileSync(path.join(out,'critique.json'),'{}');fs.writeFileSync(path.join(out,'sheet.png'),'PNG');return Buffer.from('');
  }}),/Earshot.*niveau|Earshot.*crête/s);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('une analyse Earshot partielle ne peut pas être déclarée effectuée',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'earshot-partiel-')),video=path.join(dir,'video.mp4');fs.writeFileSync(video,'MP4');
 try{
  assert.throws(()=>auditerAudio(video,dir,[],{executer:(cmd,args)=>{
   const out=args.find(a=>a.endsWith(':/output')).slice(0,-8);
   for(const [f,v] of Object.entries({'measure.json':{lufs:-16,true_peak_dbtp:-5,clipped_samples:0},'timeline.json':{summary:'Analyse'},'critique.json':{partial:['realness'],realness:{error:'modèle indisponible'}}}))fs.writeFileSync(path.join(out,f),JSON.stringify(v));
   fs.writeFileSync(path.join(out,'sheet.png'),'PNG');return Buffer.from('');
  }}),/Earshot.*incomplète/s);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('le bail Docker est temporaire, isolé et libéré une seule fois après le rendu',()=>{
 const {garderDockerEveille}=require('../scripts/local/revue-audio');const appels=[];
 const id='a'.repeat(64),fermer=garderDockerEveille((c,a,o)=>{appels.push({c,a,o});return id;});
 assert.equal(appels[0].c,'docker');assert.ok(appels[0].a.includes('--rm'));
 assert.equal(appels[0].a[appels[0].a.indexOf('--network')+1],'none');
 assert.ok(appels[0].a.some(a=>a.includes('sleep(5400)')));assert.ok(!appels[0].a.includes('-v'));
 fermer();fermer();assert.equal(appels.length,2);assert.deepEqual(appels[1].a,['rm','-f',id]);
 assert.throws(()=>garderDockerEveille(()=>{throw Error('Docker indisponible');}),/Docker indisponible/);
});
