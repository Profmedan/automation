/** Earshot obligatoire sur le MP4 final. Modèles locaux uniquement ; aucune API distante. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const CONFIG=require('./config-locale');
const SOURCE={repo:'Leonxlnx/earshot',version:'0.4.1',commit:'4ac3d2ac2b151e1c23376f9ce7f3047a17050013'};

/** Bail local borné pendant le rendu : évite la mise en veille de Docker entre voix et contrôle. */
function garderDockerEveille(executer=execFileSync){
 const id=String(executer('docker',['run','-d','--rm','--network','none','--label','vive-lia-production','--entrypoint','python',CONFIG.EARSHOT.image,'-c','import time; time.sleep(5400)'],{stdio:'pipe',timeout:120000})).trim();
 if(!/^[a-f0-9]{12,64}$/.test(id))throw Error('Bail Docker : identifiant inattendu ; rendu arrêté.');
 let ferme=false;
 return ()=>{if(!ferme){ferme=true;executer('docker',['rm','-f',id],{stdio:'pipe',timeout:30000});}};
}

function auditerAudio(video,dossier,plans=[],options={}){
 video=path.resolve(video);
 const racine=path.join(path.resolve(dossier),'audio-review');fs.mkdirSync(racine,{recursive:true});
 const numeros=fs.readdirSync(racine).map(n=>/^passage-(\d+)$/.exec(n)).filter(Boolean).map(m=>Number(m[1]));
 const passage=`passage-${Math.max(0,...numeros)+1}`,out=path.join(racine,passage);fs.mkdirSync(out);
 const hash=crypto.createHash('sha256').update(fs.readFileSync(video)).digest('hex');
 const base={source:SOURCE,video,sha256_video:hash,date:new Date().toISOString(),rapport:`audio-review/${passage}`,reseau:false};
 const publier=r=>fs.writeFileSync(path.join(racine,'earshot.json'),JSON.stringify(r,null,2));
 try{
  fs.mkdirSync(CONFIG.EARSHOT.cache,{recursive:true});
  fs.writeFileSync(path.join(out,'cues.json'),JSON.stringify({fps:30,events:plans.map(p=>({t:p.debut,kind:'dessin',id:p.id}))},null,2));
  const args=['run','--rm','--network','none','-e','EARSHOT_OFFLINE=1','-e','HF_HUB_OFFLINE=1','-e','TRANSFORMERS_OFFLINE=1',
   '-v',`${video}:/input/video.mp4:ro`,'-v',`${out}:/output`,'-v',`${CONFIG.EARSHOT.cache}:/cache`,
   CONFIG.EARSHOT.image,'python','/opt/earshot-review.py','/input/video.mp4'];
  const executer=options.executer||execFileSync;
  const stdout=executer('docker',args,{stdio:'pipe',timeout:15*60*1000,maxBuffer:32*1024*1024});
  fs.writeFileSync(path.join(out,'execution.log'),String(stdout||''));
  const lire=f=>JSON.parse(fs.readFileSync(path.join(out,f),'utf8'));
  const mesure=lire('measure.json'),timeline=lire('timeline.json'),critique=lire('critique.json');
  if(!fs.existsSync(path.join(out,'sheet.png')))throw Error('planche audio absente');
  const erreurs=[];
  if(!Number.isFinite(mesure.lufs)||Math.abs(mesure.lufs+16)>1.5)erreurs.push(`niveau ${mesure.lufs} LUFS, cible −16 ±1,5`);
  if(!Number.isFinite(mesure.true_peak_dbtp)||mesure.true_peak_dbtp>-4)erreurs.push(`crête ${mesure.true_peak_dbtp} dBTP, plafond −4`);
  if(mesure.clipped_samples!==0)erreurs.push(`${mesure.clipped_samples} échantillons saturés`);
  if(critique.partial?.length||critique.realness?.error||!timeline.summary)erreurs.push(`analyse Earshot incomplète : ${(critique.partial||[]).join(', ')} ${critique.realness?.error||''}`.trim());
  const resultat={...base,statut:erreurs.length?'a_corriger':'analyse_effectuee',lufs:mesure.lufs,crete_dBTP:mesure.true_peak_dbtp,
   verdict:critique.verdict,score:critique.score,resume:timeline.summary,erreurs,
   interpretation:'Le profil Earshot compare des films de lancement ; le commentaire artistique reste à examiner pour cette vidéo parlée. Earshot ne reconnaît ni le texte ni la langue. La voix clonée et les bruitages procéduraux sont intentionnels.'};
  publier(resultat);
  fs.writeFileSync(path.join(out,'RAPPORT.md'),`# Contrôle Earshot du MP4 final\n\nSource : ${SOURCE.repo}@${SOURCE.commit}. Analyse locale, hors réseau.\n\n- Niveau : ${mesure.lufs} LUFS.\n- Crête vraie : ${mesure.true_peak_dbtp} dBTP.\n- Profil de référence : ${critique.verdict}, score ${critique.score}.\n- Synthèse : ${timeline.summary||''}\n\n${resultat.interpretation}\n\n${erreurs.length?erreurs.join('\n'):'Niveaux conformes ; résultats et planche audio à examiner.'}\n`);
  if(erreurs.length)throw Error(erreurs.join(' ; '));
  return resultat;
 }catch(e){
  const message=`Earshot : ${e.message}`;
  fs.writeFileSync(path.join(out,'erreur.json'),JSON.stringify({...base,statut:'erreur',message},null,2));
  publier({...base,statut:'erreur',message});
  throw Error(message);
 }
}
if(require.main===module){
 try{if(!process.argv[2])throw Error('Usage : node revue-audio.js /chemin/video.mp4');const v=path.resolve(process.argv[2]);console.log(JSON.stringify(auditerAudio(v,path.dirname(v)),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={auditerAudio,garderDockerEveille};
