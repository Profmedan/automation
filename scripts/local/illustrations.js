/** Pictogrammes originaux et tracés SVG déclaratifs ; aucune image distante, marque ou code du modèle. */
const ICONES={
 portefeuille:['M14 30 Q14 20 25 20 H78 V78 H14 Z','M14 30 H86 V72 H61 Q50 72 50 58 Q50 46 61 46 H86','M66 57 H72'],
 carte:['M10 25 Q10 18 18 18 H82 Q90 18 90 25 V75 Q90 82 82 82 H18 Q10 82 10 75 Z','M10 36 H90','M21 62 H39 M21 70 H53','M66 58 H77 V69 H66 Z'],
 cadenas:['M24 44 H76 V86 H24 Z','M34 44 V27 Q34 11 50 11 Q66 11 66 27 V44','M50 60 V72'],
 jeton:['M50 10 A40 40 0 1 0 50 90 A40 40 0 1 0 50 10','M50 21 A29 29 0 1 0 50 79 A29 29 0 1 0 50 21','M38 49 L47 59 L65 38'],
 robot:['M23 28 H77 Q85 28 85 37 V72 Q85 80 77 80 H23 Q15 80 15 72 V37 Q15 28 23 28 Z','M50 28 V12 M44 12 H56','M29 46 H36 M64 46 H71 M35 66 H65','M15 43 H7 V66 H15 M85 43 H93 V66 H85'],
 panier:['M10 18 H22 L32 67 H80 L90 33 H26','M39 79 A5 5 0 1 0 39 89 A5 5 0 1 0 39 79 M74 79 A5 5 0 1 0 74 89 A5 5 0 1 0 74 79','M43 43 V57 M58 43 V57 M73 43 V57'],
 telephone:['M28 8 H72 Q79 8 79 16 V84 Q79 92 72 92 H28 Q21 92 21 84 V16 Q21 8 28 8 Z','M39 18 H61 M44 82 H56','M35 49 L46 60 L66 38'],
 personne:['M50 11 A16 16 0 1 0 50 43 A16 16 0 1 0 50 11','M19 89 V74 Q19 51 50 51 Q81 51 81 74 V89'],
 barriere:['M8 37 H92 V62 H8 Z','M18 62 V91 M82 62 V91','M20 37 L42 62 M47 37 L69 62 M74 37 L92 56'],
 document:['M24 10 H63 L80 28 V90 H24 Z','M63 10 V28 H80','M35 44 H68 M35 56 H68 M35 68 H58'],
 serveur:['M18 12 H82 V34 H18 Z M18 40 H82 V62 H18 Z M18 68 H82 V90 H18 Z','M29 23 H34 M29 51 H34 M29 79 H34 M51 23 H70 M51 51 H70 M51 79 H70'],
 balances:['M50 10 V85 M27 90 H73','M16 27 H84 M50 15 L45 27 H55 Z','M23 27 L9 57 H37 Z M77 27 L63 57 H91 Z'],
 monde:['M50 8 A42 42 0 1 0 50 92 A42 42 0 1 0 50 8','M8 50 H92 M14 28 H86 M14 72 H86','M50 8 Q20 50 50 92 M50 8 Q80 50 50 92'],
 puce:['M25 25 H75 V75 H25 Z M37 37 H63 V63 H37 Z','M36 25 V10 M50 25 V10 M64 25 V10 M36 75 V90 M50 75 V90 M64 75 V90 M25 36 H10 M25 50 H10 M25 64 H10 M75 36 H90 M75 50 H90 M75 64 H90'],
 boutique:['M15 40 H85 V90 H15 Z','M9 40 L19 17 H81 L91 40 Q82 55 72 40 Q61 55 50 40 Q39 55 28 40 Q18 55 9 40','M29 60 H47 V90 M60 59 H75 V76 H60 Z'],
 nuage:['M24 74 Q6 74 8 56 Q9 42 24 40 Q24 17 48 17 Q70 17 74 36 Q93 36 94 56 Q95 74 77 74 Z'],
 loupe:['M42 14 A28 28 0 1 0 42 70 A28 28 0 1 0 42 14','M63 64 L88 89'],
 horloge:['M50 10 A40 40 0 1 0 50 90 A40 40 0 1 0 50 10','M50 25 V50 L70 61'],
 validation:['M50 8 A42 42 0 1 0 50 92 A42 42 0 1 0 50 8','M27 50 L44 67 L76 32'],
 question:['M30 31 Q30 10 52 10 Q76 10 76 32 Q76 45 58 51 Q50 55 50 67','M49 82 H51'],
 main:['M28 83 L13 63 Q7 51 17 48 Q22 47 29 57 V20 Q29 10 38 14 V46 V10 Q42 1 48 10 V44 V13 Q53 5 58 14 V47 V25 Q65 18 69 27 V54 Q89 38 90 51 L76 81 Q72 91 62 91 H42 Q32 91 28 83'],
 reseau:['M50 35 A15 15 0 1 0 50 65 A15 15 0 1 0 50 35','M15 7 H35 V27 H15 Z M68 7 H88 V27 H68 Z M15 74 H35 V94 H15 Z M68 74 H88 V94 H68 Z','M35 27 L42 37 M68 27 L58 37 M35 74 L42 63 M68 74 L58 63'],
 europe:['M48 11 L62 19 L58 33 L75 39 L66 50 L82 63 L68 71 L60 63 L55 86 L42 76 L28 83 L20 68 L26 56 L16 47 L31 39 L28 25 L40 29 Z'],
 interdit:['M50 10 A40 40 0 1 0 50 90 A40 40 0 1 0 50 10','M22 22 L78 78'],
};
const NOMS_ICONES=Object.keys(ICONES);
const ROLES=['encre','accent','papier'];
function erreursIllustration(n){
 const e=[];
 if(Boolean(n.icone)===Boolean(n.traces))return ['illustration : fournir une icone OU des traces originales'];
 if(n.icone&&!NOMS_ICONES.includes(n.icone))e.push('illustration : icone inconnue');
 if(n.traces){
  if(!Array.isArray(n.traces)||!n.traces.length||n.traces.length>24)return ['illustration : 1 à 24 tracés au plus'];
  for(const t of n.traces){
   if(!t||Object.keys(t).some(k=>!['d','role','plein'].includes(k))||typeof t.d!=='string'||t.d.length>3000||!/^\s*[Mm][\d\s,.+eE\-MmLlHhVvCcSsQqTtAaZz]+$/.test(t.d)||!ROLES.includes(t.role||'encre')||t.plein!=null&&typeof t.plein!=='boolean')e.push('illustration : tracé déclaratif invalide');
   else if((t.d.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)||[]).some(x=>!Number.isFinite(+x)||Math.abs(+x)>300))e.push('illustration : coordonnées de tracé hors limites');
  }
 }
 if(n.texte&&n.h*6<170)e.push('illustration : hauteur insuffisante pour le dessin et son libellé');
 return e;
}
function svgIllustration(n,id,esc){
 const traces=n.traces||(ICONES[n.icone]||[]).map(d=>({d,role:n.accent?'accent':'encre'}));
 return `<svg id="${id}-art" class="illustration" viewBox="0 0 100 100" aria-hidden="true"><ellipse class="ombre-objet" cx="50" cy="91" rx="35" ry="5"/>${traces.map((t,i)=>`<path id="${id}-trait${i}" d="${esc(t.d)}" pathLength="1" fill="${t.plein?`var(--${t.role||'encre'})`:'none'}" stroke="var(--${t.role||'encre'})" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
}
module.exports={NOMS_ICONES,erreursIllustration,svgIllustration};
