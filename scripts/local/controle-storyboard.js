/** Vérification du sens des dessins : un schéma lisible peut encore affirmer un fait faux. */
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {appelerClaude,lireJson}=require('../editorial-plan');
function empreinteStoryboard(script,storyboard){return createHash('sha256').update(JSON.stringify({plan:script.editorialPlan,scenes:script.scenes.map(s=>({planRef:s.planRef,narration:s.narration,text:s.text})),plans:storyboard.plans})).digest('hex');}
async function verifierStoryboardFactuel(script,storyboard,dossier,options={}){
 const empreinte=empreinteStoryboard(script,storyboard);
 if(storyboard.revueFactuelle?.ok&&storyboard.revueFactuelle.empreinte===empreinte)return storyboard.revueFactuelle;
 const entrees=storyboard.plans.filter(p=>p.visuel?.type==='composition').map(p=>({id:p.id,scene:script.scenes[p.scene].planRef,narration:script.scenes[p.scene].narration,titre:script.scenes[p.scene].text,intention:p.visuel.intention,elements:p.visuel.elements.map(({texte,valeur,unite,icone})=>({texte,valeur,unite,icone})),liens:p.visuel.liens}));
 const appeler=options.appelerControle||((p,s)=>appelerClaude(p,s,2500));
 const avis=lireJson(await appeler(`Vérifie les affirmations des dessins d’une vidéo contre son plan éditorial complet.\nPLAN : ${JSON.stringify(script.editorialPlan)}\nDESSINS : ${JSON.stringify(entrees)}\nUn pictogramme est un schéma, pas une capture ni un logo officiel. Signale uniquement les erreurs factuelles ou les ajouts non étayés : promesse absolue de sécurité (« sans risque »), détail technique inventé, condition omise qui change le sens, possibilité future montrée comme déjà active. Une question n’est pas une affirmation. Une fonction annoncée par le plan pour l’avenir PEUT être représentée : les mentions « prévu », « futur », « pas encore disponible » ou « à terme » indiquent explicitement son statut. Ne signale pas comme erreur la seule présence de cette fonction annoncée si ce statut est lisible. Exemple conforme : le plan prévoit une délégation future avec plafonds, et le dessin indique « Prévu, pas encore disponible » / « Délégation avec plafonds ». Ce n’est pas une fonction présentée comme active. Les dessins peuvent annoncer un point voisin du plan ; ce n’est pas en soi une erreur. Les simples choix esthétiques ne sont pas des erreurs. Ne vérifie pas l’actualité externe : compare seulement aux faits et aux nuances du plan fourni.\nRéponds uniquement en JSON : {"erreurs":[{"id":"identifiant exact du dessin","raison":"fait à corriger"}]}. Tableau vide si conforme.`, 'Tu relis les faits d’un storyboard. Ne propose ni faits nouveaux ni appréciation esthétique.'));
 const ids=new Set(entrees.map(p=>p.id));
 if(!avis||!Array.isArray(avis.erreurs)||avis.erreurs.some(e=>!ids.has(e?.id)||typeof e.raison!=='string'||!e.raison.trim()))throw Error('Contrôle factuel du storyboard invalide ; rendu arrêté.');
 const revue={ok:avis.erreurs.length===0,empreinte,erreurs:avis.erreurs};
 fs.mkdirSync(dossier,{recursive:true});let n=1,f;
 do{f=path.join(dossier,`controle-faits-storyboard-${n++}.json`);}while(fs.existsSync(f));
 fs.writeFileSync(f,JSON.stringify(revue,null,2));
 if(!revue.ok)throw Error('Storyboard factuellement incorrect : '+avis.erreurs.map(e=>e.id+' : '+e.raison).join(' ; '));
 storyboard.revueFactuelle=revue;return revue;
}
module.exports={verifierStoryboardFactuel,empreinteStoryboard};
