/** Dessins courts écrits après la mesure de la voix. Aucun code du modèle n'est exécuté. */
const fs=require('node:fs'),path=require('node:path');
const CONFIG=require('./config-locale');
const {appelerClaude,lireJson,ESSAIS}=require('../editorial-plan');
const {validerVisuels}=require('../generate-script-dynamic');
const {normaliserComposition}=require('./motion-composition');
const {consignesMotion,choisirSkill}=require('./motion-skills');
const {preparerDirection}=require('./directions-visuelles');
const {verifierStoryboardFactuel}=require('./controle-storyboard');

function decouperPlans(fenetres){
 const intervalle=CONFIG.MOTION.intervalle_s;
 return fenetres.flatMap((f,scene)=>{
  const n=Math.max(1,Math.ceil(f.duree/intervalle));
  return Array.from({length:n},(_,rang)=>{
   const debut=+(f.debut+rang*f.duree/n).toFixed(3);
   const fin=+(f.debut+(rang+1)*f.duree/n).toFixed(3);
   return {id:`s${scene}p${rang}`,scene,rang,debut,duree:+(fin-debut).toFixed(3)};
  });
 });
}

function signatureDessin(v){
 return JSON.stringify({type:v.type,elements:v.elements?.map(({type,texte,valeur,unite,x,y,w,h,icone,traces})=>({type,texte,valeur,unite,x,y,w,h,icone,traces:traces?.map(({d,plein})=>({d,plein}))})),liens:v.liens});
}

/** Ajustement local des seuls rectangles : le modèle reste auteur des textes, formes et relations. */
function ajusterBoitesCourtes(v){
 if(v?.type!=='composition'||!Array.isArray(v.elements)||v.elements.length>3)return false;
 const copie=structuredClone(v),places=[];
 for(const n of copie.elements){
  if(!n||!['x','y','w','h'].every(k=>Number.isFinite(n[k])&&n[k]>=0&&n[k]<=100)||n.w<5||n.h<5)return false;
  const texte=String(n.texte||''),longueur=Math.max(1,...texte.split(/\s+/).map(m=>m.length));
  n.w=Math.max(n.w,Math.ceil((36*.68*longueur+40)/9));
  const caracteres=Math.max(1,Math.floor((n.w*9-40)/(36*.6)));
  n.h=Math.max(n.h,Math.ceil((Math.ceil(texte.length/caracteres)*36*1.15+(n.type==='donnee'?70:n.type==='illustration'?150:0)+40)/6));
  if(n.w>100||n.h>100)return false;
 }
 for(const n of [...copie.elements].sort((a,b)=>b.w*b.h-a.w*a.h)){
  const x=Math.min(n.x,100-n.w),y=Math.min(n.y,100-n.h);
  const xs=[...new Set([x,100-n.w,...Array.from({length:Math.floor((100-n.w)/2)+1},(_,i)=>i*2)])];
  const ys=[...new Set([y,100-n.h,...Array.from({length:Math.floor((100-n.h)/2)+1},(_,i)=>i*2)])];
  let meilleur=null,score=Infinity;
  for(const xx of xs)for(const yy of ys){
   if(places.some(p=>xx<p.x+p.w+1&&xx+n.w+1>p.x&&yy<p.y+p.h+1&&yy+n.h+1>p.y))continue;
   const distance=(xx-x)**2+(yy-y)**2;
   if(distance<score){score=distance;meilleur={x:xx,y:yy};}
  }
  if(!meilleur)return false;
  Object.assign(n,meilleur);places.push(n);
 }
 v.elements=copie.elements;return true;
}

function erreursDessinCourt(v){
 const e=[];
 if(v?.type!=='composition')return ['composition requise'];
 if(!Array.isArray(v.elements)||v.elements.length>3)return ['trois éléments maximum pour deux secondes'];
 for(const n of v.elements){
  const texte=String(n.texte||'');
  if(texte.trim().split(/\s+/).filter(m=>/[\p{L}\p{N}]/u.test(m)).length>5)e.push('cinq mots maximum par élément');
  const largeur=n.w*9-40,hauteur=n.h*6-40,longueur=Math.max(1,...texte.split(/\s+/).map(m=>m.length));
  const lignes=Math.ceil(texte.length/Math.max(1,Math.floor(largeur/(36*.6))));
  if(largeur/(longueur*.68)<36||lignes*36*1.15+(n.type==='donnee'?70:n.type==='illustration'?150:0)>hauteur)e.push('agrandir la boîte pour une police d’au moins 36 pixels');
 }
 if(v.liens?.some(l=>l.texte))e.push('liens sans petit libellé : mettre l’information dans les grands éléments');
 return e;
}

function journaliser(dossier,nom,objet){
 fs.mkdirSync(dossier,{recursive:true});
 let f=path.join(dossier,nom+'.json'),n=2;
 while(fs.existsSync(f))f=path.join(dossier,`${nom}-reprise-${n++}.json`);
 fs.writeFileSync(f,JSON.stringify(objet,null,2),{flag:'wx'});
}

async function genererStoryboardMotion(script,fenetres,dossier,options={}){
 script.selectionMotion=script.selectionMotion||choisirSkill(dossier);
 preparerDirection(script,dossier);
 const plans=decouperPlans(fenetres);
 const appeler=options.appelerModele||((p,s)=>appelerClaude(p,s,8192));
 for(let i=0;i<script.scenes.length;i++){
  const scene=script.scenes[i],cibles=plans.filter(p=>p.scene===i);
  if(['appel','sources'].includes(scene.planRef)){
   // Adresse persistante ; les références exactes sont réparties entre les cartes successives.
   cibles.forEach((p,j)=>{p.visuel={type:'titre'};p.variante=j;
    if(scene.planRef==='sources'){
     const sources=scene.sourcesEcran||script.sources||[];
     p.sourcesEcran=sources.slice(Math.floor(j*sources.length/cibles.length),Math.floor((j+1)*sources.length/cibles.length));
    }
   });
   continue;
  }
  if(cibles.length===1&&!erreursDessinCourt(scene.visuel).length&&scene.visuel?.elements?.some(n=>n.type==='illustration')){cibles[0].visuel=scene.visuel;continue;}
  let erreurs=[],visuels=Array(cibles.length).fill(null);const vues=[];
  for(let essai=1;essai<=ESSAIS;essai++){
   const demandes=cibles.map((_,j)=>j).filter(j=>!visuels[j]);
   console.log(`🎨 Storyboard ${scene.planRef} : ${demandes.length} dessin(s) à produire, essai ${essai}/${ESSAIS}`);
   let brut;
   try{
    const prompt=`Crée uniquement les ${demandes.length} dessins encore manquants de cette scène de vidéo, en français.
PLAN FACTUEL AUTORISÉ : ${JSON.stringify(script.editorialPlan)}
SCÈNE : ${JSON.stringify({planRef:scene.planRef,narration:scene.narration,text:scene.text,visuel:scene.visuel})}
DIRECTION ARTISTIQUE FIXÉE POUR LA VIDÉO : ${JSON.stringify(script.directionArtistique)}.
DURÉES MESURÉES DES DESSINS DEMANDÉS : ${demandes.map(j=>cibles[j].duree).join(', ')} secondes.
POSITIONS DANS LA SUITE : ${demandes.map(j=>j+1).join(', ')} sur ${cibles.length} dessins. DESSINS DÉJÀ VALIDÉS, À NE PAS REFAIRE : ${JSON.stringify(visuels.filter(Boolean))}
Chaque dessin doit être NOUVEAU et avoir sa propre animation. Fais progresser l'explication : élément central, relation ou condition, puis résultat ou question. Change le dessin et l'organisation ; ne renvoie pas le même dessin avec un autre mouvement. Le titre et la voix restent continus. Varie les mises en scène : un objet monumental, une action en diagonale, une progression verticale et une relation horizontale ne sont pas le même cadrage. Évite une succession systématique de deux objets de même taille sur une rangée ; le héros peut occuper 60 à 80 % de la largeur. Les titres et les mots restent stables pendant la lecture. N’ajoute jamais une promesse « sans risque », un jeton à usage unique ou une responsabilité juridique si le plan ne l’affirme pas. Une fonction future doit porter explicitement « prévu » ou « à terme » dans le dessin ; elle ne doit pas paraître déjà disponible.
IMPÉRATIF VISUEL : vise UN OU DEUX objets au total par dessin. Un point d’interrogation, un libellé autonome et une forme de fond comptent aussi comme éléments ; mets la question dans le libellé de l’objet concerné au lieu d’ajouter un quatrième élément. Chaque dessin contient au moins une illustration (type illustration avec icone ou traces originales), assez grande pour que l’objet soit reconnu à 480 px de large. Ne fais pas de rangées de cartes portant seulement des mots. Le dessin doit montrer l’objet ou l’action dont parle la phrase. Une illustration principale w≥36, h≥55 est préférable, avec au plus un objet secondaire. Pour un même sujet, change ce qu’il fait ou la relation montrée et le cadrage ; ne multiplie pas les synonymes. Les changements doivent rester liés à la narration de la scène.
Lecture rapide : 1 à 3 éléments par dessin ; 1 à 5 mots par élément. Boîtes assez grandes pour une police de 36 pixels minimum. Pas de cartes contenant d'autres textes superposés. Pas de petits libellés sur les liens : garde les liens sans texte. Alterne cartes, cercles, rectangles, texte ou donnée quand ils expliquent le sujet. Choisis des mouvements différents, courts et contrôlés ; pas de nouveaux faits, chiffres ni citations. Pas de code.
${consignesMotion(script.selectionMotion)}
PRIORITÉ POUR CES PLANS COURTS : trois éléments maximum par dessin, cinq mots maximum par élément, police d'au moins 36 px, aucun libellé sur les liens. Ces limites plus strictes priment sur les possibilités générales de la banque.
Exemple de deux grandes illustrations sans recouvrement (tu peux inventer d’autres dispositions) : x=3 et x=55, y=10, w=42, h=75. Tu ne dois pas résumer tous les acteurs du plan dans chaque dessin ; chaque créneau ne montre qu’une étape de l’explication.
${vues.length?'ERREURS À CORRIGER : '+vues.join(' ; '):''}
DERNIER CONTRÔLE AVANT LA RÉPONSE : vise deux éléments maximum par dessin, question incluse dans un libellé ; aucun nouveau fait.
Réponds uniquement en JSON, dans l'ordre des positions demandées : {"visuels":[${demandes.map(()=>'{"type":"composition","intention":"...","elements":[],"liens":[]}').join(',')}]}.`;
    brut=lireJson(await appeler(prompt,'Tu es motion designer. Dessins explicatifs déclaratifs uniquement, JSON valide.'));
    const propositions=Array.isArray(brut?.visuels)?structuredClone(brut.visuels):[];
    propositions.forEach(normaliserComposition);
    propositions.forEach(ajusterBoitesCourtes);
    erreurs=propositions.length!==demandes.length?[`${demandes.length} dessins attendus ; ${propositions.length} reçus`]:[];
    if(!erreurs.length)propositions.forEach((visuel,j)=>{
     const e=[...erreursDessinCourt(visuel),...validerVisuels({scenes:[{...scene,visuel}]},script.editorialPlan)];
     if(!visuel?.elements?.some(n=>n.type==='illustration'))e.push('un objet illustré est requis, les boîtes de texte seules ne suffisent pas');
     if(!e.length&&visuels.filter(Boolean).some(v=>signatureDessin(v)===signatureDessin(visuel)))e.push('dessins identiques : modifier le dessin, pas seulement le mouvement');
     if(e.length)erreurs.push(...e.map(e=>`dessin ${demandes[j]+1} : ${e}`));else visuels[demandes[j]]=visuel;
    });
   }catch(e){if(e.name==='ServicePayantBloque')throw e;erreurs=[e.message];}
   erreurs.forEach(e=>{if(!vues.includes(e))vues.push(e);});
   journaliser(path.join(dossier,'storyboard-essais'),`s${i}-essai-${essai}`,{scene:scene.planRef,dessinsDemandes:demandes.map(j=>j+1),reponse:brut,erreurs});
   if(visuels.every(Boolean))break;
  }
  if(!visuels.every(Boolean))throw Error(`Storyboard ${scene.planRef} invalide après ${ESSAIS} essais : ${vues.join(' ; ')}`);
  cibles.forEach((p,j)=>{p.visuel=visuels[j];});
 }
 const storyboard={version:1,intervalle_s:CONFIG.MOTION.intervalle_s,plans};
 await verifierStoryboardFactuel(script,storyboard,dossier,options);
 plansDeRendu({...script,storyboardMotion:storyboard},fenetres);
 fs.writeFileSync(path.join(dossier,'storyboard-motion.json'),JSON.stringify(storyboard,null,2));
 return storyboard;
}

function plansDeRendu(script,fenetres){
 if(!script.storyboardMotion)return fenetres.map((f,i)=>({fenetre:f,scene:script.scenes[i]}));
 const attendus=decouperPlans(fenetres),recus=script.storyboardMotion.plans;
 if(!Array.isArray(recus)||recus.length!==attendus.length)throw Error('Storyboard incomplet');
 return attendus.map((a,i)=>{
  const p=recus[i];
  if(!p||['scene','debut','duree','id'].some(k=>p[k]!==a[k]))throw Error(`Storyboard : créneau ${i} hors du calage de la voix`);
  const scene={...script.scenes[p.scene],visuel:p.visuel,motionStyle:p.motionStyle||script.scenes[p.scene].motionStyle,planCourt:true,variante:p.variante||0,...(p.sourcesEcran?{sourcesEcran:p.sourcesEcran}:{})};
  const toutesSources=script.scenes[p.scene].sourcesEcran||script.sources||[];
  if(scene.planRef==='sources'&&toutesSources.length<=4){scene.sourcesEcran=toutesSources;scene.sourcesContinues=true;}
  const erreurs=validerVisuels({scenes:[scene]},script.editorialPlan);
  if(!['appel','sources'].includes(scene.planRef))erreurs.push(...erreursDessinCourt(scene.visuel));
  if(erreurs.length)throw Error(erreurs.join(' ; '));
  return {scene,fenetre:{...fenetres[p.scene],id:p.id,debut:p.debut,duree:p.duree}};
 });
}

module.exports={decouperPlans,genererStoryboardMotion,plansDeRendu,ajusterBoitesCourtes};
