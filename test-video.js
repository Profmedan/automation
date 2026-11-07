require('dotenv').config();
const { generateVideoScript } = require('./scripts/generate-script-dynamic');

const article = {
  title: 'Des robots qui grimpent aux murs',
  content: 'Les robots grimpeurs révolutionnent la construction avec une précision inégalée.',
  url: 'https://newseconomiques.blogspot.com/2026/02/des-robots-qui-grimpent-aux-murs.html'
};

console.log('🚀 Test génération script vidéo (timeout 120s)...\n');
const start = Date.now();

generateVideoScript(article)
  .then(script => {
    const elapsed = (Date.now() - start) / 1000;
    console.log(`\n✅ SUCCÈS en ${elapsed.toFixed(1)}s`);
    console.log(`📝 Script: ${script.scenes.length} plans, ${script.duration}s`);
  })
  .catch(error => {
    const elapsed = (Date.now() - start) / 1000;
    console.error(`\n❌ ERREUR après ${elapsed.toFixed(1)}s:`, error.message);
    process.exit(1);
  });
