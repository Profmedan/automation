/** Directions dérivées des skills importés : la palette, le support, la typo et le dessin changent ensemble. */
const fs=require('node:fs'),path=require('node:path');
const DIRECTIONS={
 editorial:{nom:'Collage éditorial',base:'#f4eedf',ink:'#24221f',muted:'#5b5146',accent:'#a73528',soft:'#e9ddc5',display:'VideoSerif',body:'VideoSans',support:'papier',signature:'papier découpé, objets illustrés et recadrages francs'},
 handdrawn:{nom:'Carnet dessiné',base:'#fff9eb',ink:'#29281f',muted:'#675e4e',accent:'#b84220',soft:'#f0e4c9',display:'VideoHand',body:'VideoSans',support:'carnet',signature:'tracés SVG dessinés et flèches au feutre'},
 blackboard:{nom:'Tableau graphique',base:'#171b19',ink:'#f8f5e9',muted:'#c6ccbd',accent:'#cbef6b',soft:'#2c332b',display:'VideoSans',body:'VideoSans',support:'craie',signature:'tracés clairs, propagation et mises au point'},
 kinetic:{nom:'Affiche animée',base:'#f5cc4a',ink:'#221b18',muted:'#60491c',accent:'#9e2f1d',soft:'#f8e4a3',display:'VideoSans',body:'VideoSans',support:'affiche',signature:'grandes formes imprimées, blocs typographiques et coupes franches'},
 cinematic:{nom:'Objets en studio',base:'#1d1714',ink:'#fff2dd',muted:'#d8bea4',accent:'#ecb85a',soft:'#38271d',display:'VideoSerif',body:'VideoSans',support:'studio',signature:'matières chaudes, profondeur et approche du sujet'},
 paper:{nom:'Dossier imprimé',base:'#fbf6eb',ink:'#28231e',muted:'#665747',accent:'#9b3625',soft:'#eae0ce',display:'VideoSerif',body:'VideoSans',support:'papier',signature:'documents annotés, découpes et aplats chauds'},
 // Les anciens noms restent lisibles pour les projets archivés ; ils ne sont plus choisis automatiquement.
 blueprint:{nom:'Plan technique',base:'#f5f2e9',ink:'#242b24',muted:'#556555',accent:'#356c45',soft:'#dfe7d7',display:'VideoSans',body:'VideoSans',support:'carnet',signature:'grille et traits techniques'},
 neon:{nom:'Encre violette',base:'#20112c',ink:'#fcf0ff',muted:'#d8b4eb',accent:'#e4adff',soft:'#412250',display:'VideoSans',body:'VideoSans',support:'studio',signature:'plans lumineux violets'},
 duotone:{nom:'Bichromie imprimée',base:'#f2b3a0',ink:'#341a24',muted:'#713e45',accent:'#852a48',soft:'#ffdecc',display:'VideoSans',body:'VideoSans',support:'affiche',signature:'aplats roses et carmin'},
 glass:{nom:'Verre ambré',base:'#2b1e18',ink:'#fff3e0',muted:'#e2c4a1',accent:'#f4b25c',soft:'#5d3b24',display:'VideoSans',body:'VideoSans',support:'studio',signature:'reflets ambrés et objets en profondeur'},
 terminal:{nom:'Console graphite',base:'#171d16',ink:'#edf8e0',muted:'#b8cbaa',accent:'#c3ed88',soft:'#2b3a24',display:'VideoSans',body:'VideoSans',support:'craie',signature:'traits verts et grille graphite'},
};
const FONTES_LOCALES=`@font-face{font-family:VideoSerif;src:local("Georgia Bold");font-weight:100 900;} @font-face{font-family:VideoHand;src:local("Chalkduster");font-weight:100 900;} @font-face{font-family:VideoSans;src:local("Avenir Next Condensed");font-weight:100 900;}`;
const AUTOMATIQUES=['editorial','handdrawn','blackboard','kinetic','cinematic','paper'];
const DECORS=['principal','contraste','accent'];
function direction(style){return DIRECTIONS[style]||DIRECTIONS.editorial;}
function decorScene(ref){return /^nuance\./.test(ref)?'contraste':['accroche','conclusion'].includes(ref)?'accent':'principal';}
function tokens(style,decor='principal'){
 const d=direction(style);
 if(decor==='contraste')return {...d,base:d.ink,ink:d.base,muted:d.soft,soft:d.muted,accent:['blackboard','terminal','neon','cinematic','glass'].includes(style)?'#713417':'#f1c65b'};
 if(decor==='accent')return {...d,base:d.soft};
 return d;
}
function cssTokens(t){return `--fond-a:${t.base};--fond-b:${t.soft};--fond-c:${t.base};--encre:${t.ink};--encre-2:${t.muted};--papier:${t.base};--nuit:${t.ink};--muet:${t.muted};--filet:${t.muted};--accent:${t.accent};--accent-vif:${t.accent};--alerte:${t.accent};--prudence:${t.accent};--lueur:none;--font-display:${t.display};--font-body:${t.body};`;}
function cssDirection(id,style,decor){
 const t=tokens(style,decor),s=`#${id}-scene`;
 const fond=t.support==='carnet'?`repeating-linear-gradient(0deg,transparent 0 49px,${t.muted}12 50px 51px),${t.base}`:t.support==='craie'?`radial-gradient(ellipse at 20% 30%,${t.soft},transparent 70%),${t.base}`:t.support==='studio'?`radial-gradient(ellipse at 65% 65%,${t.soft},transparent 70%),${t.base}`:`radial-gradient(${t.muted}14 .8px,transparent 1px),${t.base}`;
 return `${FONTES_LOCALES} /* direction: ${style}; décor: ${decor} */ ${s}{${cssTokens(t)}color:var(--encre);background:${fond};background-size:${['papier','affiche'].includes(t.support)?'7px 9px,auto':'auto'};}
 ${s} .camera{overflow:hidden;} ${s} .gros,#${id}-titre{font-family:var(--font-display),Georgia,serif;letter-spacing:-.025em;}
 #${id}-titre{top:370px;font-size:72px;line-height:1.05;max-height:none;}
 #${id}-lab{display:none;} #${id}-src{color:var(--encre-2);}
 .${id}-src,.${id}-etape{background:var(--fond-b);color:var(--encre);border-color:var(--filet);}
 .${id}-carte{border:0;box-shadow:4px 9px 0 ${t.ink}18;border-radius:${['handdrawn','editorial','paper','kinetic'].includes(style)?'3px':'20px'};}
 ${['editorial','paper'].includes(style)?`#${id}-titre{background:var(--fond-b);padding:14px 22px;box-shadow:5px 5px 0 ${t.ink}12;}`:''}
 .${id}-noeud{font-family:var(--font-body),sans-serif!important;box-shadow:none!important;}
 .${id}-illustration{background:transparent;border:0;overflow:visible!important;gap:10px;}
 .${id}-illustration .illustration{display:block;flex:1 1 auto;min-height:0;max-height:calc(100% - 86px);width:100%;filter:${['cinematic','glass'].includes(style)?'drop-shadow(10px 18px 6px #0005)':'none'};}
 .${id}-illustration>div{flex:0 0 auto;max-width:100%;font-size:36px;line-height:1.1;}
 .ombre-objet{fill:var(--encre);opacity:.08;stroke:none;}
 ${style==='handdrawn'?`.${id}-illustration path{stroke-width:2.6;}`:''}
 #${id}-decor{position:absolute;left:-60px;top:-60px;width:1200px;height:2040px;pointer-events:none;opacity:.45;background:radial-gradient(ellipse at 85% 75%,${t.soft} 0 18%,transparent 38%);}
 #${id}-grain{position:absolute;inset:0;pointer-events:none;opacity:.08;background-image:repeating-linear-gradient(17deg,transparent 0 4px,${t.muted}20 5px 6px);}`;
}
/** Le choix est fixé avant la voix et le storyboard, puis enregistré avec ses raisons. */
function preparerDirection(script,dossier){
 const fichier=path.join(dossier,'direction-artistique.json');
 if(script.directionArtistique&&AUTOMATIQUES.includes(script.directionArtistique.style)&&script.motionStyle===script.directionArtistique.style){script.directionArtistique.selection=script.selectionMotion||null;fs.mkdirSync(dossier,{recursive:true});fs.writeFileSync(fichier,JSON.stringify(script.directionArtistique,null,2));return script.directionArtistique;}
 const parent=path.dirname(dossier);let precedents=[];
 if(fs.existsSync(parent))precedents=fs.readdirSync(parent,{withFileTypes:true}).filter(e=>e.isDirectory()&&path.join(parent,e.name)!==dossier).map(e=>{
  try{const p=path.join(parent,e.name,'motion-plan.json');return {date:fs.statSync(p).mtimeMs,style:JSON.parse(fs.readFileSync(p)).style};}catch{return null;}
 }).filter(Boolean).sort((a,b)=>b.date-a.date).slice(0,3).map(e=>e.style);
 const propose=AUTOMATIQUES.includes(script.motionStyle)?script.motionStyle:'editorial';
 const style=precedents[0]===propose?(AUTOMATIQUES.find(x=>!precedents.includes(x))||AUTOMATIQUES.find(x=>x!==propose)):propose;
 script.motionStyle=style;
 const d=direction(style);
 const resultat={version:2,selection:script.selectionMotion||null,style,nom:d.nom,palette:{fond:d.base,encre:d.ink,accent:d.accent},polices:{display:d.display,texte:d.body},support:d.support,signature:d.signature,
  precedents,raison:style===propose?'Direction proposée selon le sujet ; fonds et illustration définis ensemble.':'Changer la direction visuelle du rendu précédent.',
  mise_en_scene:'Grands objets illustrés, tracés originaux, changements de dessin calés sur la voix, titres et sous-titres stables.',
  decors:script.scenes.map(s=>({scene:s.planRef,decor:decorScene(s.planRef)})),
  reference:'https://www.instagram.com/reel/Dft9mBIJSRr/',reference_observee:'Titres sur papier découpé, captures annotées et illustrations superposées. Aucune image du Reel réutilisée.',
 };
 script.directionArtistique=resultat;fs.mkdirSync(dossier,{recursive:true});fs.writeFileSync(fichier,JSON.stringify(resultat,null,2));return resultat;
}
module.exports={FONTES_LOCALES,DIRECTIONS,AUTOMATIQUES,DECORS,direction,tokens,cssTokens,cssDirection,decorScene,preparerDirection};
