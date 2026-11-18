/** Dessins déclaratifs ouverts : seuls des primitives, positions, textes et mouvements contrôlés sont compilés. */
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const MOUVEMENTS = ['fondu','monte','gauche','droite','zoom','volet','bascule','impact','rebond','masque-gauche','masque-haut','iris','dessine','rotation','mot-mot','machine','eventail','convergence','focus','elastique'];
const {DIRECTIONS,AUTOMATIQUES,cssDirection}=require('./directions-visuelles');
const {NOMS_ICONES,erreursIllustration,svgIllustration}=require('./illustrations');
const STYLES=Object.keys(DIRECTIONS);
const FORTS = new Set(['impact','rebond','elastique','convergence']);
const TYPES = ['texte','carte','cercle','rectangle','donnee','illustration'];
const CLES = new Set(['id','type','texte','valeur','unite','x','y','w','h','mouvement','accent','icone','traces']);

/** Les noms du modèle sont des références opaques, pas des sélecteurs CSS. Ne répare jamais un lien ambigu. */
function normaliserComposition(v) {
  if (v?.type !== 'composition' || !Array.isArray(v.elements)) return;
  const noms = v.elements.map(n => n?.id);
  if (noms.some(id => typeof id !== 'string' || !id.trim() || id.length > 100) || new Set(noms).size !== noms.length) return;
  const ids = new Map(noms.map((id, i) => [id, `e${i}`]));
  if (v.liens != null && (!Array.isArray(v.liens) || v.liens.some(l => !l || !ids.has(l.de) || !ids.has(l.vers)))) return;
  for (const n of v.elements) n.id = ids.get(n.id);
  for (const l of v.liens || []) { l.de = ids.get(l.de); l.vers = ids.get(l.vers); }
}

function validerComposition(v) {
  const erreurs=[];
  if (!v || v.type !== 'composition') return ['composition attendue'];
  if(Object.keys(v).some(k=>!['type','intention','elements','liens'].includes(k))) erreurs.push('propriété de composition non autorisée');
  if (typeof v.intention !== 'string' || !v.intention.trim() || v.intention.length>240) erreurs.push('intention explicative requise (240 caractères au plus)');
  const nodes=Array.isArray(v.elements)?v.elements:[];
  if(nodes.length<1 || nodes.length>12) erreurs.push('1 à 12 éléments au plus par scène pour conserver la lisibilité');
  const ids=new Set();
  nodes.forEach((n,i)=>{
    const ou=`élément ${i+1}`;
    if(!n || typeof n!=='object' || Array.isArray(n)){erreurs.push(`${ou} invalide`);return;}
    if(Object.keys(n).some(k=>!CLES.has(k))) erreurs.push(`${ou} : propriété non autorisée`);
    if(!/^[a-z][a-z0-9-]{0,31}$/.test(n.id||'') || ids.has(n.id)) erreurs.push(`${ou} : identifiant invalide ou répété`);
    ids.add(n.id);
    if(!TYPES.includes(n.type)) erreurs.push(`${ou} : primitive inconnue`);
    if(n.type==='illustration')erreurs.push(...erreursIllustration(n).map(e=>`${ou} : ${e}`));
    else if(n.icone!=null||n.traces!=null)erreurs.push(`${ou} : icone et traces réservées aux illustrations`);
    if(!['x','y','w','h'].every(k=>typeof n[k]==='number' && Number.isFinite(n[k])) || n.x<0 || n.y<0 || n.w<5 || n.h<5 || n.x+n.w>100 || n.y+n.h>100) erreurs.push(`${ou} : géométrie hors du cadre 0–100`);
    if(n.mouvement && !MOUVEMENTS.includes(n.mouvement)) erreurs.push(`${ou} : mouvement inconnu`);
    if(n.accent!=null && typeof n.accent!=='boolean') erreurs.push(`${ou} : accent booléen attendu`);
    if(n.texte!=null && (typeof n.texte!=='string' || n.texte.length>100 || n.texte.trim().split(/\s+/).length>12)) erreurs.push(`${ou} : texte de 100 caractères et 12 mots au plus`);
    if(n.type==='donnee' && (typeof n.valeur!=='number' || !Number.isFinite(n.valeur))) erreurs.push(`${ou} : donnée numérique finie requise`);
    if(n.type!=='donnee' && (n.valeur!=null || n.unite!=null)) erreurs.push(`${ou} : valeur et unité réservées à une donnée`);
    if(n.unite!=null && (typeof n.unite!=='string' || n.unite.length>16)) erreurs.push(`${ou} : unité invalide`);
    if(['texte','carte','donnee'].includes(n.type) && !String(n.texte||'').trim()) erreurs.push(`${ou} : libellé requis`);
    if(typeof n.texte==='string' && n.texte.trim() && Number.isFinite(n.w) && Number.isFinite(n.h)){
      const chars=Math.max(1,Math.floor((n.w*9-28)/(24*.6)));
      const besoin=Math.ceil(n.texte.length/chars)*24*1.15+(n.type==='donnee'?40:0);
      if(besoin>n.h*6-28)erreurs.push(`${ou} : boîte trop petite pour le texte`);
    }
  });
  const links=Array.isArray(v.liens)?v.liens:[];
  if(v.liens!=null && !Array.isArray(v.liens) || links.length>16) erreurs.push('16 liens au maximum');
  links.forEach((l,i)=>{
    if(!l || typeof l!=='object' || Object.keys(l).some(k=>!['de','vers','texte'].includes(k)) || !ids.has(l.de) || !ids.has(l.vers) || l.de===l.vers) erreurs.push(`lien ${i+1} : extrémité invalide`);
    if(l?.texte!=null && (typeof l.texte!=='string' || l.texte.length>36)) erreurs.push(`lien ${i+1} : libellé trop long`);
  });
  nodes.forEach((a,i)=>nodes.slice(i+1).forEach(b=>{
    if(!a?.texte || !b?.texte)return;
    if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5 && Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5) erreurs.push('deux éléments de texte se recouvrent');
  }));
  return erreurs;
}

/** Les coordonnées ne sont pas des données de l'article. Seuls les textes, unités et valeurs visibles le sont. */
function faitsComposition(v) {
  return { elements:(Array.isArray(v.elements)?v.elements:[]).map(n=>({texte:n?.texte,valeur:n?.valeur,unite:n?.unite})), liens:(Array.isArray(v.liens)?v.liens:[]).map(l=>({texte:l?.texte})) };
}

function choisirStyle(titre, propose) {
  if(STYLES.includes(propose))return propose;
  return AUTOMATIQUES[parseInt(createHash('sha256').update(String(titre||'')).digest('hex').slice(0,8),16)%AUTOMATIQUES.length];
}

function styleScene(id,style,decor='principal'){return cssDirection(id,style,decor);}

function reglesComposition() {
  return `\nBANQUE OUVERTE — tu n'es pas limité aux douze gabarits. Pour les scènes de développement, d'idée principale et de nuance, conçois en priorité une composition originale qui explique le sujet : schéma d'architecture, flux, réseau d'acteurs, cycle, étages, tableau, bifurcation, constellation de notions, données et annotations. Les liens expriment uniquement des relations présentes dans le plan.
Ajoute au JSON racine "motionStyle" parmi ${AUTOMATIQUES.join(', ')}. Choisis un langage de mise en scène adapté au sujet : collage éditorial, carnet dessiné, tableau graphique, affiche animée ou objets en studio. Pas de fond bleu par défaut. Fais varier le décor entre les parties explicatives et les nuances tout en gardant une palette cohérente.
VISUEL OUVERT (coordonnées de la zone graphique en pourcentage, x+y indépendants des faits) :
{"type":"composition","intention":"ce que montre le dessin","elements":[{"id":"acteur","type":"carte","texte":"Un acteur du plan","x":5,"y":15,"w":38,"h":35,"mouvement":"volet","accent":true},{"id":"resultat","type":"carte","texte":"Son résultat","x":57,"y":15,"w":38,"h":35,"mouvement":"masque-gauche"}],"liens":[{"de":"acteur","vers":"resultat","texte":"Relation du plan"}]}
Primitives : ${TYPES.join(', ')}. Une illustration est un véritable dessin SVG, avec son libellé : fournir icone parmi ${NOMS_ICONES.join(', ')}, OU traces:[{d:"M10 10 L90 90",role:"encre",plein:false}] pour dessiner un objet original dans un viewBox 0 0 100 100. Les chiffres des coordonnées ne sont pas des faits. Ne fournis jamais de code, de logo inventé ou de fausse capture d’interface. Une illustration avec du texte demande une hauteur h≥32 ; privilégie un grand sujet illustré et au plus un objet secondaire. Les icônes ne limitent pas les compositions : les tracés originaux permettent des dessins nouveaux. Pour donnee, fournir valeur numérique et éventuellement unite, tirées du plan. Pour une donnée en toutes lettres, garder texte. 1 à 12 éléments, de préférence 3 à 6 ; 16 liens maximum ; id unique, par exemple e0, e1, e2, repris exactement par de et vers. x,y,w,h sont des nombres de 0 à 100, avec x+w et y+h ≤100 ; les libellés restent dans les boîtes. Laisse de l'espace et n'empile pas les boîtes de texte. texte ≤12 mots et ≤100 caractères ; une seule idée par élément. Pas de code, HTML, URL ou image dans cette structure.
Mouvements disponibles : ${MOUVEMENTS.join(', ')}. Un seul impact, rebond, elastique ou convergence dominant par vidéo ; les autres arrivées sont secondaires. Les mots doivent avoir fini de bouger avant la lecture. Le rendu borne les mouvements à la durée réelle et réutilise la voix comme horloge. Le titre principal reste lisible à la première image.
Ces éléments et leurs arrangements créent de nouveaux visuels sans nécessiter un identifiant de recette préexistant. Les douze gabarits restent possibles quand ils sont mieux adaptés. Tout chiffre et toute citation doivent encore provenir du plan ou de l'article.`;
}

/** Raccord aux bords des boîtes, jamais au milieu d'un libellé transparent. */
function extremitesLien(a,b){
 const ax=(a.x+a.w/2)*9,ay=(a.y+a.h/2)*6,bx=(b.x+b.w/2)*9,by=(b.y+b.h/2)*6,dx=bx-ax,dy=by-ay;
 const ta=Math.min(a.w*4.5/(Math.abs(dx)||1e-9),a.h*3/(Math.abs(dy)||1e-9));
 const tb=Math.min(b.w*4.5/(Math.abs(dx)||1e-9),b.h*3/(Math.abs(dy)||1e-9));
 const marge=Math.min(.02,Math.max(0,(1-ta-tb)/4));
 return {ax:ax+dx*(ta+marge),ay:ay+dy*(ta+marge),bx:bx-dx*(tb+marge),by:by-dy*(tb+marge)};
}

function dessinerComposition(scene,c,{echapper:esc,nombreFr:fmt}) {
  const v=scene.visuel;
  if(v?.type!=='composition' || validerComposition(v).length)return null;
  const id=c.id,D=c.duree;
  const statique=c.motion?.design==='static' || D<(scene.planCourt?1:2);
  const css=`#${id}-dessin {position:absolute;left:40px;top:660px;width:900px;height:600px;}
    .${id}-noeud {position:absolute;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px;border-radius:22px;line-height:1.15;overflow:hidden;overflow-wrap:anywhere;color:var(--encre);}
    .${id}-carte {background:var(--papier);color:var(--nuit);box-shadow:0 14px 36px rgba(0,0,0,.18);border:2px solid var(--accent-vif);}
    .${id}-cercle {border-radius:50%;border:5px solid var(--accent-vif);background:var(--fond-b);}
    .${id}-rectangle {border:3px solid var(--accent-vif);border-radius:6px;background:var(--fond-b);}
    .${id}-donnee {border-bottom:6px solid var(--accent-vif);}
    .${id}-valeur {display:block;font-weight:900;font-variant-numeric:tabular-nums;line-height:1;}
    .${id}-unite {font-size:.42em;margin-left:.12em;} .${id}-mot {display:inline-block;margin:0 .1em;} .${id}-lettre {display:inline-block;margin:0;} .${id}-mot-machine {display:inline-block;white-space:nowrap;}
    #${id}-liens {position:absolute;inset:0;width:900px;height:600px;overflow:visible;}`;
  const anim=[];
  const ids=new Map(v.elements.map(n=>[n.id,n]));
  const liens=(v.liens||[]).map((l,i)=>{
    const a=ids.get(l.de),b=ids.get(l.vers),{ax,ay,bx,by}=extremitesLien(a,b);
    const len=Math.hypot(bx-ax,by-ay);
    if(!statique)anim.push(`tl.fromTo("#${id}-lien${i}",{strokeDashoffset:${len}},{strokeDashoffset:0,duration:0.55,ease:easeMotion},${Math.min(.4+i*.06,Math.max(.1,D-1.6)).toFixed(3)});`);
    return `<line id="${id}-lien${i}" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="var(--accent-vif)" stroke-width="5" stroke-dasharray="${len} ${len}"/>${l.texte?`<text x="${(ax+bx)/2}" y="${(ay+by)/2-16}" text-anchor="middle" fill="var(--encre-2)" font-size="27">${esc(l.texte)}</text>`:''}`;
  }).join('');
  let fort=false;
  const nodes=v.elements.map((n,i)=>{
    const sel=`#${id}-noeud-${n.id}`;
    let mouvement=n.mouvement||'monte';
    if(FORTS.has(mouvement)){
      if(fort || c.motion?.emphase===false)mouvement='monte';else fort=true;
    }
    const start=scene.planCourt ? .08+i*.06 : Math.min(.16+i*.12,Math.max(.1,D-1.7));
    const marge=scene.planCourt?40:28;
    const width=n.w*9-marge,height=n.h*6-marge;
    const chiffreSize=Math.min(126,Math.max(40,height*.43));
    const long=Math.max(1,...String(n.texte||'').split(/\s+/).map(m=>m.length));
    const minimumFont=scene.planCourt?36:24;
    let font=Math.max(minimumFont,Math.min(58,Math.floor(width/(long*(scene.planCourt ? .68 : .62)))));
    while(font>minimumFont && Math.ceil(String(n.texte||'').length/Math.max(1,Math.floor(width/(font*.6))))*font*1.15+(n.type==='donnee'?chiffreSize:0)>height)font=Math.max(minimumFont,font-2);
    let text=esc(n.texte||'');
    const reveal=mouvement==='mot-mot'||mouvement==='machine';
    const parts=reveal?(mouvement==='machine'?Array.from(n.texte||''):String(n.texte||'').split(/\s+/)):[];
    if(reveal){
      if(mouvement==='machine'){
        let k=0;
        text=String(n.texte||'').split(/(\s+)/).map(word=>{
          if(/^\s+$/.test(word)){k+=word.length;return ' ';}
          return `<span class="${id}-mot-machine">${Array.from(word).map(letter=>`<span id="${id}-part-${n.id}-${k++}" class="${id}-lettre">${esc(letter)}</span>`).join('')}</span>`;
        }).join('');
      }else text=parts.map((p,j)=>`<span id="${id}-part-${n.id}-${j}" class="${id}-mot">${esc(p)}</span>`).join(' ');
    }
    if(!statique){
      const from={opacity:0},to={opacity:1,duration:scene.planCourt ? .28 : .52,ease:'__EASE__'};
      if(mouvement==='monte')from.y=36;
      if(mouvement==='gauche')from.x=-70;
      if(mouvement==='droite')from.x=70;
      if(mouvement==='zoom')from.scale=.55;
      if(mouvement==='volet'){from.rotationY=-85;from.transformPerspective=2500;from.transformOrigin='0% 50%';}
      if(mouvement==='bascule'){from.rotationX=75;from.transformPerspective=2500;}
      if(mouvement==='impact'){from.scale=1.3;from.rotation=-3;}
      if(mouvement==='rebond'){from.scale=.65;from.y=22;to.ease='back.out(1.4)';}
      if(mouvement==='elastique'){from.scale=.65;to.ease='elastic.out(1,0.7)';to.duration=.85;}
      if(scene.planCourt)to.duration=Math.min(to.duration,Math.max(.1,D-start-.1));
      if(mouvement==='masque-gauche'){from.clipPath='inset(0% 100% 0% 0%)';to.clipPath='inset(0% 0% 0% 0%)';}
      if(mouvement==='masque-haut'){from.clipPath='inset(0% 0% 100% 0%)';to.clipPath='inset(0% 0% 0% 0%)';}
      if(mouvement==='iris'){from.clipPath='circle(0% at 50% 50%)';to.clipPath='circle(75% at 50% 50%)';}
      if(mouvement==='dessine'&&n.type!=='illustration'){from.scaleX=0;from.transformOrigin='0% 50%';}
      if(['editorial','paper'].includes(c.motion?.style)){to.ease='steps(6)';to.duration=0.4;}
      if(n.type==='illustration'){from.y=28;from.scale=.88;to.y=0;to.scale=1;}
      if(mouvement==='rotation'){from.rotation=-18;from.scale=.8;}
      if(mouvement==='eventail'){from.skewY=10;from.rotation=5;}
      if(mouvement==='convergence'){from.x=n.x<50?-100:100;from.y=n.y<50?-55:55;from.scale=.8;}
      if(mouvement==='focus'){from.scale=1.15;from.opacity=.2;}
      const final={x:0,y:0,scale:1,scaleX:1,rotation:0,rotationX:0,rotationY:0,skewY:0};
      for(const k of Object.keys(from))if(!(k in to))to[k]=k in final?final[k]:from[k];
      const serial=o=>JSON.stringify(o).replace('"__EASE__"','easeMotion');
      if(reveal){
        parts.forEach((_,j)=>{
          if(mouvement==='machine' && /\s/.test(parts[j]))return;
          const t=start+j*Math.min(.05,.65/Math.max(1,parts.length));
          anim.push(`tl.fromTo("#${id}-part-${n.id}-${j}",{opacity:0,y:${mouvement==='machine'?0:20}},{opacity:1,y:0,duration:${mouvement==='machine'?.03:.3},ease:easeMotion},${t.toFixed(3)});`);
        });
      }else anim.push(`tl.fromTo(${JSON.stringify(sel)},${serial(from)},${serial(to)},${start.toFixed(3)});`);
    }
    const art=n.type==='illustration'?svgIllustration(n,`${id}-noeud-${n.id}`,esc):'';
    if(art&&!statique){
      if(c.motion?.style==='handdrawn'||mouvement==='dessine')anim.push(`tl.fromTo("${sel} path",{strokeDasharray:"1 1",strokeDashoffset:1},{strokeDashoffset:0,duration:0.38,stagger:0.025,ease:"power2.inOut"},${start.toFixed(3)});`);
    }
    const chiffre=n.type==='donnee'?`<span class="${id}-valeur" style="font-size:${chiffreSize}px">${fmt(n.valeur)}<span class="${id}-unite">${esc(n.unite||'')}</span></span>`:'';
    return `<div id="${id}-noeud-${n.id}" class="${id}-noeud ${id}-${n.type}" style="left:${n.x}%;top:${n.y}%;width:${n.w}%;height:${n.h}%;font:700 ${font}px/1.15 var(--font-body,Roboto);${n.accent?'border-color:var(--accent-vif);':''}">${art}${chiffre}<div>${text}</div></div>`;
  }).join('');
  return {corps:`<!-- design: composition --><div id="${id}-dessin"><svg id="${id}-liens" viewBox="0 0 900 600" aria-hidden="true">${liens}</svg>${nodes}</div>`,css,js:anim.join('\n'),titreHtml:null,titreCss:'',titreAnime:false};
}

/** Banque de dispositions sans faits anciens : identifiants anonymisés, textes et valeurs à remplacer. */
function gabaritComposition(v) {
  const ids=new Map(v.elements.map((e,i)=>[e.id,`e${i}`]));
  return {type:'composition',intention:'Disposition à réinterpréter avec les faits du nouveau plan',
    elements:v.elements.map(e=>{const n={...e,id:ids.get(e.id),...(e.texte!=null?{texte:'Texte du plan'}:{}),...(e.type==='donnee'?{valeur:0,unite:''}:{})};if(e.type==='illustration'){delete n.traces;n.icone='question';}return n;}),
    liens:(v.liens||[]).map(l=>({de:ids.get(l.de),vers:ids.get(l.vers),...(l.texte?{texte:'Lien du plan'}:{})}))};
}

function enregistrerBanque(script,dossier) {
  const ids=[];
  for(const s of script.scenes||[]){
    if(s.visuel?.type!=='composition' || validerComposition(s.visuel).length)continue;
    const gabarit=gabaritComposition(s.visuel);
    // Le texte de remplacement peut demander plus de place : on le garde court avant réutilisation.
    gabarit.elements.forEach(e=>{if(e.texte)e.texte='Texte';});
    const id=createHash('sha256').update(JSON.stringify(gabarit)).digest('hex');
    fs.mkdirSync(dossier,{recursive:true});
    try{fs.writeFileSync(path.join(dossier,`${id}.json`),JSON.stringify({version:1,id,gabarit},null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
    ids.push(id);
  }
  return [...new Set(ids)];
}

function lireBanque(dossier,titre,maximum=3) {
  if(!dossier || !fs.existsSync(dossier))return [];
  const files=fs.readdirSync(dossier).filter(f=>/^[a-f0-9]{64}\.json$/.test(f));
  files.sort((a,b)=>createHash('sha256').update(titre+a).digest('hex').localeCompare(createHash('sha256').update(titre+b).digest('hex')));
  const out=[];
  for(const f of files){
    if(out.length>=maximum)break;
    try{
      const p=path.join(dossier,f);if(fs.statSync(p).size>50000)continue;
      const record=JSON.parse(fs.readFileSync(p,'utf8'));
      if(record.id!==f.slice(0,-5) || !record.gabarit || validerComposition(record.gabarit).length)continue;
      // Ne restituer que le squelette, même si un fichier a été édité manuellement.
      const template=gabaritComposition(record.gabarit);template.elements.forEach(e=>{if(e.texte)e.texte='Texte';});
      out.push(template);
    }catch{}
  }
  return out;
}

module.exports={extremitesLien,MOUVEMENTS,STYLES,FORTS,normaliserComposition,validerComposition,faitsComposition,choisirStyle,styleScene,reglesComposition,dessinerComposition,enregistrerBanque,lireBanque};
