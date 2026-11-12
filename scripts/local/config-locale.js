/**
 * Outils locaux et gratuits du générateur vidéo (12 nov. 2026). Chemins modifiables par variables d'environnement.
 */
const os = require('os');
const path = require('path');

const VIDEOS = process.env.VIDEOS_DIR || path.join(os.homedir(), 'Desktop', 'VIDEOS');
const OUTILS = path.join(VIDEOS, 'outils');

module.exports = {
  VIDEOS,
  FFMPEG: process.env.FFMPEG_PATH || '/usr/local/Caskroom/mambaforge/base/bin/ffmpeg',
  FFPROBE: process.env.FFPROBE_PATH || '/usr/local/Caskroom/mambaforge/base/bin/ffprobe',
  // Voix clonée : Chatterbox Multilingual dans Docker, sans réseau
  CHATTERBOX: {
    image: 'chatterbox-fr:0.1.7',
    modeles: path.join(OUTILS, 'chatterbox', 'modeles'),
    reference: process.env.VOIX_REFERENCE || path.join(OUTILS, 'chatterbox', 'ma-voix', 'reference-extrait.wav'),
    tempo: 1.05,
  },
  // Secours : Kokoro (skill voix-off-fr), voix ff_siwis
  KOKORO: {
    python: path.join(os.homedir(), '.voix-off-fr', 'venv', 'bin', 'python'),
    script: path.join(os.homedir(), '.claude', 'skills', 'voix-off-fr', 'scripts', 'voix_off.py'),
  },
  // Whisper local : whisper.cpp v1.9.5 compilé sur ce Mac, modèle medium q5_0
  WHISPER: {
    cli: path.join(OUTILS, 'whisper-cpp', 'src', 'build', 'bin', 'whisper-cli'),
    modele: path.join(OUTILS, 'whisper-cpp', 'modeles', 'ggml-medium-q5_0.bin'),
  },
  RHUBARB: path.join(OUTILS, 'rhubarb', 'Rhubarb-Lip-Sync-1.14.0-macOS', 'rhubarb'),
  // Avatar préparé (copie lue seulement ; les originaux de ~/Desktop/VIDEOS/avatar/original ne sont jamais touchés)
  AVATAR: process.env.AVATAR_DIR || path.join(VIDEOS, '2026-11-05-jdp-maj-video-mai', 'projet', 'assets', 'avatar'),
  // Musique Mixkit (licence Mixkit Free License, voir musiques/LICENCES.md) : seulement coupée et réglée en volume
  MUSIQUE: {
    fichier: process.env.MUSIQUE || path.join(VIDEOS, 'musiques', 'mixkit-driving-ambition-32.mp3'),
    credit: 'Mixkit « Driving Ambition » (n° 32), Mixkit Free License',
  },
  // Bruitages CC0 du skill sound-effects
  SFX: path.join(os.homedir(), '.claude', 'skills', 'sound-effects', 'sfx', 'kit'),
  HYPERFRAMES: 'hyperframes@0.8.210',
  GSAP: path.join(VIDEOS, '2026-11-vive-lia-robots', 'projet-vertical', 'vendor', 'gsap.min.js'),
};
