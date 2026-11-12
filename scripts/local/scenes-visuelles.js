/**
 * Scènes Hyperframes écrites en code (12 nov. 2026) : aucune image générée, aucun service payant.
 *
 * Chaque scène du script porte un "visuel" pris dans un catalogue fermé ; ce module écrit le HTML et la
 * timeline GSAP de la scène. Format vertical 1080 × 1920 :
 *   sous-titres y ≈ 180 · étiquette y 340 · texte à l'écran y 400–620 · visuel y 660–1260
 *   source x 40–520, y 1310–1600 · avatar x 540–920, y 1303–1610 (en bas à droite, au-dessus des boutons du réseau)
 */

const TYPES_VISUELS = ['titre', 'compteur', 'barres', 'comparaison', 'etapes', 'citation'];

function echapper(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 87.7 → « 87,7 » ; 51 → « 51 » */
function nombreFr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return echapper(v);
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

function nombreDe(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Tous les nombres présents dans un visuel (pour vérifier qu'ils viennent du plan). */
function nombresDuVisuel(v) {
  const out = [];
  const voir = (x) => {
    if (x == null) return;
    if (typeof x === 'number') out.push(x);
    else if (typeof x === 'string') (x.match(/\d+(?:[.,]\d+)?/g) || []).forEach((m) => out.push(parseFloat(m.replace(',', '.'))));
    else if (Array.isArray(x)) x.forEach(voir);
    else if (typeof x === 'object') Object.values(x).forEach(voir);
  };
  voir(v);
  return out;
}

const mots = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Vérifie le visuel d'une scène. Les nombres doivent figurer dans le plan (aucun chiffre inventé).
 * @returns {string[]} erreurs
 */
function validerVisuel(v, ou, textePlan) {
  const e = [];
  if (!v || typeof v !== 'object') return [`${ou} : visuel manquant`];
  if (!TYPES_VISUELS.includes(v.type)) return [`${ou} : type de visuel inconnu « ${v.type} » (${TYPES_VISUELS.join(', ')})`];
  const plan = String(textePlan || '').replace(/(\d)\s+(\d{3})/g, '$1$2');
  const presents = (plan.match(/\d+(?:[.,]\d+)?/g) || []).map((m) => parseFloat(m.replace(',', '.')));
  // Petits nombres écrits en lettres dans le plan (« un seul robot » → 1)
  const LETTRES = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'];
  const bas = plan.toLowerCase();
  LETTRES.forEach((m, i) => { if (new RegExp(`(^|[^a-zà-ÿ])${m}e?s?([^a-zà-ÿ]|$)`).test(bas)) presents.push(i + 1); });
  // 100 (base d'un pourcentage) et 0 ne sont pas des faits : toujours permis
  for (const n of nombresDuVisuel(v).filter((x) => x !== 100 && x !== 0)) {
    if (!presents.some((p) => Math.abs(p - n) < 0.051 || Math.abs(Math.round(p) - n) < 0.001)) e.push(`${ou} : le nombre ${n} du visuel n'est pas dans le plan`);
  }
  if (v.type === 'compteur') {
    if (nombreDe(v.valeur) == null) e.push(`${ou} : compteur sans valeur`);
    if (v.sur != null && nombreDe(v.sur) == null) e.push(`${ou} : compteur « sur » invalide`);
    if (!String(v.libelle || '').trim() || mots(v.libelle) > 8) e.push(`${ou} : compteur : libellé de 1 à 8 mots attendu`);
  }
  if (v.type === 'barres') {
    const d = Array.isArray(v.donnees) ? v.donnees : [];
    if (d.length < 2 || d.length > 4) e.push(`${ou} : barres : 2 à 4 données attendues`);
    d.forEach((x, i) => {
      if (nombreDe(x && x.valeur) == null) e.push(`${ou} : barre ${i + 1} sans valeur`);
      if (!String((x && x.libelle) || '').trim() || mots(x.libelle) > 4) e.push(`${ou} : barre ${i + 1} : libellé de 1 à 4 mots`);
    });
  }
  if (v.type === 'comparaison') {
    for (const c of ['gauche', 'droite']) {
      const x = v[c] || {};
      if (!String(x.titre || '').trim() || mots(x.titre) > 4) e.push(`${ou} : comparaison ${c} : titre de 1 à 4 mots`);
      if (!String(x.texte || '').trim() || mots(x.texte) > 10) e.push(`${ou} : comparaison ${c} : texte de 1 à 10 mots`);
    }
  }
  if (v.type === 'etapes') {
    const d = Array.isArray(v.etapes) ? v.etapes : [];
    if (d.length < 2 || d.length > 4) e.push(`${ou} : étapes : 2 à 4 attendues`);
    d.forEach((x, i) => { if (!String(x || '').trim() || mots(x) > 7) e.push(`${ou} : étape ${i + 1} : 1 à 7 mots`); });
  }
  if (v.type === 'citation') {
    if (!String(v.texte || '').trim() || mots(v.texte) > 25) e.push(`${ou} : citation de 1 à 25 mots attendue`);
    if (!String(v.auteur || '').trim()) e.push(`${ou} : citation sans auteur`);
  }
  return e;
}

/** Temps (dans la scène) du premier mot dit qui contient ce nombre ; sinon `defaut`. */
function tempsDuNombre(motsScene, valeur, debutScene, defaut) {
  const n = nombreDe(valeur);
  if (n == null) return defaut;
  const formes = [String(n), String(n).replace('.', ','), String(Math.round(n))];
  const m = (motsScene || []).find((w) => formes.some((f) => w.mot.replace(/[^\d,.]/g, '').replace(/[.,]$/, '') === f));
  return m ? Math.max(0.2, m.debut - debutScene - 0.1) : defaut;
}

function etiquette(scene, nbSousIdees) {
  const ref = scene.planRef || '';
  if (ref === 'idee_principale') return "L'ESSENTIEL";
  if (ref.startsWith('developpement.')) return `${ref.split('.')[1]} / ${nbSousIdees}`;
  if (ref.startsWith('nuance.')) return 'À NUANCER';
  if (ref === 'conclusion') return "CONCLUSION DE L'ARTICLE";
  return '';
}

function htmlVisuel(id, v) {
  switch (v.type) {
    case 'compteur': {
      const pct = v.sur ? Math.max(0, Math.min(1, nombreDe(v.valeur) / nombreDe(v.sur))) : null;
      return `<div id="${id}-cpt"><span id="${id}-val" class="gros">0</span>${v.unite ? `<span class="${id}-unite">${echapper(v.unite)}</span>` : ''}${v.sur ? `<span class="${id}-sur">/ ${nombreFr(v.sur)}</span>` : ''}</div>
        ${pct != null ? `<div id="${id}-jauge"><div id="${id}-plein" style="width:${(pct * 100).toFixed(1)}%"></div></div>` : ''}
        <div id="${id}-lib">${echapper(v.libelle)}</div>`;
    }
    case 'barres': {
      const max = Math.max(...v.donnees.map((d) => nombreDe(d.valeur)));
      return v.donnees.map((d, i) => `<div class="${id}-ligne" id="${id}-l${i}"><div class="${id}-lib">${echapper(d.libelle)}</div>
        <div class="${id}-piste"><div class="${id}-barre${nombreDe(d.valeur) === max ? ' fort' : ''}" id="${id}-b${i}" style="width:${Math.max(4, (nombreDe(d.valeur) / max) * 100).toFixed(1)}%"></div>
        <div class="${id}-chiffre">${nombreFr(d.valeur)}${v.unite ? ` ${echapper(v.unite)}` : ''}</div></div></div>`).join('\n');
    }
    case 'comparaison':
      return ['gauche', 'droite'].map((c) => `<div class="${id}-carte ${c}" id="${id}-${c}"><div class="${id}-ct">${echapper(v[c].titre)}</div><div class="${id}-cx">${echapper(v[c].texte)}</div></div>`).join('\n')
        + `<div id="${id}-fleche">→</div>`;
    case 'etapes':
      return v.etapes.map((x, i) => `<div class="${id}-etape" id="${id}-e${i}"><div class="${id}-num">${i + 1}</div><div>${echapper(x)}</div></div>`).join('\n');
    case 'citation':
      return `<div id="${id}-guill">«</div><div id="${id}-cit">${echapper(v.texte)}</div><div id="${id}-aut">— ${echapper(v.auteur)}</div>`;
    default:
      return '';
  }
}

function cssVisuel(id, v) {
  switch (v.type) {
    case 'compteur': return `
      #${id}-cpt { position: absolute; left: 40px; top: 660px; width: 900px; display: flex; align-items: baseline; gap: 18px; }
      #${id}-val { font-size: 250px; color: var(--accent-vif); text-shadow: var(--lueur); }
      .${id}-unite { font: 900 120px Roboto, sans-serif; color: var(--accent-vif); }
      .${id}-sur { font: 900 110px Roboto, sans-serif; color: var(--encre-2); }
      #${id}-jauge { position: absolute; left: 40px; top: 960px; width: 900px; height: 34px; border-radius: 17px; background: rgba(255,255,255,0.12); overflow: hidden; }
      #${id}-plein { height: 100%; border-radius: 17px; background: var(--alerte); transform-origin: 0 50%; }
      #${id}-lib { position: absolute; left: 40px; top: 1030px; width: 900px; font: 700 50px Roboto, sans-serif; line-height: 1.15; color: var(--encre); }`;
    case 'barres': return `
      .${id}-ligne { position: absolute; left: 40px; width: 900px; }
      ${v.donnees.map((_, i) => `#${id}-l${i} { top: ${660 + i * 150}px; }`).join(' ')}
      .${id}-lib { font: 700 40px Roboto, sans-serif; color: var(--encre-2); margin-bottom: 10px; white-space: nowrap; }
      .${id}-piste { position: relative; height: 70px; width: 720px; }
      .${id}-barre { height: 70px; border-radius: 14px; background: var(--accent-vif); transform-origin: 0 50%; }
      .${id}-barre.fort { background: var(--alerte); box-shadow: 0 0 30px rgba(255,107,87,0.55); }
      .${id}-chiffre { position: absolute; left: 740px; top: 6px; font: 900 56px Roboto, sans-serif; white-space: nowrap; font-variant-numeric: tabular-nums; }`;
    case 'comparaison': return `
      .${id}-carte { position: absolute; top: 680px; width: 400px; min-height: 420px; padding: 34px 30px; border-radius: 28px; }
      .${id}-carte.gauche { left: 40px; background: rgba(10,26,43,0.92); border: 3px solid rgba(185,199,214,0.35); }
      .${id}-carte.droite { left: 540px; background: var(--papier); color: var(--nuit); border: 3px solid var(--alerte); box-shadow: 0 0 40px rgba(255,107,87,0.45); }
      .${id}-ct { font: 900 46px Roboto, sans-serif; line-height: 1.1; margin-bottom: 22px; }
      .${id}-carte.droite .${id}-ct { color: #c23a26; }
      .${id}-cx { font: 700 40px Roboto, sans-serif; line-height: 1.22; }
      #${id}-fleche { position: absolute; left: 452px; top: 830px; font: 900 80px Roboto, sans-serif; color: var(--prudence); }`;
    case 'etapes': return `
      .${id}-etape { position: absolute; left: 40px; width: 900px; display: flex; align-items: center; gap: 26px; padding: 22px 28px; border-radius: 22px;
        background: rgba(10,26,43,0.92); border: 2px solid rgba(185,199,214,0.35); font: 700 42px Roboto, sans-serif; line-height: 1.15; }
      ${v.etapes.map((_, i) => `#${id}-e${i} { top: ${660 + i * 150}px; }`).join(' ')}
      .${id}-num { flex: none; width: 68px; height: 68px; border-radius: 50%; background: var(--accent-vif); color: #06202f; display: flex; align-items: center; justify-content: center; font: 900 40px Roboto, sans-serif; }`;
    case 'citation': return `
      #${id}-guill { position: absolute; left: 30px; top: 610px; font: 900 220px Roboto, sans-serif; color: var(--accent-vif); opacity: 0.6; line-height: 1; }
      #${id}-cit { position: absolute; left: 80px; top: 720px; width: 840px; font: 700 54px Roboto, sans-serif; line-height: 1.25; }
      #${id}-aut { position: absolute; left: 80px; top: 1180px; width: 840px; font: 700 36px Roboto, sans-serif; color: var(--encre-2); }`;
    default: return '';
  }
}

function jsVisuel(id, v, scene, motsScene, debutScene, D) {
  const l = [];
  switch (v.type) {
    case 'compteur': {
      const t = tempsDuNombre(motsScene, v.valeur, debutScene, 0.5);
      const n = nombreDe(v.valeur);
      const decimales = Number.isInteger(n) ? 0 : 1;
      l.push(`const cpt = { v: 0 }; const val = document.getElementById("${id}-val");`,
        `tl.to(cpt, { v: ${n}, duration: 1.1, ease: "power2.out", onUpdate: () => { val.textContent = cpt.v.toFixed(${decimales}).replace(".", ","); } }, ${t.toFixed(2)});`,
        `tl.set(val, { textContent: "${nombreFr(n)}" }, ${(t + 1.15).toFixed(2)});`,
        `tl.fromTo("#${id}-cpt", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, transformOrigin: "0% 100%", duration: 0.3, ease: "back.out(1.8)" }, ${Math.max(0.1, t - 0.2).toFixed(2)});`,
        `if (document.getElementById("${id}-plein")) tl.fromTo("#${id}-plein", { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: "power2.out" }, ${t.toFixed(2)});`,
        `tl.fromTo("#${id}-lib", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, ${(t + 0.4).toFixed(2)});`);
      break;
    }
    case 'barres':
      v.donnees.forEach((d, i) => {
        const t = Math.min(D - 1.2, tempsDuNombre(motsScene, d.valeur, debutScene, 0.5 + i * 0.7));
        l.push(`tl.fromTo("#${id}-l${i}", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.25 }, ${Math.max(0.1, t - 0.3).toFixed(2)});`,
          `tl.fromTo("#${id}-b${i}", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.out" }, ${t.toFixed(2)});`);
      });
      break;
    case 'comparaison':
      l.push(`tl.fromTo("#${id}-gauche", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, 0.3);`,
        `tl.fromTo("#${id}-fleche", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.25 }, ${(D * 0.4).toFixed(2)});`,
        `tl.fromTo("#${id}-droite", { opacity: 0, y: 40, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(1.6)" }, ${(D * 0.42).toFixed(2)});`);
      break;
    case 'etapes':
      v.etapes.forEach((_, i) => l.push(`tl.fromTo("#${id}-e${i}", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.28, ease: "back.out(1.6)" }, ${(0.4 + i * Math.max(0.6, (D * 0.7) / v.etapes.length)).toFixed(2)});`));
      break;
    case 'citation':
      l.push(`tl.fromTo(["#${id}-guill", "#${id}-cit"], { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.1 }, 0.3);`,
        `tl.fromTo("#${id}-aut", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.9);`);
      break;
    default:
  }
  return l.join('\n      ');
}

/**
 * HTML d'une scène (sous-composition Hyperframes).
 * @param {object} scene  scène du script (planRef, text, source, visuel, adresse, sourcesEcran)
 * @param {{id: string, duree: number, debut: number, mots: object[], nbSousIdees: number, premier?: boolean, dernier?: boolean}} c
 */
function htmlScene(scene, c) {
  const { id, duree: D } = c;
  const v = scene.planRef === 'appel' ? { type: 'appel' } : scene.planRef === 'sources' ? { type: 'sources' } : (scene.visuel || { type: 'titre' });
  const titreSeul = v.type === 'titre';
  const lab = etiquette(scene, c.nbSousIdees);
  let corps = '';
  let css = '';
  let js = '';
  if (v.type === 'appel') {
    corps = `<div id="${id}-carte"><div id="${id}-lire">L'analyse complète sur</div><div id="${id}-url">${echapper(scene.adresse || '')}</div><div id="${id}-trait"></div></div>`;
    css = `#${id}-carte { position: absolute; left: 40px; top: 700px; width: 900px; padding: 50px 50px 60px; background: var(--papier); color: var(--nuit); border-radius: 30px; box-shadow: 0 30px 90px rgba(0,0,0,0.5); }
      #${id}-lire { font: 700 38px Roboto, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muet); }
      #${id}-url { margin-top: 26px; font: 900 64px Roboto, sans-serif; color: var(--accent); white-space: nowrap; }
      #${id}-trait { margin-top: 22px; height: 8px; width: 420px; border-radius: 4px; background: var(--accent); transform-origin: 0 50%; }`;
    js = `tl.fromTo("#${id}-carte", { opacity: 0, y: 60, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(1.5)" }, 0.2);
      tl.fromTo("#${id}-trait", { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "power2.out" }, 0.6);
      tl.fromTo("#${id}-url", { scale: 1 }, { scale: 1.05, transformOrigin: "0% 50%", duration: 0.15, yoyo: true, repeat: 1, immediateRender: false }, ${Math.min(D - 0.6, 1.4).toFixed(2)});`;
  } else if (v.type === 'sources') {
    corps = `<div id="${id}-liste"><div id="${id}-t">SOURCES</div>${(scene.sourcesEcran || []).slice(0, 3).map((s, i) => `<div class="${id}-src" id="${id}-s${i}"><div class="${id}-st">« ${echapper(s.titre)} »</div><div class="${id}-sa">${echapper(s.auteur)}</div></div>`).join('')}</div>`;
    css = `#${id}-liste { position: absolute; left: 40px; top: 640px; width: 900px; }
      #${id}-t { font: 900 40px Roboto, sans-serif; letter-spacing: 0.08em; color: var(--prudence); margin-bottom: 24px; }
      .${id}-src { padding: 22px 26px; margin-bottom: 20px; border-radius: 20px; background: rgba(10,26,43,0.92); border: 2px solid rgba(185,199,214,0.35); }
      .${id}-st { font: 700 38px Roboto, sans-serif; line-height: 1.2; }
      .${id}-sa { margin-top: 8px; font: 400 32px Roboto, sans-serif; color: var(--encre-2); line-height: 1.2; }`;
    js = `tl.fromTo("#${id}-t", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0.1);
      tl.fromTo(".${id}-src", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.25 }, 0.25);`;
  } else {
    corps = htmlVisuel(id, v);
    css = cssVisuel(id, v);
    js = jsVisuel(id, v, scene, c.mots, c.debut, D);
  }
  const source = String(scene.source || '').trim();
  return `<template>
  <!-- Scène « ${echapper(scene.planRef)} » — le spectateur comprend : ${echapper(scene.comprend || '')} -->
  <style>
    #root { position: absolute; inset: 0; }
    #${id}-lab { position: absolute; left: 40px; top: 330px; }
    #${id}-titre { position: absolute; left: 40px; top: ${titreSeul ? 640 : 400}px; width: 900px; font-size: ${titreSeul ? 104 : 80}px; line-height: 1.06; white-space: normal; }
    #${id}-src { position: absolute; left: 40px; top: 1320px; width: 470px; font: 700 28px Roboto, sans-serif; line-height: 1.3; color: var(--encre-2); }
    #${id}-src b { display: block; font-weight: 900; letter-spacing: 0.08em; color: var(--accent-vif); margin-bottom: 6px; }
    ${css}
  </style>
  <div id="root" data-composition-id="${id}" data-width="1080" data-height="1920">
    <div id="${id}-scene" class="scene clip" data-start="0" data-duration="${D.toFixed(3)}" data-track-index="1">
      <div id="${id}-cam" class="camera">
        ${lab ? `<div id="${id}-lab" class="pilule p-accent">${echapper(lab)}</div>` : ''}
        <div id="${id}-titre" class="gros">${echapper(scene.text)}</div>
        ${corps}
        ${source ? `<div id="${id}-src"><b>SOURCE</b>${echapper(source)}</div>` : ''}
      </div>
    </div>
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      ${c.premier
    // Première scène : le texte est déjà là à 0 s (miniature sur les réseaux), puis un léger zoom
    ? `tl.fromTo("#${id}-titre", { scale: 1 }, { scale: 1.04, transformOrigin: "0% 50%", duration: 0.5, ease: "power2.out" }, 0.3);`
    : `tl.fromTo("#${id}-cam", { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" }, 0);
      ${lab ? `tl.fromTo("#${id}-lab", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.2 }, 0.05);` : ''}
      tl.fromTo("#${id}-titre", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, 0.1);`}
      ${source ? `tl.fromTo("#${id}-src", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.5);` : ''}
      ${js}
      ${c.dernier ? '' : `tl.to("#${id}-cam", { opacity: 0, scale: 0.96, duration: 0.2, ease: "power2.in" }, ${Math.max(0.5, D - 0.22).toFixed(2)});`}
      window.__timelines = window.__timelines || {};
      window.__timelines["${id}"] = tl;
    })();
  </script>
</template>
`;
}

module.exports = { TYPES_VISUELS, validerVisuel, nombresDuVisuel, htmlScene, echapper, nombreFr, tempsDuNombre };
