#!/usr/bin/env node

/**
 * Wrapper SÛRE pour générer une vidéo LinkedIn avec VRAI timeout
 * Tue le processus si ça dépasse 180s
 */

const { spawn } = require('child_process');
const path = require('path');

const articlePath = process.argv[2];

if (!articlePath) {
  console.error('Usage: node generate-video-safe.js <article.json>');
  process.exit(1);
}

console.log('🎬 Lancement génération vidéo (timeout: 180s)...\n');

// Lance le subprocess generate-video.js
const proc = spawn('node', [
  path.join(__dirname, 'generate-video.js'),
  articlePath
], {
  stdio: 'inherit',  // Affiche tout directement
  timeout: 180000    // 180s timeout (tue le processus si dépassé)
});

// Timer de secours
const killTimer = setTimeout(() => {
  console.error('\n⏲️  TIMEOUT après 180s - TUE le processus');
  try {
    proc.kill('SIGKILL');
  } catch (e) {}
  process.exit(1);
}, 180000);

proc.on('exit', (code) => {
  clearTimeout(killTimer);
  process.exit(code || 0);
});

proc.on('error', (error) => {
  clearTimeout(killTimer);
  console.error('❌ Erreur subprocess:', error.message);
  process.exit(1);
});
