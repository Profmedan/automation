#!/usr/bin/env node

/**
 * Test de configuration du système d'automatisation vidéo LinkedIn
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(__dirname, '..');

console.log('🔧 TEST DE CONFIGURATION\n');

// Vérification des clés API
const checks = [
  {
    name: 'OpenAI API Key',
    value: process.env.OPENAI_API_KEY,
    required: true,
  },
  {
    name: 'ElevenLabs API Key',
    value: process.env.ELEVENLABS_API_KEY,
    required: true,
  },
  {
    name: 'ElevenLabs Voice ID',
    value: process.env.ELEVENLABS_VOICE_ID,
    required: true,
  },
];

let allGood = true;

checks.forEach(check => {
  const status = check.value ? '✅' : '❌';
  const value = check.value 
    ? `${check.value.substring(0, 10)}...${check.value.slice(-4)}` 
    : 'NON CONFIGURÉ';
  
  console.log(`${status} ${check.name}: ${value}`);
  
  if (check.required && !check.value) {
    allGood = false;
  }
});

// Vérification des dossiers
console.log('\\n📁 DOSSIERS:');
const folders = [
  process.env.VIDEO_OUTPUT_PATH || path.join(WORKSPACE_ROOT, 'linkedin-videos'),
  process.env.BLOGGER_OUTPUT_PATH || path.join(WORKSPACE_ROOT, 'blogger-automation'),
];

folders.forEach(folder => {
  const exists = fs.existsSync(folder);
  console.log(`${exists ? '✅' : '⚠️ '} ${folder}`);
});

// Résumé
console.log('\\n' + '='.repeat(60));
if (allGood) {
  console.log('✅ CONFIGURATION COMPLÈTE - Prêt à générer des vidéos !');
  console.log('\\nCommandes disponibles:');
  console.log('  npm run generate <article.json>  - Générer une vidéo');
  console.log('  npm run list-voices              - Lister les voix ElevenLabs');
} else {
  console.log('❌ CONFIGURATION INCOMPLÈTE');
  console.log('\\n📋 ÉTAPES À SUIVRE:');
  console.log('\\n1️⃣  Créer un compte ElevenLabs (https://elevenlabs.io/)');
  console.log('   - Choisir le plan Starter (5$/mois)');
  console.log('\\n2️⃣  Cloner ta voix:');
  console.log('   - Va dans Voice Lab > Instant Voice Cloning');
  console.log('   - Enregistre 1 minute de ta voix');
  console.log('   - Upload et crée ta voix');
  console.log('\\n3️⃣  Récupérer les clés:');
  console.log('   - API Key: Profile > API Key');
  console.log('   - Voice ID: Voice Lab > ta voix > copier l\'ID');
  console.log('\\n4️⃣  Modifier le fichier .env:');
  console.log('   - ELEVENLABS_API_KEY=<ta_clé>');
  console.log('   - ELEVENLABS_VOICE_ID=<voice_id>');
  console.log('\\n5️⃣  Relancer: npm test');
}
console.log('='.repeat(60));

process.exit(allGood ? 0 : 1);
