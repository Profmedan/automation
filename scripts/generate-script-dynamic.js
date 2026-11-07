const { jsonrepair } = require('jsonrepair');

async function generateVideoScript(article) {
  const prompt = `LANGUE : Rédige OBLIGATOIREMENT en français.

Tu es un journaliste vidéo LinkedIn avec 10 millions d'abonnés. Tes vidéos cartonnent parce qu'elles provoquent une émotion dès la première seconde et donnent envie de lire l'article complet.

SUJET : ${article.title}
CONTENU SOURCE COMPLET (utilise TOUS les faits, chiffres, noms, anecdotes ci-dessous) :
${article.content}

STRUCTURE NARRATIVE EN 18 SCÈNES (OBLIGATOIRE) :

Scènes 1-2 — HOOK CHOC (3s chacune)
→ Commence par LE fait le plus stupéfiant de l'article. Pas d'introduction. Direct.
→ Une stat impossible à ignorer OU une affirmation qui choque OU une question qui dérange

Scènes 3-5 — TENSION (4s chacune)
→ Pourquoi c'est important MAINTENANT pour le spectateur
→ Vouvoiement strict : "vous", jamais "tu"

Scènes 6-13 — DÉVELOPPEMENT (4-5s chacune)
→ Les faits réels de l'article, dans l'ordre de l'histoire
→ Chaque scène = une idée. Pas deux.
→ Alterne : fait concret → implication → fait concret → implication

Scènes 14-16 — RÉVÉLATION (4s chacune)
→ L'angle que personne n'a vu. La conséquence inattendue.
→ "Ce que personne ne dit..." / "Le vrai problème c'est..."

Scènes 17-18 — FIN OUVERTE + APPEL À L'ACTION (3-4s chacune)
→ Donne envie de lire l'article complet
→ Une question sans réponse. Pas de conclusion morale.
→ "Et vous, êtes-vous prêt ?"

LONGUEUR OBLIGATOIRE : La narration doit faire MINIMUM 800 mots et 90 secondes. Développe chaque scène avec suffisamment de détails.

RÈGLES ABSOLUES DE FIDÉLITÉ À L'ARTICLE :
- OBLIGATOIRE : utiliser les noms réels (personnes, entreprises, produits) mentionnés dans l'article
- OBLIGATOIRE : reprendre les chiffres précis de l'article (%, €, dates, volumes)
- OBLIGATOIRE : reprendre les anecdotes et exemples concrets de l'article
- INTERDIT : inventer des faits, chiffres ou exemples absents de l'article
- INTERDIT : généraliser quand l'article donne des détails précis

RÈGLES ABSOLUES NARRATION :
- Maximum 10 mots par phrase parlée
- Rythme : courte. pause. longue — courte. pause.
- Zéro jargon technique sans explication immédiate
- OBLIGATOIRE : vouvoiement strict — "vous", jamais "tu" ni "toi" ni "ton" ni "ta"
- La narration doit DONNER ENVIE de lire l'article — pas le résumer entièrement

RÈGLES VISUELS (imagePrompt en anglais) :
- JAMAIS de texte dans l'image — NO TEXT, NO WORDS, NO LETTERS dans le prompt
- Chaque scène doit avoir un imagePrompt UNIQUE et différent des autres
- Cinématographique et concret : "extreme close-up of human eye reflecting data streams, dramatic lighting, 8K"
- Jamais générique : pas "technology concept", pas "innovation background", pas "professional image"
- Chaque image renforce émotionnellement la narration de sa scène spécifique
- Alterne obligatoirement : visage humain expressif / objet technique macro / lieu réel / données visuelles
- Ajoute toujours : "no text, no words, no letters, no writing" à chaque imagePrompt

Réponds EN JSON UNIQUEMENT :
{
  "title": "${article.title}",
  "hook": "6 mots maximum — choc immédiat",
  "keyPoints": ["fait choc 1", "fait choc 2", "fait choc 3"],
  "scenes": [
    {
      "id": 1,
      "narration": "voix-off max 10 mots, vouvoiement, ton direct et professionnel",
      "duration": 4,
      "visualType": "hook|tension|story|reveal|cta|close",
      "imagePrompt": "cinematic description in english, photorealistic, specific"
    }
  ],
  "narration": "narration complète MINIMUM 90 secondes — au moins 800 mots — conversationnel, rythmé, donne envie de lire l'article",
  "duration": 72,
  "hashtags": ["#IA", "#Innovation", "#Tech"]
}`;

  console.log('⏱️  Appel Claude Haiku lancé...');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: 'Tu es un expert vidéo LinkedIn viral. Réponds TOUJOURS en JSON valide uniquement, sans markdown, sans backticks.',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API erreur ${response.status}: ${err}`);
  }

  console.log('✅ Réponse reçue');

  const data = await response.json();
  let raw = data.content[0].text;
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();

  let scriptData;
  try {
    scriptData = JSON.parse(raw);
  } catch (err) {
    console.warn('⚠️  JSON principal invalide, tentative jsonrepair...');
    try {
      scriptData = JSON.parse(jsonrepair(raw));
    } catch (repairErr) {
      console.warn('⚠️  jsonrepair insuffisant, tentative de découpe manuelle...');
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const fallback = raw.substring(firstBrace, lastBrace + 1);
        try {
          scriptData = JSON.parse(jsonrepair(fallback));
        } catch (innerErr) {
          console.error('❌ Réponse Claude non parsable (extrait) :\n', fallback.slice(0, 2000));
          throw innerErr;
        }
      } else {
        console.error('❌ Réponse Claude non parsable :\n', raw);
        throw repairErr;
      }
    }
  }

  if (!scriptData.scenes || scriptData.scenes.length < 12) {
    console.warn(`⚠️  Script court: ${scriptData.scenes?.length || 0} plans`);
  }

  // Générer la narration avec Claude Haiku (meilleur rapport qualité/prix)
  console.log('🎙️  Génération narration avec Claude Haiku...');
  const sceneSummary = scriptData.scenes.map((s, i) => `Scène ${i+1} (${s.visualType}): ${s.narration}`).join('\n');
  
  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Tu es un narrateur professionnel pour vidéos LinkedIn. 
        
Rédige une narration fluide et naturelle pour une vidéo de 90 secondes sur : "${scriptData.title}"

Structure des scènes :
${sceneSummary}

RÈGLES ABSOLUES :
- Vouvoiement strict (vous, jamais tu)
- OBLIGATOIRE : conserver TOUS les noms propres, chiffres et exemples concrets du script
- INTERDIT : remplacer un exemple concret par une généralité
- INTERDIT : supprimer un chiffre ou un nom réel présent dans le script
- Minimum ABSOLU : 350 mots — chaque scène développée avec 2-3 phrases riches
- Français parfait, zéro anglicisme
- Phrases courtes et rythmées, 10-15 mots maximum par phrase
- Ton direct, engageant, professionnel
- Transitions naturelles entre les scènes
- Durée cible : 100-110 secondes (environ 350-400 mots à voix normale)
- MINIMUM ABSOLU : 350 mots — développe chaque point avec 2-3 phrases riches en détails concrets
- Donner envie de lire l'article complet à la fin

Réponds UNIQUEMENT avec le texte de la narration.
INTERDIT absolument :
- "D'accord", "Bien sûr", "Voici", "Narration :", "Scène X"
- Tout méta-commentaire sur la narration
- Toute indication de mise en scène
- Toute numérotation de scènes
- Toute ponctuation de type [pause], [musique], etc.
Commence directement par le premier mot de la narration.`
      }]
    })
  });

  if (!claudeResponse.ok) {
    const err = await claudeResponse.text();
    console.warn('⚠️  Claude Haiku indisponible, utilisation narration GPT-4o:', err);
  } else {
    const claudeData = await claudeResponse.json();
    let claudeNarration = claudeData.content[0].text.trim();
    // Nettoyer méta-commentaires
    claudeNarration = claudeNarration
      .replace(/^(d'accord|bien sûr|voici|narration\s*:)[^\n]*/gi, '')
      .replace(/scène\s*\d+[^.]*\./gi, '')
      .replace(/\[.*?\]/g, '')
      .replace(/^\n+/, '')
      .trim();
    // Toujours commencer par Bonjour
    if (!claudeNarration.startsWith('Bonjour')) {
      claudeNarration = 'Bonjour. ' + claudeNarration;
    }
    const wordCount = claudeNarration.split(' ').length;
    console.log(`📝 Narration Claude Haiku: ${wordCount} mots`);
    scriptData.narration = claudeNarration;
  }

  if (!scriptData.narration) {
    throw new Error('Narration manquante');
  }

  scriptData.scenes = scriptData.scenes.map(scene => ({
    ...scene,
    duration: Math.min(scene.duration || 4, 5),
    text: (scene.text || '').substring(0, 80),
  }));

  console.log(`✅ Script généré: ${scriptData.scenes.length} plans, ${scriptData.duration}s total`);
  return scriptData;
}

module.exports = { generateVideoScript };
