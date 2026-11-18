/**
 * Montage et rendu en local (12 nov. 2026) : Hyperframes (HTML → vidéo), Rhubarb (bouches de l'avatar),
 * FFmpeg (mixage voix + musique Mixkit + sons procéduraux claude-motion, niveau −16 LUFS, crête vraie < −4 dBTP).
 *
 * Entrées : le script (scènes avec planRef, text, source, visuel…) et le calage de la voix (voix-locale.js).
 * Sortie : <dossier>/video.mp4 (1080 × 1920, H.264, bt709) et <dossier>/video.srt.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const CONFIG = require('./config-locale');
const { htmlScene, echapper } = require('./scenes-visuelles');
const { planMotion, genererKitSons, revueMotion } = require('./motion-skills');
const { plansDeRendu } = require('./storyboard-motion');
const {verifierStoryboardFactuel}=require('./controle-storyboard');
const { auditerAudio, garderDockerEveille } = require('./revue-audio');
const { enregistrerBanque } = require('./motion-composition');
const {FONTES_LOCALES,tokens,cssTokens,preparerDirection}=require('./directions-visuelles');

const L = 1080;
const H = 1920;
const QUEUE = 3.5;       // l'image des sources reste après la dernière phrase
const AVANCE = 0.2;      // une scène apparaît un peu avant sa phrase
const CIBLE_LUFS = -16;

const CSS_RACINE = `
      /* Identité « Vive l'IA » (charte relevée sur le blog le 8 nov. 2026) */
      :root {
        --fond-a: #10283f; --fond-b: #174c68; --fond-c: #0a1a2b;
        --encre: #ffffff; --encre-2: #b9c7d6;
        --papier: #ffffff; --filet: #dce5eb; --nuit: #162638; --muet: #58687b;
        --accent: #126f9a; --accent-vif: #4fb3d9; --alerte: #ff6b57; --prudence: #f5b544;
        --lueur: 0 0 26px rgba(79, 179, 217, 0.65);
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${L}px; height: ${H}px; overflow: hidden; background: var(--fond-c); }
      body { font-family: "Roboto", sans-serif; color: var(--encre); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--fond-c); }
      .scene { position: absolute; inset: 0; }
      .camera { position: absolute; inset: 0; }
      .gros { font-family: "Roboto", sans-serif; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
      .pilule { position: absolute; display: inline-block; padding: 0.22em 0.6em; border-radius: 999px; font: 900 34px Roboto, sans-serif; white-space: nowrap; }
      .p-accent { background: var(--accent-vif); color: #06202f; box-shadow: var(--lueur); }`;

/** Groupes de sous-titres : 4 mots ou 24 caractères au plus, jamais à cheval sur deux scènes. */
function groupesSousTitres(calage) {
  const groupes = [];
  for (const sc of calage.scenes) {
    let g = [];
    const fermer = () => { if (g.length) groupes.push(g); g = []; };
    for (const m of sc.mots) {
      const texte = [...g, m].map((x) => x.mot).join(' ');
      if (g.length && (g.length >= 4 || texte.length > 24)) fermer();
      g.push(m);
      if (/[.!?;:]$/.test(m.mot)) fermer();
    }
    fermer();
  }
  return groupes.map((g, i) => ({
    mots: g,
    debut: g[0].debut,
    // fermé juste avant l'ouverture du groupe suivant : jamais deux groupes à l'écran
    fin: i < groupes.length - 1 ? Math.min(groupes[i + 1][0].debut - 0.04, g[g.length - 1].fin + 0.6) : g[g.length - 1].fin + 0.6,
  }));
}

function srt(groupes) {
  const hms = (t) => {
    const ms = Math.round(t * 1000);
    const p = (n, k = 2) => String(n).padStart(k, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return groupes.map((g, i) => `${i + 1}\n${hms(g.debut)} --> ${hms(g.fin)}\n${g.mots.map((m) => m.mot).join(' ')}\n`).join('\n');
}

function htmlSousTitres(groupes, duree, style) {
  return `<template>
  <style>${FONTES_LOCALES}
    #root { position: absolute; inset: 0; pointer-events: none; }
    .st-groupe { position:absolute; left:50%; top:170px; width:max-content; max-width:1000px; transform:translateX(-50%); padding:10px 18px; text-align:center; white-space:nowrap; opacity:0;
      background:#24221ff2; color:#fff; font:900 74px VideoSans,Roboto,sans-serif; line-height:1.15; text-shadow:none; }
    .st-mot { display: inline-block; margin: 0 0.12em; opacity: 0; }
  </style>
  <div id="root" data-composition-id="soustitres" data-width="${L}" data-height="${H}">
    <div id="st-cadre" class="clip" data-start="0" data-duration="${duree.toFixed(3)}" data-track-index="1">
${groupes.map((g, i) => `      <div id="st-g${i}" class="st-groupe">${g.mots.map((m) => `<span class="st-mot" data-t="${m.debut.toFixed(3)}">${echapper(m.mot)}</span>`).join('')}</div>`).join('\n')}
    </div>
  </div>
  <script>
    (function () {
      const GROUPES = ${JSON.stringify(groupes.map((g, i) => [`#st-g${i}`, +g.debut.toFixed(3), +g.fin.toFixed(3)]))};
      const tl = gsap.timeline({ paused: true });
      for (const [g, debut, fin] of GROUPES) {
        tl.set(g, { opacity: 1 }, debut);
        document.querySelectorAll(g + " .st-mot").forEach((m) => {
          tl.fromTo(m, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.12, ease: "power2.out" }, Math.max(debut, parseFloat(m.dataset.t) - 0.03));
        });
        tl.set(g, { opacity: 0 }, fin);
      }
      window.__timelines = window.__timelines || {};
      window.__timelines["soustitres"] = tl;
    })();
  </script>
</template>
`;
}

function htmlFond(duree) {
  return `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; }
    #f-degrade { position: absolute; inset: 0; background: linear-gradient(115deg, var(--fond-a) 0%, var(--fond-b) 100%); }
    #f-trame { position: absolute; left: -48px; top: -48px; width: ${L + 96}px; height: ${H + 96}px;
      background-image: radial-gradient(rgba(185, 199, 214, 0.14) 2px, transparent 2.5px); background-size: 48px 48px; }
    #f-vignette { position: absolute; inset: 0; background: radial-gradient(130% 90% at 50% 45%, transparent 55%, rgba(4, 12, 22, 0.65) 100%); }
  </style>
  <div id="root" data-composition-id="fond" data-width="${L}" data-height="${H}">
    <div id="f-cadre" class="clip" data-start="0" data-duration="${duree.toFixed(3)}" data-track-index="0" data-layout-allow-overflow>
      <div id="f-degrade"></div><div id="f-trame"></div><div id="f-vignette"></div>
    </div>
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#f-trame", { x: 0, y: 0 }, { x: 48, y: 48, duration: ${duree.toFixed(3)}, ease: "none" }, 0);
      window.__timelines = window.__timelines || {};
      window.__timelines["fond"] = tl;
    })();
  </script>
</template>
`;
}

/** Avatar de Pierre en bas à droite : bouches Rhubarb, clignements, hochement à chaque scène. */
function htmlAvatar(reperes, debutsScenes, duree) {
  const zone = 'left:33.4821%;top:57.3204%;width:22.3214%;height:11.7403%';
  const yeux = 'left:31.25%;top:38.674%;width:24.5536%;height:6.9061%';
  const clignements = [];
  for (let t = 2.1; t < duree - 0.5; t += 3.7) clignements.push(+t.toFixed(2));
  return `<template>
  <style>
    #root { position: absolute; inset: 0; pointer-events: none; }
    /* Consigne du 5 nov. 2026 : avatar en bas à droite (x 540–920, y 1303–1610), au-dessus de la colonne de boutons du réseau */
    #av-cadre { position: absolute; left: 540px; top: 1303px; width: 380px; height: 307px; }
    #av-detour { position: absolute; inset: 0; filter: drop-shadow(0 6px 12px rgba(30, 22, 18, 0.35)); }
    #av-fondu { position: absolute; inset: 0; -webkit-mask-image: linear-gradient(to bottom, #000 78%, transparent 100%); mask-image: linear-gradient(to bottom, #000 78%, transparent 100%); }
    #av-entree, #av-flotte, #av-hoche { position: absolute; inset: 0; }
    #av-hoche img { position: absolute; display: block; }
    #av-base { left: 0; top: 0; width: 100%; height: 100%; }
    .av-bouche, .av-yeux { opacity: 0; }
    #av-bouche-X { opacity: 1; }
  </style>
  <div id="root" data-composition-id="avatar" data-width="${L}" data-height="${H}">
    <div id="av-cadre" class="clip" data-start="0" data-duration="${duree.toFixed(3)}" data-track-index="1" data-layout-allow-overflow>
      <div id="av-entree"><div id="av-detour"><div id="av-fondu"><div id="av-flotte"><div id="av-hoche">
        <img id="av-base" src="assets/avatar/base.png" alt="" />
${['X', 'A', 'B', 'C', 'D', 'E', 'F'].map((f) => `        <img id="av-bouche-${f}" class="av-bouche" src="assets/avatar/bouche-${f}.png" alt="" style="${zone}" />`).join('\n')}
        <img id="av-yeux-mi-clos" class="av-yeux" src="assets/avatar/yeux-mi-clos.png" alt="" style="${yeux}" />
        <img id="av-yeux-fermes" class="av-yeux" src="assets/avatar/yeux-fermes.png" alt="" style="${yeux}" />
      </div></div></div></div></div>
    </div>
  </div>
  <script>
    (function () {
      const REPERES = ${JSON.stringify(reperes)};
      const CLIGNEMENTS = ${JSON.stringify(clignements)};
      const HOCHEMENTS = ${JSON.stringify(debutsScenes.map((t) => +(t + 0.3).toFixed(2)))};
      const DUREE = ${duree.toFixed(3)};
      const tl = gsap.timeline({ paused: true });
      // Visible dès la première image : c'est la miniature sur les réseaux
      tl.fromTo("#av-entree", { y: 0 }, { y: -10, duration: 0.3, ease: "power2.out", yoyo: true, repeat: 1 }, 0.2);
      let avant = "X";
      for (const [t, forme] of REPERES) {
        if (forme === avant) continue;
        tl.set("#av-bouche-" + avant, { opacity: 0 }, t).set("#av-bouche-" + forme, { opacity: 1 }, t);
        avant = forme;
      }
      for (const t of CLIGNEMENTS) {
        tl.set("#av-yeux-mi-clos", { opacity: 1 }, t).set("#av-yeux-mi-clos", { opacity: 0 }, t + 0.067)
          .set("#av-yeux-fermes", { opacity: 1 }, t + 0.067).set("#av-yeux-fermes", { opacity: 0 }, t + 0.167)
          .set("#av-yeux-mi-clos", { opacity: 1 }, t + 0.167).set("#av-yeux-mi-clos", { opacity: 0 }, t + 0.233);
      }
      tl.fromTo("#av-flotte", { y: 3 }, { y: -3, duration: 1.7, ease: "sine.inOut", yoyo: true, repeat: Math.ceil(DUREE / 1.7) }, 0);
      for (const t of HOCHEMENTS) {
        tl.fromTo("#av-hoche", { y: 0, rotation: 0 }, { y: 6, rotation: 1, transformOrigin: "50% 100%", duration: 0.12, ease: "power2.out", immediateRender: false }, t - 0.06)
          .to("#av-hoche", { y: 0, rotation: 0, duration: 0.28, ease: "power2.inOut" }, t + 0.06);
      }
      window.__timelines = window.__timelines || {};
      window.__timelines["avatar"] = tl;
    })();
  </script>
</template>
`;
}

/** Fenêtres des scènes à l'écran : chacune commence un peu avant sa phrase et dure jusqu'à la suivante. */
function fenetresScenes(calage) {
  const total = calage.duree + QUEUE;
  return calage.scenes.map((s, i) => {
    const debut = i === 0 ? 0 : Math.max(0, s.debut - AVANCE);
    const fin = i < calage.scenes.length - 1 ? calage.scenes[i + 1].debut - AVANCE : total;
    return { id: `s${i}`, debut: +debut.toFixed(3), duree: +(fin - debut).toFixed(3), voix: s };
  });
}

function rhubarb(voix, dossier) {
  const sortie = path.join(dossier, 'bouche.json');
  execFileSync(CONFIG.RHUBARB, ['-q', '-r', 'phonetic', '-f', 'json', '--extendedShapes', 'X', '-o', sortie, voix], { stdio: 'pipe', timeout: 20 * 60 * 1000 });
  const cues = JSON.parse(fs.readFileSync(sortie, 'utf-8')).mouthCues || [];
  return cues.map((c) => [+c.start.toFixed(3), c.value === 'G' || c.value === 'H' ? 'C' : c.value]);
}

/** Repères du son procédural claude-motion : mouvements, sous-idées et une seule emphase forte. */
function reperesSons(fenetres, script) {
  const sons = [];
  const hero = script.scenes.some(s => s.planRef === 'conclusion') ? 'conclusion' : 'appel';
  fenetres.forEach((f, i) => {
    if (i > 0) sons.push({ fichier: 'whoosh.ogg', t: Math.max(0, f.debut - 0.07), volume: 0.22 });
    const ref = script.scenes[i].planRef;
    if (ref === hero) sons.push({ fichier: 'impact.ogg', t: f.debut + 0.25, volume: 0.3 });
    if (/^developpement\./.test(ref)) sons.push({ fichier: 'pop.ogg', t: f.debut + 0.45, volume: 0.25 });
  });
  return sons;
}

function mesurer(fichier) {
  const err = require('child_process').spawnSync(CONFIG.FFMPEG, ['-nostats', '-i', fichier, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf-8' }).stderr;
  const resume = err.slice(err.lastIndexOf('Summary:'));
  return { lufs: parseFloat(/I:\s+(-?[\d.]+) LUFS/.exec(resume)[1]), crete: parseFloat(/Peak:\s+(-?[\d.]+) dBFS/.exec(resume)[1]) };
}

/** Voix + musique (baissée sous la voix) + bruitages → mix.wav (48 kHz stéréo). */
function mixer(calage, sons, duree, dossier, kit) {
  const entrees = ['-i', calage.voix, '-stream_loop', '-1', '-i', CONFIG.MUSIQUE.fichier];
  sons.forEach((s) => entrees.push('-i', path.join(kit || CONFIG.SFX, kit ? s.fichier.replace(/\.ogg$/, '.wav') : s.fichier)));
  const f = [
    '[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:' + duree.toFixed(3) + ',asplit=2[voix][cle]',
    `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${duree.toFixed(3)},afade=t=in:d=0.6,afade=t=out:st=${(duree - 2.5).toFixed(3)}:d=2.5,volume=0.16[mus]`,
    '[mus][cle]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[musb]',
  ];
  const noms = ['[voix]', '[musb]'];
  sons.forEach((s, i) => {
    const ms = Math.round(s.t * 1000);
    f.push(`[${i + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${s.volume}[x${i}]`);
    noms.push(`[x${i}]`);
  });
  f.push(`${noms.join('')}amix=inputs=${noms.length}:normalize=0:duration=first[mix]`);
  const sortie = path.join(dossier, 'mix.wav');
  execFileSync(CONFIG.FFMPEG, ['-v', 'error', '-y', ...entrees, '-filter_complex', f.join(';'), '-map', '[mix]', '-t', duree.toFixed(3), sortie],
    { stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
  return sortie;
}

/**
 * @returns {Promise<{videoPath, srtPath, duree, mesures, secondes}>}
 */
async function rendreVideoLocale(script, calage, dossierVideo, options={}) {
  const t0 = Date.now();
  const projet = path.join(dossierVideo, 'hyperframes');
  for (const d of ['compositions', 'assets/avatar', 'vendor']) fs.mkdirSync(path.join(projet, d), { recursive: true });
  if(script.storyboardMotion&&!options.preparerSeulement)await verifierStoryboardFactuel(script,script.storyboardMotion,dossierVideo);
  preparerDirection(script,dossierVideo);
  const fenetres = fenetresScenes(calage);
  const duree = +(calage.duree + QUEUE).toFixed(3);
  const plans = plansDeRendu(script, fenetres);
  const images = plans.map(p=>p.fenetre);
  const motionPlan = planMotion({...script,scenes:plans.map(p=>p.scene)}, images);
  if(script.storyboardMotion)motionPlan.cadence_s=script.storyboardMotion.intervalle_s;
  fs.writeFileSync(path.join(dossierVideo, 'motion-plan.json'), JSON.stringify(motionPlan, null, 2));
  const nbSousIdees = script.scenes.filter((s) => /^developpement\./.test(s.planRef)).length;

  plans.forEach(({fenetre:f,scene}, i) => {
    const html = htmlScene(scene, {
      id: f.id, duree: f.duree, debut: f.debut, mots: f.voix.mots, nbSousIdees, premier: i === 0, dernier: i === plans.length - 1, motion: motionPlan.scenes[i], planCourt:scene.planCourt,
    });
    fs.writeFileSync(path.join(projet, 'compositions', `${f.id}.html`), html);
  });
  fs.mkdirSync(path.join(projet,'assets/fonts'),{recursive:true});
  const polices={VideoSerif:'/System/Library/Fonts/Supplemental/Georgia Bold.ttf',VideoHand:'/System/Library/Fonts/Supplemental/Chalkduster.ttf',VideoSans:'/System/Library/Fonts/Avenir Next Condensed.ttc'};
  for(const [nom,source] of Object.entries(polices))fs.copyFileSync(source,path.join(projet,'assets/fonts',nom+path.extname(source)));
  const fontes=Object.keys(polices).map(n=>`@font-face{font-family:${n};src:url("assets/fonts/${n}${path.extname(polices[n])}");font-weight:100 900;}`).join('\n');
  const groupes = groupesSousTitres(calage);
  fs.writeFileSync(path.join(projet, 'compositions', 'soustitres.html'), htmlSousTitres(groupes, duree, motionPlan.style));
  fs.writeFileSync(path.join(projet, 'compositions', 'fond.html'), htmlFond(duree));
  const reperes = rhubarb(calage.voix, path.join(dossierVideo, 'voix'));
  fs.writeFileSync(path.join(projet, 'compositions', 'avatar.html'), htmlAvatar(reperes, fenetres.map((f) => f.debut), duree));
  for (const f of fs.readdirSync(CONFIG.AVATAR)) if (f.endsWith('.png')) fs.copyFileSync(path.join(CONFIG.AVATAR, f), path.join(projet, 'assets', 'avatar', f));
  fs.copyFileSync(CONFIG.GSAP, path.join(projet, 'vendor', 'gsap.min.js'));
  fs.writeFileSync(path.join(projet, 'hyperframes.json'), JSON.stringify({ paths: { blocks: 'compositions', assets: 'assets' } }, null, 2));
  fs.writeFileSync(path.join(projet, 'package.json'), JSON.stringify({ name: 'video-bot', private: true, type: 'module' }, null, 2));

  const hote = (id, debut, d, piste, kind) => `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${debut.toFixed(3)}" data-duration="${d.toFixed(3)}" data-track-index="${piste}" data-track-kind="${kind}" data-width="${L}" data-height="${H}"></div>`;
  const index = `<!doctype html>
<html lang="fr" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${L}, height=${H}" />
    <title>${echapper(script.title || 'Vidéo')}</title>
    <script src="vendor/gsap.min.js"></script>
    <style>${CSS_RACINE}
      ${fontes}
      :root{${cssTokens(tokens(motionPlan.style))}}
      #fond { z-index: 0; }
      ${images.map((f) => `#${f.id}`).join(', ')} { z-index: 2; }
      #soustitres { z-index: 8; }
      #avatar { z-index: 10; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duree.toFixed(3)}" data-width="${L}" data-height="${H}" data-fps="30">
${hote('fond', 0, duree, 0, 'graphics')}
${images.map((f, i) => hote(f.id, f.debut, f.duree, 1 + (i % 2), 'graphics')).join('\n')}
${hote('soustitres', 0, duree, 4, 'captions')}
${hote('avatar', 0, duree, 5, 'graphics')}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
  fs.writeFileSync(path.join(projet, 'index.html'), index);
  // Préparer des images de travail ne produit aucun MP4 ni résultat prêt à approuver.
  if(options.preparerSeulement)return {projet,duree,motionPlan};

  const fermerVeilleDocker=garderDockerEveille();
  try{
  // Contrôle Hyperframes puis rendu (image seule ; le son est mixé à part par FFmpeg)
  const npx = (args, opts = {}) => execFileSync('npx', ['--yes', CONFIG.HYPERFRAMES, ...args], { cwd: projet, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, ...opts }).toString();
  let controle = '';
  try {
    controle = npx(['check', '--json']);
  } catch (e) {
    controle = String(e.stdout || '');
    fs.writeFileSync(path.join(dossierVideo,'hyperframes-check.stderr.log'),String(e.stderr||e.message||''));
  }
  fs.writeFileSync(path.join(dossierVideo, 'hyperframes-check.json'), controle);
  verifierControleHyperframes(controle);
  const tRendu = Date.now();
  const brut = path.join(dossierVideo, 'rendu-brut.mp4');
  npx(['render', '--quality', 'delivery', '--output', brut, '--quiet'], { timeout: 90 * 60 * 1000 });
  const secondesRendu = (Date.now() - tRendu) / 1000;

  // Son : mixage, puis gain vers −16 LUFS et limiteur (crête vraie < −4 dBTP) ; image copiée, marquée bt709
  const kit = genererKitSons(dossierVideo);
  const mix = mixer(calage, reperesSons(fenetres, script), duree, dossierVideo, kit);
  const avant = mesurer(mix);
  const gain = +(CIBLE_LUFS - avant.lufs).toFixed(2);
  const videoPath = path.join(dossierVideo, 'video.mp4');
  execFileSync(CONFIG.FFMPEG, ['-v', 'error', '-y', '-i', brut, '-i', mix, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
    '-af', `volume=${gain}dB,alimiter=limit=0.55:attack=2:release=60:level=false`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart', videoPath], { stdio: 'pipe' });
  const apres = mesurer(videoPath);
  // Aucun rendu prêt à approuver ne peut ignorer une erreur Earshot.
  const earshot=auditerAudio(videoPath,dossierVideo,images);
  const revue = revueMotion(videoPath, images, dossierVideo, CONFIG.FFMPEG);
  motionPlan.banque = enregistrerBanque({...script,scenes:plans.map(p=>p.scene)}, path.join(path.dirname(dossierVideo), '.motion-library'));
  fs.writeFileSync(path.join(dossierVideo, 'motion-plan.json'), JSON.stringify(motionPlan, null, 2));
  const srtPath = path.join(dossierVideo, 'video.srt');
  fs.writeFileSync(srtPath, srt(groupes));
  return {
    videoPath, srtPath, duree, secondes: (Date.now() - t0) / 1000, secondesRendu,earshot,
    mesures: { lufs: apres.lufs, crete_dBTP: apres.crete, gain_dB: gain },
    musique: CONFIG.MUSIQUE.credit,
    motion: { style: motionPlan.style, direction:motionPlan.direction, sources:motionPlan.sources, ressources_indisponibles:motionPlan.ressources_indisponibles, cadence_s:motionPlan.cadence_s||null, plans:images.length, banque: motionPlan.banque, designs: [...new Set(motionPlan.scenes.map(s => s.design))], plan: 'motion-plan.json', revue: 'motion-review/review.json', statut: revue.statut, planches: revue.planches.length, sons: 'claude-motion (synthèse locale, MIT)' },
  };
  }finally{fermerVeilleDocker();}
}

function verifierControleHyperframes(texte){
 let c;try{c=JSON.parse(texte);}catch{throw Error('Contrôle Hyperframes illisible ; rendu arrêté.');}
 if(!c.ok||c.browserSkipped||!c.runtime?.ok||!c.layout?.ok||!c.contrast?.ok||!c.layout.samples?.length)throw Error('Contrôle Hyperframes incomplet ou en erreur ; rendu arrêté avant export.');
 return c;
}
module.exports = { CSS_RACINE, rendreVideoLocale, groupesSousTitres, fenetresScenes, srt, reperesSons, htmlAvatar, htmlSousTitres,verifierControleHyperframes };
