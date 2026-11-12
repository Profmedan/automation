// Règle du 12 nov. 2026 : aucun service payant sauf Claude ; ce script ancien est désactivé.
require('./scripts/local/services-payants').refuser('OpenAI (test)');
require('dotenv').config();
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

(async () => {
  try {
    console.log('🔑 API Key:', process.env.OPENAI_API_KEY ? '✅' : '❌');
    console.log('📝 Appel OpenAI...');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: 'Réponds uniquement avec: OK'
      }],
      max_tokens: 10
    });
    
    console.log('✅ Réponse:', response.choices[0].message.content);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
})();
