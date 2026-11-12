/**
 * Texte à l'écran des slides (12 nov. 2026).
 *
 * Avant, createImageWithText n'écrivait aucun texte : seuls les sous-titres apparaissaient.
 * Le gabarit éditorial veut le texte de chaque scène affiché (6 mots au maximum), l'adresse du blog
 * affichée sur la scène appel, la source affichée quand un chiffre apparaît, et les sources reprises à la fin.
 *
 * Image 1080 × 1080 : texte de scène en haut (y 60–400), sous-titres brûlés vers y 780 par le rendu,
 * source en bas (y ≈ 1010). Le texte passe par des fichiers (textfile) : ni échappement ni « % » interprété.
 */
const fs = require('fs');
const path = require('path');

const FFMPEG = '/usr/local/Caskroom/mambaforge/base/bin/ffmpeg';
const POLICE = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const POLICE_FINE = '/System/Library/Fonts/Supplemental/Arial.ttf';
const COULEURS = { hook: '#FF3366', stat: '#00D9FF', visual: '#7B68EE', quote: '#FFB800', split: '#00C896', cta: '#FF3366' };
const ADRESSE = '#FFD84D';

/**
 * Coupe aux espaces en lignes de `max` caractères au plus (un mot plus long reste entier).
 * « : ; ! ? » restent collés au mot d'avant et « « » au mot d'après : jamais seuls en début ou fin de ligne.
 */
function couperLignes(texte, max) {
  const blocs = [];
  let ouvrant = '';
  for (const t of String(texte || '').trim().split(/\s+/).filter(Boolean)) {
    if (t === '«') { ouvrant += `${t} `; continue; }
    if (/^[:;!?»–—]+$/.test(t) && blocs.length && !ouvrant) { blocs[blocs.length - 1] += ` ${t}`; continue; }
    blocs.push(ouvrant + t);
    ouvrant = '';
  }
  if (ouvrant) blocs.push(ouvrant.trim());
  const lignes = [];
  for (const mot of blocs) {
    const der = lignes[lignes.length - 1];
    if (der !== undefined && `${der} ${mot}`.length <= max) lignes[lignes.length - 1] = `${der} ${mot}`;
    else lignes.push(mot);
  }
  return lignes;
}

function bloc(texte, { max, taille, y, couleur = 'white', gras = true, interligne = 1.22 }) {
  return couperLignes(texte, max).map((t, i) => ({ texte: t, taille, y: Math.round(y + i * taille * interligne), couleur, gras }));
}

/**
 * Les lignes à écrire sur la slide d'une scène : [{texte, taille, y, couleur, gras}], centrées en x.
 * Champs lus : text, source (scène avec un chiffre), adresse (scène appel), sourcesEcran (scène sources).
 */
function calquesTexte(scene) {
  if (scene.planRef === 'sources' && Array.isArray(scene.sourcesEcran) && scene.sourcesEcran.length) {
    const calques = bloc('Sources de la vidéo', { max: 30, taille: 52, y: 70, couleur: ADRESSE });
    let y = 170;
    for (const s of scene.sourcesEcran.slice(0, 3)) {
      const titre = bloc(`« ${s.titre} »`, { max: 38, taille: 40, y });
      y += titre.length * 49 + 6;
      const auteur = bloc(s.auteur, { max: 46, taille: 32, y, couleur: '#DDDDDD', gras: false });
      y += auteur.length * 39 + 34;
      calques.push(...titre, ...auteur);
    }
    return calques;
  }
  const calques = bloc(scene.text, { max: 22, taille: 68, y: 70 });
  if (scene.adresse) {
    const y = calques.length ? calques[calques.length - 1].y + 120 : 70;
    calques.push(...bloc(scene.adresse, { max: 30, taille: 62, y, couleur: ADRESSE }));
  }
  if (String(scene.source || '').trim()) {
    const lignes = bloc(`Source : ${scene.source}`, { max: 58, taille: 30, y: 0, gras: false });
    lignes.forEach((l, i) => { l.y = 1040 - (lignes.length - i) * 37; });
    calques.push(...lignes);
  }
  return calques;
}

/**
 * Arguments ffmpeg (sans shell) d'une slide 1080 × 1080 : image ou fond de couleur, puis le texte.
 * Écrit un fichier texte par ligne dans `dossier`.
 */
function argumentsSlide(imagePath, scene, sortie, dossier) {
  const entree = imagePath
    ? ['-i', imagePath]
    : ['-f', 'lavfi', '-i', `color=c=${COULEURS[scene.visualType] || '#222222'}:s=1080x1080:d=0.1`];
  const base = path.basename(sortie, path.extname(sortie));
  const filtres = ['scale=1080:1080:force_original_aspect_ratio=increase', 'crop=1080:1080'];
  calquesTexte(scene).forEach((c, i) => {
    const fichier = path.join(dossier, `${base}_texte_${i}.txt`);
    fs.writeFileSync(fichier, c.texte);
    const q = (v) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")}'`;
    filtres.push(`drawtext=fontfile=${q(c.gras ? POLICE : POLICE_FINE)}:textfile=${q(fichier)}:expansion=none`
      + `:fontsize=${c.taille}:fontcolor=${c.couleur}:box=1:boxcolor=black@0.62:boxborderw=12`
      + `:x=(w-text_w)/2:y=${c.y}`);
  });
  return ['-y', '-loglevel', 'error', ...entree, '-vf', filtres.join(','), '-update', '1', '-frames:v', '1', sortie];
}

module.exports = { calquesTexte, couperLignes, argumentsSlide, FFMPEG };
