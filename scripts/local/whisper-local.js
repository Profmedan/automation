/**
 * Whisper en local (whisper.cpp v1.9.5, modèle medium q5_0), sans réseau.
 * Sert à : réécouter la voix (le texte dit est-il celui du script ?) et horodater chaque mot.
 * Sur ce Mac Intel (i5-7600K, 4 cœurs) : ≈ 12 s par fichier court, contre 22 à 49 s pour Whisper medium en Docker.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const CONFIG = require('./config-locale');

/** Minuscules, sans accents ni ponctuation : pour comparer ce qui est dit et ce qui est écrit. */
function normaliser(mot) {
  return String(mot || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ').replace(/[^a-z0-9\s]/g, ' ').trim();
}

// « point » est dit dans les adresses (vive-lia point blogspot point com) mais Whisper écrit « . »
function motsNormalises(texte) {
  return normaliser(texte).split(/\s+/).filter((m) => m && m !== 'point');
}

/** Même mot à l'oreille : « trompe » / « trompent », « refusées » / « refusée » (l'accord ne s'entend pas). */
function memeMot(x, y) {
  if (!x || !y) return false;
  if (x === y) return true;
  const racine = (w) => w.replace(/(ent|es|s|e|x)$/, '');
  return x.length > 3 && y.length > 3 && racine(x) === racine(y);
}

/**
 * Mots horodatés d'un WAV : [{mot, debut, fin}] en secondes.
 * whisper-cli -ml 1 -sow : un segment par mot.
 */
function transcrireMots(wav, dossierTravail) {
  const base = path.join(dossierTravail, `whisper-${path.basename(wav, '.wav')}`);
  const wav16 = `${base}-16k.wav`;
  execFileSync(CONFIG.FFMPEG, ['-v', 'error', '-y', '-i', wav, '-ar', '16000', '-ac', '1', wav16]);
  execFileSync(CONFIG.WHISPER.cli, ['-m', CONFIG.WHISPER.modele, '-l', 'fr', '-t', '4', '-ml', '1', '-sow', '-oj', '-of', base, '-np', wav16],
    { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  const json = JSON.parse(fs.readFileSync(`${base}.json`, 'utf-8'));
  return (json.transcription || [])
    .map((s) => ({ mot: s.text.trim(), debut: s.offsets.from / 1000, fin: s.offsets.to / 1000 }))
    .filter((m) => m.mot && !/^\[.*\]$/.test(m.mot));
}

/**
 * Aligne les mots du script sur les mots entendus (plus longue sous-suite commune sur les mots normalisés).
 * Les mots non retrouvés prennent un temps interpolé entre leurs voisins.
 * @returns {{mots: {mot, debut, fin}[], ressemblance: number}}  ressemblance = part des mots du script retrouvés
 */
function alignerMots(texteScript, entendus, duree) {
  const ecrits = String(texteScript || '').trim().split(/\s+/).filter(Boolean);
  const a = ecrits.map((m) => motsNormalises(m).join(' '));
  // Whisper peut couper « l'objet » en deux mots : on compare mot normalisé par mot normalisé
  const b = entendus.map((m) => motsNormalises(m.mot).join(' '));
  const n = a.length; const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i][j] = memeMot(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const temps = new Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (memeMot(a[i], b[j])) { temps[i] = [entendus[j].debut, entendus[j].fin]; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const trouves = temps.filter(Boolean).length;
  // Interpolation des trous entre deux mots retrouvés (ou les bords 0 et duree)
  for (let i = 0; i < n;) {
    if (temps[i]) { i++; continue; }
    let k = i;
    while (k < n && !temps[k]) k++;
    const debut = i > 0 ? temps[i - 1][1] : 0;
    const fin = k < n ? temps[k][0] : (duree || debut + 0.3 * (k - i));
    const pas = Math.max(0, fin - debut) / (k - i);
    for (let x = i; x < k; x++) temps[x] = [debut + pas * (x - i), debut + pas * (x - i + 1)];
    i = k;
  }
  return {
    mots: ecrits.map((mot, i) => ({ mot, debut: +temps[i][0].toFixed(3), fin: +temps[i][1].toFixed(3) })),
    // « point », ponctuation seule… ne comptent pas : ils ne s'entendent pas comme des mots
    ressemblance: a.filter(Boolean).length ? trouves / a.filter(Boolean).length : 1,
  };
}

module.exports = { transcrireMots, alignerMots, normaliser, motsNormalises };
