require('dotenv').config();
const { addComment, loadToken } = require('./scripts/linkedin-publisher.js');

const postId = 'urn:li:ugcPost:7433184277007085568';
const commentText = '📖 Article complet : https://newseconomiques.blogspot.com/2026/02/leveil-des-travailleurs-numeriques.html';

(async () => {
  try {
    console.log(`💬 Ajout commentaire sur le post...`);
    const accessToken = await loadToken();
    
    await addComment(accessToken, postId, commentText);
    
    console.log(`✅ Commentaire ajouté !`);
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
    process.exit(1);
  }
})();
