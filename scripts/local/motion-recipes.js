/** Compositions locales originales, inspirées des références des skills, sans code web exécuté à l'exécution. */
const { createHash } = require('node:crypto');
const { validerComposition, FORTS } = require('./motion-composition');

const RECETTES = [
  { id: 'word-stack', type: 'titre', famille: 'typographie', source: 'kinetic-headline', nom: 'Mots en cascade' },
  { id: 'underline-reveal', type: 'titre', famille: 'trace', source: 'kinetic-headline', nom: 'Titre et trait dessiné' },
  { id: 'radial-gauge', type: 'compteur', famille: 'radial', source: 'count-up', nom: 'Jauge circulaire', eligible: v => { const n = nombre(v.valeur); const base = nombre(v.sur ?? (v.unite === '%' ? 100 : null)); return base > 0 && n >= 0 && n <= base; } },
  { id: 'stat-panel', type: 'compteur', famille: 'panneau', source: 'count-up', nom: 'Carte de donnée à valeur fixe' },
  { id: 'column-rise', type: 'barres', famille: 'colonnes', source: 'stagger-list', nom: 'Colonnes verticales', eligible: v => (v.donnees || []).every(d => nombre(d.valeur) >= 0) },
  { id: 'lollipop-chart', type: 'barres', famille: 'points', source: 'stagger-list', nom: 'Graphique à tiges et points' },
  { id: 'split-panels', type: 'comparaison', famille: 'volets', source: 'fade-in-up', nom: 'Comparaison en volets' },
  { id: 'stacked-cards', type: 'comparaison', famille: 'cartes', source: 'stagger-list', nom: 'Comparaison en cartes verticales' },
  { id: 'connected-timeline', type: 'etapes', famille: 'frise', source: 'stagger-list', nom: 'Frise reliée' },
  { id: 'staircase', type: 'etapes', famille: 'escalier', source: 'stagger-list', nom: 'Étapes en escalier' },
  { id: 'quote-panel', type: 'citation', famille: 'citation', source: 'fade-in-up', nom: 'Citation sur papier' },
  { id: 'quote-spotlight', type: 'citation', famille: 'focus', source: 'kinetic-headline', nom: 'Citation et filet lumineux' },
];

function nombre(v) { return v == null || v === '' ? NaN : Number(String(v).replace(',', '.')); }
function typeScene(s) { return ['appel', 'sources'].includes(s.planRef) ? s.planRef : s.visuel?.type || 'titre'; }

/** Le contenu et la durée filtrent avant le souhait du modèle ; le hachage départage sans hasard ni état global. */
function choisirMotions(scenes, fenetres, titre = '') {
  const usages = new Map();
  let precedent = null;
  let emphaseUtilisee = false;
  return scenes.map((s, i) => {
    const type = typeScene(s);
    if (['appel', 'sources'].includes(type)) return { design: 'reserved', famille: 'sortie', raison: 'Adresse et sources : composition stable.' };
    const duree = Number(fenetres[i]?.duree || 0);
    if(type === 'composition' && !validerComposition(s.visuel).length) {
      const minimum=s.planCourt?1:2;
      const fort = s.visuel.elements.some(e => FORTS.has(e.mouvement));
      const emphase = fort && !emphaseUtilisee && duree >= minimum;
      if(emphase)emphaseUtilisee = true;
      return {design: duree >= minimum ? 'composition' : 'static', famille:'composition-originale', emphase, raison:'Dessin créé pour le contenu, sans gabarit préenregistré.', intention:s.visuel.intention};
    }
    const elements = type === 'etapes' ? s.visuel?.etapes?.length || 0 : type === 'barres' ? s.visuel?.donnees?.length || 0 : 0;
    const minimum = elements ? 1.95 + elements * 0.18 : 2;
    const candidats = RECETTES.filter(r => r.type === type && duree >= minimum && (!r.eligible || r.eligible(s.visuel || {})));
    if (!candidats.length) return { design: 'static', famille: 'repos', raison: 'Scène courte ou contenu hors contraintes : valeur finale sans effet.' };
    const proposition = s.motion?.recette;
    const empreinte = `${titre}|${s.text || ''}|${JSON.stringify(s.visuel || {})}`;
    const score = r => (r.id === precedent ? -100 : 0) - (usages.get(r.id) || 0) * 8 +
      (r.id === proposition ? 4 : 0) + (r.id === 'radial-gauge' ? 3 : 0) +
      parseInt(createHash('sha256').update(empreinte + r.id).digest('hex').slice(0, 6), 16) / 0xffffff;
    candidats.sort((a, b) => score(b) - score(a));
    const r = candidats[0];
    precedent = r.id;
    usages.set(r.id, (usages.get(r.id) || 0) + 1);
    return { design: r.id, famille: r.famille, nom: r.nom, source_recette: r.source,
      raison: `${r.nom} : compatible avec ${type}${r.id === proposition ? ', proposition du script retenue' : ''} ; durée ${duree.toFixed(2)} s, répétitions pénalisées.`,
      implementation: 'scripts/local/motion-recipes.js (composition locale)' };
  });
}

function consignesRecettes() {
  return '\nCOMPOSITIONS EXÉCUTABLES :\n' + RECETTES.map(r => `- ${r.type} : ${r.id} — ${r.nom}`).join('\n') +
    '\nTu peux proposer "motion": {"recette": "identifiant"} dans chaque scène. Choisis selon le sens, varie les compositions. Le rendu vérifie la compatibilité et peut remplacer ce choix. radial-gauge exige une proportion avec "sur" ou "%" ; column-rise exige des données non négatives. Aucun nouvel objet, chiffre ou fait pour remplir une composition.';
}

/** Génère le dessin ET ses mouvements. Les textes sont échappés ; les identifiants viennent uniquement du registre. */
function dessinerMotion(scene, c, { echapper: esc, nombreFr: fmt, tempsDuNombre }) {
  const r = RECETTES.find(r => r.id === c.motion?.design && r.type === typeScene(scene));
  if (!r || (r.eligible && !r.eligible(scene.visuel || {}))) return null;
  const id = c.id;
  const v = scene.visuel || {};
  const D = c.duree;
  const base = `#${id}-dessin {position:absolute;left:40px;top:660px;width:900px;height:600px;}
    #${id}-dessin svg {overflow:visible;} .${id}-exact {font-variant-numeric:tabular-nums;}`;
  let corps = '', css = base, js = '', titreHtml = null, titreCss = '', titreAnime = false;
  const entrer = (sel, i = 0, axis = 'y', distance = 24, at = null) => {
    const start = at == null ? 0.25 + i * 0.18 : Math.max(0, Math.min(D - 0.65, at));
    return `tl.fromTo(${JSON.stringify(sel)}, {opacity:0,${axis}:${distance}}, {opacity:1,${axis}:0,duration:0.42,ease:easeMotion}, ${start.toFixed(3)});`;
  };
  const svg = content => `<svg width="900" height="600" viewBox="0 0 900 600" aria-hidden="true">${content}</svg>`;
  const nombreDit = (value, defaut) => Math.max(0.15, Math.min(D-1.2, tempsDuNombre(c.mots, value, c.debut, defaut)));
  const animation = [];
  const envelopper = content => `<div id="${id}-dessin">${content}</div>`;

  switch (r.id) {
    case 'word-stack': {
      const mots = String(scene.text || '').trim().split(/\s+/);
      const taille = Math.max(40, Math.min(mots.length > 4 ? 84 : 110, Math.floor(850 / (Math.max(...mots.map(m => m.length), 1) * 0.62))));
      titreHtml = mots.map((mot, i) => `<span class="${id}-mot" id="${id}-mot${i}">${esc(mot)}</span>`).join(' ');
      titreCss = `#${id}-titre {top:610px;font-size:${taille}px;line-height:1.08;} .${id}-mot {display:block;overflow-wrap:anywhere;} .${id}-mot:last-child {color:var(--accent-vif);}`;
      mots.forEach((_, i) => animation.push(`tl.fromTo("#${id}-mot${i}",{opacity:${c.premier ? 1 : 0.4},x:-24},{opacity:1,x:0,duration:0.42,ease:easeMotion},${(0.1 + i * 0.07).toFixed(2)});`));
      titreAnime = true;
      break;
    }
    case 'underline-reveal':
      titreHtml = `${esc(scene.text)}<span id="${id}-trace"></span>`;
      titreCss = `#${id}-titre {top:620px;font-size:${String(scene.text || '').length>45?80:106}px;max-width:850px;overflow-wrap:anywhere;} #${id}-trace {position:absolute;left:0;bottom:-28px;width:85%;height:10px;border-radius:8px;background:var(--accent-vif);transform-origin:0 50%;}`;
      animation.push(`tl.fromTo("#${id}-trace",{scaleX:0},{scaleX:1,duration:0.7,ease:easeMotion},0.3);`);
      break;
    case 'radial-gauge': {
      const value = nombre(v.valeur), total = nombre(v.sur ?? 100);
      const ratio = value / total;
      const circonference = 2 * Math.PI * 210;
      corps = envelopper(svg(`<circle cx="450" cy="245" r="210" fill="none" stroke="var(--encre-2)" stroke-opacity="0.18" stroke-width="26"/>
        <circle id="${id}-arc" cx="450" cy="245" r="210" fill="none" stroke="var(--accent-vif)" stroke-width="26" stroke-linecap="round" stroke-dasharray="${circonference} ${circonference}" stroke-dashoffset="${circonference}" transform="rotate(-90 450 245)"/>
        <text x="450" y="255" text-anchor="middle" fill="var(--encre)" font-size="130" font-weight="900">${fmt(value)}</text>
        <text x="450" y="315" text-anchor="middle" fill="var(--encre-2)" font-size="38">${esc(v.sur != null && nombre(v.sur) !== 100 ? '/ ' + fmt(v.sur) : v.unite || (v.sur != null ? '/ ' + fmt(v.sur) : ''))}</text>`)
        + `<div id="${id}-libelle">${esc(v.libelle)}</div>`);
      css += `#${id}-libelle {position:absolute;top:495px;width:900px;text-align:center;font:700 42px Roboto;}`;
      const t = tempsDuNombre(c.mots, v.valeur, c.debut, 0.35);
      animation.push(`tl.fromTo("#${id}-arc",{strokeDashoffset:${circonference}},{strokeDashoffset:${circonference*(1-ratio)},duration:0.65,ease:easeMotion},${Math.max(0.2, Math.min(D-1.2, t)).toFixed(3)});`);
      break;
    }
    case 'stat-panel':
      corps = envelopper(`<div id="${id}-stat"><div id="${id}-stat-chiffre" class="${id}-exact">${fmt(v.valeur)}<span>${esc(v.unite || '')}</span></div>
        ${v.sur != null ? `<div id="${id}-base">sur ${fmt(v.sur)}</div>` : ''}<div id="${id}-libelle">${esc(v.libelle)}</div><div id="${id}-filet"></div></div>`);
      css += `#${id}-stat {position:relative;top:35px;width:900px;padding:48px;border-radius:30px;background:var(--papier);color:var(--nuit);border-left:14px solid var(--accent-vif);}
        #${id}-stat-chiffre {font:900 160px Roboto;line-height:1.1;} #${id}-stat-chiffre span {font-size:64px;margin-left:14px;color:var(--accent);}
        #${id}-base {font:700 40px Roboto;color:var(--muet);} #${id}-libelle {margin-top:28px;font:700 42px Roboto;line-height:1.2;}
        #${id}-filet {margin-top:30px;height:8px;background:var(--accent);transform-origin:0 50%;}`;
      animation.push(entrer(`#${id}-stat`, 0, 'x', 36), `tl.fromTo("#${id}-filet",{scaleX:0},{scaleX:1,duration:0.65,ease:easeMotion},0.45);`);
      break;
    case 'column-rise': {
      const n = v.donnees.length, maximum = Math.max(1, ...v.donnees.map(d => nombre(d.valeur)));
      const step = 880 / n;
      corps = envelopper(v.donnees.map((d, i) => {
        const height = Math.max(0, nombre(d.valeur) / maximum * 350);
        const x = 10 + i * step;
        animation.push(`tl.fromTo("#${id}-col${i}",{scaleY:0},{scaleY:1,duration:0.6,ease:easeMotion},${nombreDit(d.valeur, 0.35+i*0.16).toFixed(2)});`);
        return `<div class="${id}-colonne" style="left:${x}px;width:${step-25}px"><div class="${id}-valeur">${fmt(d.valeur)}${esc(v.unite || '')}</div><div id="${id}-col${i}" class="${id}-col" style="height:${height}px"></div><div class="${id}-nom">${esc(d.libelle)}</div></div>`;
      }).join(''));
      css += `.${id}-colonne {position:absolute;top:0;height:570px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:18px;}
        .${id}-col {width:72%;border-radius:18px 18px 0 0;background:var(--accent-vif);transform-origin:50% 100%;}
        .${id}-valeur {font:900 50px Roboto;white-space:nowrap;} .${id}-nom {font:700 34px Roboto;min-height:86px;text-align:center;line-height:1.15;}`;
      break;
    }
    case 'lollipop-chart': {
      const values = v.donnees.map(d => nombre(d.valeur));
      const lo = Math.min(0, ...values), hi = Math.max(0, ...values), span = hi-lo || 1;
      const x = value => 320 + ((value-lo)/span)*390;
      corps = envelopper(svg(v.donnees.map((d, i) => {
        const y = 65+i*140;
        animation.push(`tl.fromTo("#${id}-stem${i}",{scaleX:0},{scaleX:1,duration:0.55,ease:easeMotion},${nombreDit(d.valeur, 0.3+i*0.18).toFixed(2)});`, entrer(`#${id}-dot${i}`, i, 'y', 24, nombreDit(d.valeur, 0.3+i*0.18)));
        return `<foreignObject x="0" y="${y-50}" width="275" height="125"><div xmlns="http://www.w3.org/1999/xhtml" style="height:100%;display:flex;align-items:center;color:var(--encre);font:700 34px Roboto;line-height:1.15;overflow-wrap:anywhere;">${esc(d.libelle)}</div></foreignObject><line id="${id}-stem${i}" x1="${x(0)}" x2="${x(nombre(d.valeur))}" y1="${y}" y2="${y}" stroke="var(--accent-vif)" stroke-width="10" style="transform-origin:${x(0)}px ${y}px"/>
          <circle id="${id}-dot${i}" cx="${x(nombre(d.valeur))}" cy="${y}" r="18" fill="var(--accent-vif)"/><text x="890" y="${y+12}" text-anchor="end" fill="var(--encre)" font-size="36" font-weight="900">${fmt(d.valeur)}${esc(v.unite || '')}</text>`;
      }).join('')));
      break;
    }
    case 'split-panels':
    case 'stacked-cards': {
      const stacked = r.id === 'stacked-cards';
      corps = envelopper(['gauche','droite'].map((side, i) => {
        animation.push(entrer(`#${id}-p${i}`, i*2, stacked ? 'y' : 'x', stacked ? 32 : i ? 36 : -36));
        return `<div id="${id}-p${i}" class="${id}-panneau"><div class="${id}-pt">${esc(v[side].titre)}</div><div class="${id}-px">${esc(v[side].texte)}</div></div>`;
      }).join(''));
      css += `.${id}-panneau {position:absolute;box-sizing:border-box;padding:36px;border-radius:26px;border:2px solid var(--encre-2);background:var(--fond-c);}
        #${id}-p0 {left:0;top:0;${stacked?'width:900px;min-height:230px;':'width:430px;min-height:490px;'}}
        #${id}-p1 {${stacked?'left:0;top:275px;width:900px;min-height:230px;':'left:470px;top:0;width:430px;min-height:490px;'}background:var(--papier);color:var(--nuit);border-color:var(--accent-vif);}
        .${id}-pt {font:900 46px Roboto;margin-bottom:22px;} .${id}-px {font:700 40px Roboto;line-height:1.23;}`;
      break;
    }
    case 'connected-timeline':
    case 'staircase': {
      const timeline = r.id === 'connected-timeline';
      corps = envelopper((timeline ? `<div id="${id}-rail"></div>` : '') + v.etapes.map((text, i) => {
        animation.push(entrer(`#${id}-step${i}`, i, 'x', timeline ? 24 : -32));
        return `<div class="${id}-step" id="${id}-step${i}" style="top:${i*140}px;left:${timeline?0:i*32}px;width:${timeline?900:900-i*32}px"><span class="${id}-badge">${i+1}</span><span>${esc(text)}</span></div>`;
      }).join(''));
      css += `#${id}-rail {position:absolute;left:35px;top:34px;width:5px;height:${(v.etapes.length-1)*140}px;background:var(--accent-vif);transform-origin:50% 0;}
        .${id}-step {position:absolute;min-height:112px;display:flex;align-items:center;gap:24px;padding:22px 26px;border-radius:20px;background:var(--fond-c);border:${timeline?'0':'2px solid var(--encre-2)'};font:700 40px Roboto;line-height:1.2;}
        .${id}-badge {flex:none;display:flex;align-items:center;justify-content:center;width:66px;height:66px;border-radius:${timeline?'50%':'16px'};background:var(--accent-vif);color:var(--nuit);font:900 36px Roboto;}`;
      if (timeline) animation.push(`tl.fromTo("#${id}-rail",{scaleY:0},{scaleY:1,duration:0.8,ease:easeMotion},0.2);`);
      break;
    }
    case 'quote-panel':
    case 'quote-spotlight': {
      const paper = r.id === 'quote-panel';
      corps = envelopper(`<div id="${id}-quote"><div id="${id}-quote-text">« ${esc(v.texte)} »</div><div id="${id}-quote-author">— ${esc(v.auteur)}</div><div id="${id}-quote-line"></div></div>`);
      css += `#${id}-quote {position:relative;padding:48px 42px;border-radius:28px;${paper?'background:var(--papier);color:var(--nuit);border-top:12px solid var(--accent-vif);':'border-left:8px solid var(--accent-vif);background:linear-gradient(100deg,rgba(79,179,217,0.12),transparent);'}}
        #${id}-quote-text {font:700 ${String(v.texte).split(/\s+/).length>18?48:58}px Roboto;line-height:1.23;} #${id}-quote-author {margin-top:32px;font:700 34px Roboto;color:${paper?'var(--muet)':'var(--encre-2)'};}
        #${id}-quote-line {height:6px;width:70%;background:var(--accent-vif);margin-top:26px;transform-origin:0 50%;}`;
      animation.push(entrer(`#${id}-quote`, 0, paper?'y':'x', 24), `tl.fromTo("#${id}-quote-line",{scaleX:0},{scaleX:1,duration:0.7,ease:easeMotion},0.4);`);
      break;
    }
  }
  js = animation.join('\n');
  return { corps: `<!-- design: ${r.id} -->${corps}`, css, js, titreHtml, titreCss, titreAnime };
}

module.exports = { RECETTES, choisirMotions, consignesRecettes, dessinerMotion };
