/**
 * Génère un script vidéo LinkedIn à partir d'un article
 * Utilise ChatGPT pour créer un résumé engageant de 2 minutes
 */

const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Génère le script vidéo optimisé LinkedIn
 * @param {Object} article - {title, content, url}
 * @returns {Object} Script structuré avec scènes, narration, timing
 */
async function generateVideoScript(article) {
  const prompt = `Tu es un expert en création de contenu LinkedIn. Crée un script vidéo de 90-120 secondes à partir de cet article :

TITRE: ${article.title}

CONTENU:
${article.content.substring(0, 2000)}...

CONTRAINTES:
- Durée: 90-120 secondes max
- Format: Hook (5s) + 3 points clés (25s chacun) + CTA (10s)
- Ton: Professionnel mais accessible, dynamique
- Optimisé mobile: phrases courtes, visuelles

STRUCTURE REQUISE (JSON):
{
  "hook": "Phrase d'accroche percutante (1 phrase, 10-15 mots max)",
  "keyPoints": [
    "Point clé 1 (1 phrase concise)",
    "Point clé 2 (1 phrase concise)",
    "Point clé 3 (1 phrase concise)"
  ],
  "scenes": [
    {
      "id": 1,
      "text": "Hook phrase",
      "narration": "Ce que je dis (version parlée, naturelle)",
      "duration": 5,
      "visualType": "title" | "stat" | "quote" | "cta"
    },
    ... (4-5 scènes total)
  ],
  "narration": "Texte complet de la voix-off",
  "duration": 95
}

IMPORTANT:
- La narration doit être fluide, comme si je parlais naturellement
- Utilise "je", "nous", "vous" pour créer de la proximité
- Évite le jargon, reste accessible
- Inclus 1-2 chiffres/stats si pertinent
- CTA final: renvoyer vers l'article complet

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert en création de scripts vidéo pour LinkedIn. Tu réponds toujours en JSON valide.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const scriptData = JSON.parse(response.choices[0].message.content);
    
    // Validation
    if (!scriptData.scenes || !scriptData.narration) {
      throw new Error('Format de script invalide');
    }

    return scriptData;

  } catch (error) {
    console.error('Erreur génération script:', error.message);
    throw error;
  }
}

module.exports = { generateVideoScript };
