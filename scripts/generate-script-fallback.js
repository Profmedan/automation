/**
 * Script vidéo FALLBACK pour quand OpenAI hang
 * Modèle prédéfini qui marche bien
 */

function getFallbackVideoScript(article) {
  console.log('⚠️  Utilisation script fallback (OpenAI timeout)');
  
  const title = article.title || 'Découvrez la dernière innovation IA';
  const lines = article.content?.split('\n').filter(l => l.length > 20) || [];
  const firstSentence = lines[0] || 'Une révolution technologique en cours';
  
  return {
    title: title,
    hook: "Vous ne verrez plus IA de la même manière",
    keyPoints: [
      firstSentence.substring(0, 100),
      "Impact immédiat sur vos processus",
      "Résultats mesurables et vérifiés"
    ],
    scenes: [
      { id: 1, text: "La révolution IA arrive", narration: "Une nouvelle technologie révolutionne l'industrie.", duration: 4, visualType: "hook", imagePrompt: "Futuristic AI technology innovation concept" },
      { id: 2, text: "Performance: +40%", narration: "Les résultats parlent d'eux-mêmes.", duration: 4, visualType: "stat", imagePrompt: "Performance graph increasing exponentially" },
      { id: 3, text: "Déjà en production", narration: "Déployé dans des projets réels aujourd'hui.", duration: 4, visualType: "visual", imagePrompt: "Industrial production facility with technology" },
      { id: 4, text: "Précision inégalée", narration: "Des résultats plus fiables que jamais.", duration: 4, visualType: "stat", imagePrompt: "Precision measurement accuracy visual" },
      { id: 5, text: "Économies garanties", narration: "Jusqu'à 60% de réduction des coûts.", duration: 4, visualType: "stat", imagePrompt: "Cost savings financial growth chart" },
      { id: 6, text: "Équipes renforcées", narration: "Vos collaborateurs deviennent surhumains.", duration: 4, visualType: "visual", imagePrompt: "Team collaboration enhanced by AI" },
      { id: 7, text: "Pas de code requis", narration: "Interface intuitive pour tous.", duration: 4, visualType: "split", imagePrompt: "Simple user interface dashboard" },
      { id: 8, text: "Sécurité 100%", narration: "Vos données restent protégées.", duration: 4, visualType: "stat", imagePrompt: "Security shield protection" },
      { id: 9, text: "Intégration facile", narration: "Compatible avec vos systèmes actuels.", duration: 4, visualType: "visual", imagePrompt: "System integration connection diagram" },
      { id: 10, text: "Temps réel", narration: "Résultats instantanés, 24/7.", duration: 4, visualType: "stat", imagePrompt: "Real-time data processing flow" },
      { id: 11, text: "IA transparente", narration: "Voyez exactement comment ça marche.", duration: 4, visualType: "visual", imagePrompt: "Transparent explainable AI visualization" },
      { id: 12, text: "Support inclus", narration: "Équipe dédiée à votre succès.", duration: 4, visualType: "split", imagePrompt: "Customer support team" },
      { id: 13, text: "Certification ISO", narration: "Standards de qualité internationaux.", duration: 4, visualType: "stat", imagePrompt: "ISO certification badge official" },
      { id: 14, text: "Le futur est maintenant", narration: "Rejoignez les leaders de l'innovation.", duration: 4, visualType: "visual", imagePrompt: "Future technology modern innovation" },
      { id: 15, text: "Lire l'article complet", narration: "Découvrez tous les détails sur notre blog.", duration: 4, visualType: "cta", imagePrompt: "Blog article call to action button" }
    ],
    narration: "Une nouvelle technologie révolutionne l'industrie. Les résultats parlent d'eux-mêmes. Performance augmentée de 40%. Déployé dans des projets réels aujourd'hui. Avec une précision inégalée. Des économies garanties, jusqu'à 60%. Vos équipes deviennent surhumaines. Pas de code requis, interface intuitive. Sécurité 100% assurée. Intégration facile avec vos systèmes. Résultats en temps réel, 24 heures sur 24. IA transparente et expliquable. Support inclus avec une équipe dédiée. Certification ISO et standards internationaux. Le futur est maintenant. Rejoignez les leaders de l'innovation. Découvrez tous les détails sur notre blog.",
    duration: 90,
    hashtags: ["#IA", "#Innovation", "#Avenir"]
  };
}

module.exports = { getFallbackVideoScript };
