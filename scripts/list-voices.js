#!/usr/bin/env node

/**
 * Liste toutes les voix disponibles dans ElevenLabs
 */

require('dotenv').config();
const { listVoices } = require('./generate-voiceover');

(async () => {
  try {
    console.log('🎤 Récupération des voix ElevenLabs...\n');
    
    const voices = await listVoices();
    
    console.log(`Trouvé ${voices.length} voix:\n`);
    
    voices.forEach(voice => {
      console.log(`📢 ${voice.name}`);
      console.log(`   ID: ${voice.voice_id}`);
      console.log(`   Catégorie: ${voice.category || 'N/A'}`);
      console.log(`   Description: ${voice.labels?.description || 'N/A'}`);
      console.log('');
    });
    
    console.log('💡 Pour utiliser une voix, copie son ID dans .env (ELEVENLABS_VOICE_ID)');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
})();
