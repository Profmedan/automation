/**
 * Voix off en local (12 nov. 2026) : la voix clonée de Pierre (Chatterbox Multilingual, Docker sans réseau),
 * une prise par scène, réécoutée par Whisper local ; Kokoro (voix-off-fr) en secours si Chatterbox échoue.
 *
 * Sorties dans <dossier>/voix/ : s<N>.wav (une par scène, tempo ×1,05), voix.wav (scènes bout à bout),
 * calage.json (début et fin de chaque scène, mots horodatés, ressemblance avec le script).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const CONFIG = require('./config-locale');
const { transcrireMots, alignerMots } = require('./whisper-local');

const SR = 24000;
const DEBUT = 0.25;        // silence avant la première phrase
const ENTRE_SCENES = 0.35; // silence entre deux scènes
const SEUIL_RESSEMBLANCE = 0.8;

// Dictionnaire de prononciation : mot écrit → graphie lue par la voix (voir la note du fichier)
const PRONONCIATION = JSON.parse(fs.readFileSync(path.join(__dirname, 'prononciation.json'), 'utf-8')).mots || {};

/** Applique un dictionnaire { écrit: dit } mot entier par mot entier, en respectant la casse écrite. */
function appliquerPrononciation(texte, dico = PRONONCIATION) {
  let t = String(texte || '');
  for (const [ecrit, dit] of Object.entries(dico)) {
    const motif = ecrit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`(?<![\\p{L}\\d-])${motif}(?![\\p{L}\\d-])`, 'gu'), dit);
  }
  return t;
}

/** Texte réellement dit : dictionnaire de prononciation, adresse du blog épelée, « IA » prononcé « i-a ». */
function texteDit(texte, adresseBlog, dico = PRONONCIATION) {
  let t = appliquerPrononciation(texte, dico);
  if (adresseBlog) {
    const ditAdresse = adresseBlog.replace(/\./g, ' point ');
    t = t.split(adresseBlog).join(ditAdresse);
  }
  // « 87,7 % » : Chatterbox le lisait mal (Whisper a entendu « water 27 % pour 7 % ») → « 87 virgule 7 pour cent »
  t = t.replace(/(\d+),(\d+)\s*%/g, '$1 virgule $2 pour cent').replace(/(\d)\s*%/g, '$1 pour cent')
    .replace(/(\d+),(\d+)/g, '$1 virgule $2');
  return t.replace(/\bl['’]IA\b/g, "l'i-a").replace(/\bL['’]IA\b/g, "L'i-a").replace(/\bIA\b/g, 'i-a');
}

function duree(wav) {
  return parseFloat(execFileSync(CONFIG.FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
}

function chatterbox(items, dossier, graine) {
  const nom = `prises-${graine}`;
  fs.writeFileSync(path.join(dossier, `${nom}.json`), JSON.stringify(items, null, 1));
  fs.copyFileSync(CONFIG.CHATTERBOX.reference, path.join(dossier, 'reference.wav'));
  const t0 = Date.now();
  execFileSync('docker', ['run', '--rm', '--network', 'none', '-e', 'HF_HUB_OFFLINE=1',
    '-v', `${CONFIG.CHATTERBOX.modeles}:/modeles:ro`, '-v', `${dossier}:/travail`, '-w', '/travail',
    CONFIG.CHATTERBOX.image, 'python', '/app/generer.py', `${nom}.json`, '--ref', 'reference.wav', '--out', `${nom}/`, '--seed', String(graine)],
  { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, timeout: 60 * 60 * 1000 });
  return { dossier: path.join(dossier, nom), secondes: (Date.now() - t0) / 1000, moteur: `Chatterbox (voix clonée, graine ${graine})` };
}

function kokoro(items, dossier) {
  const t0 = Date.now();
  const sortie = path.join(dossier, 'kokoro');
  fs.writeFileSync(path.join(dossier, 'kokoro.json'), JSON.stringify(items, null, 1));
  execFileSync(CONFIG.KOKORO.python, [CONFIG.KOKORO.script, path.join(dossier, 'kokoro.json'), '--out', sortie], { stdio: 'pipe' });
  return { dossier: sortie, secondes: (Date.now() - t0) / 1000, moteur: 'Kokoro ff_siwis (secours)' };
}

/**
 * @param {{id: string, narration: string}[]} scenes
 * @param {string} dossierVideo
 * @param {{adresseBlog?: string, prises?: Function}} options  prises : remplaçable dans les essais et les tests
 */
async function genererVoixLocale(scenes, dossierVideo, options = {}) {
  const dossier = path.join(dossierVideo, 'voix');
  fs.mkdirSync(dossier, { recursive: true });
  const items = scenes.map((s) => ({ id: s.id, text: texteDit(s.narration, options.adresseBlog) }));
  const journal = [];

  let prises;
  try {
    // options.prises : prises déjà enregistrées (essais et tests), même format que Chatterbox
    prises = options.prises ? options.prises(items, dossier) : chatterbox(items, dossier, 1);
  } catch (e) {
    journal.push(`Chatterbox a échoué (${String(e.stderr || e.message).slice(-300)}) → Kokoro`);
    prises = kokoro(items, dossier);
  }
  journal.push(`${prises.moteur} : ${prises.secondes.toFixed(0)} s de calcul`);

  // Tempo ×1,05 (comme les vidéos précédentes) et réécoute de chaque scène par Whisper local
  const parScene = {};
  const ecouter = (source, id) => {
    const wav = path.join(dossier, `${id}.wav`);
    execFileSync(CONFIG.FFMPEG, ['-v', 'error', '-y', '-i', source, '-af', `atempo=${CONFIG.CHATTERBOX.tempo}`, '-ar', String(SR), '-ac', '1', wav]);
    const entendus = transcrireMots(wav, dossier);
    const d = duree(wav);
    const scene = scenes.find((s) => s.id === id);
    const { mots, ressemblance } = alignerMots(scene.narration, entendus, d);
    return { wav, duree: d, mots, ressemblance, entendu: entendus.map((m) => m.mot).join(' ') };
  };
  let secondesWhisper = 0;
  const ecouterChrono = (source, id) => { const t = Date.now(); const r = ecouter(source, id); secondesWhisper += (Date.now() - t) / 1000; return r; };
  for (const s of scenes) parScene[s.id] = ecouterChrono(path.join(prises.dossier, `${s.id}.wav`), s.id);

  // Une seconde prise (autre graine) pour les scènes mal comprises par Whisper ; on garde la meilleure
  const douteuses = scenes.filter((s) => parScene[s.id].ressemblance < SEUIL_RESSEMBLANCE);
  if (douteuses.length && prises.moteur.startsWith('Chatterbox') && !options.prises) {
    journal.push(`Reprise (graine 2) de ${douteuses.map((s) => s.id).join(', ')} : Whisper n'y retrouve pas assez le script`);
    try {
      const reprise = chatterbox(items.filter((i) => douteuses.some((s) => s.id === i.id)), dossier, 2);
      journal.push(`${reprise.moteur} : ${reprise.secondes.toFixed(0)} s de calcul`);
      for (const s of douteuses) {
        const avant = parScene[s.id];
        fs.renameSync(avant.wav, `${avant.wav}.graine1`);
        const apres = ecouterChrono(path.join(reprise.dossier, `${s.id}.wav`), s.id);
        if (apres.ressemblance >= avant.ressemblance) parScene[s.id] = apres;
        else { fs.renameSync(`${avant.wav}.graine1`, avant.wav); }
      }
    } catch (e) {
      journal.push(`Reprise impossible : ${String(e.message).slice(0, 200)}`);
    }
  }
  journal.push(`Whisper local (réécoute + mots horodatés) : ${secondesWhisper.toFixed(0)} s`);

  // Assemblage : silences fixes entre scènes ; temps de chaque mot ramené au temps de la vidéo
  const liste = [];
  const calage = [];
  let t = DEBUT;
  const silence = (s) => {
    const f = path.join(dossier, `silence-${s}.wav`);
    if (!fs.existsSync(f)) execFileSync(CONFIG.FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=${SR}:cl=mono`, '-t', String(s), f]);
    return f;
  };
  liste.push(silence(DEBUT));
  scenes.forEach((s, i) => {
    const p = parScene[s.id];
    calage.push({
      id: s.id, debut: +t.toFixed(3), fin: +(t + p.duree).toFixed(3), ressemblance: +p.ressemblance.toFixed(2), entendu: p.entendu,
      mots: p.mots.map((m) => ({ mot: m.mot, debut: +(t + m.debut).toFixed(3), fin: +(t + m.fin).toFixed(3) })),
    });
    liste.push(p.wav);
    t += p.duree;
    if (i < scenes.length - 1) { liste.push(silence(ENTRE_SCENES)); t += ENTRE_SCENES; }
  });
  const fichierListe = path.join(dossier, 'liste.txt');
  fs.writeFileSync(fichierListe, liste.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  const voix = path.join(dossier, 'voix.wav');
  execFileSync(CONFIG.FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', fichierListe, '-c', 'copy', voix]);
  const resultat = { voix, duree: +t.toFixed(3), scenes: calage, moteur: prises.moteur, journal };
  fs.writeFileSync(path.join(dossier, 'calage.json'), JSON.stringify(resultat, null, 1));
  return resultat;
}

module.exports = { genererVoixLocale, texteDit, appliquerPrononciation };
