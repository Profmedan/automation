#!/usr/bin/env node

/**
 * Envoie la vidéo LinkedIn sur Telegram avec les bons liens
 * Lit automatiquement le dossier vidéo le plus récent
 */

const fs = require('fs').promises;
const path = require('path');

const VIDEO_BASE_DIR = path.join(__dirname, '..', '..', 'linkedin-videos');

/**
 * Trouve le dossier vidéo le plus récent
 */
async function getLatestVideoFolder() {
  const folders = await fs.readdir(VIDEO_BASE_DIR);
  const dated = folders
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}T/))
    .sort()
    .reverse();
  
  return dated[0] ? path.join(VIDEO_BASE_DIR, dated[0]) : null;
}

/**
 * Envoie sur Telegram avec les bons liens
 */
async function sendToTelegram(videoFolder) {
  // Lire les métadonnées
  const metadata = JSON.parse(
    await fs.readFile(path.join(videoFolder, 'metadata.json'), 'utf-8')
  );
  
  // Lire les liens Drive (si disponibles)
  let driveLinks = null;
  try {
    driveLinks = JSON.parse(
      await fs.readFile(path.join(videoFolder, 'drive-links.json'), 'utf-8')
    );
  } catch (e) {
    console.error('⚠️  Liens Drive non trouvés');
  }
  
  // Construire le message
  const message = `🎬 **VIDÉO LINKEDIN GÉNÉRÉE**

📝 **Titre :** ${metadata.title}

${driveLinks ? `🎥 **Vidéo MP4 :**
${driveLinks.videoUrl}

📄 **Récapitulatif :**
${driveLinks.recapUrl}
` : '⚠️ Liens Drive non disponibles'}

📝 **Légende LinkedIn :**

${metadata.caption}

${metadata.hashtags.join(' ')}

🔗 ${metadata.comment}

---

✅ **Approuver** - Dis "approuvé" pour publier
📝 **Modifier** - Dis ce que tu veux changer
❌ **Annuler** - Dis "annulé"`;

  console.log('\n' + message);
  console.log('\n📤 Prêt à envoyer sur Telegram');
  
  return {
    message,
    metadata,
    driveLinks,
    videoPath: metadata.videoPath
  };
}

// Export
module.exports = { getLatestVideoFolder, sendToTelegram };

// CLI
if (require.main === module) {
  (async () => {
    const folder = await getLatestVideoFolder();
    if (!folder) {
      console.error('❌ Aucune vidéo trouvée');
      process.exit(1);
    }
    
    console.log(`📁 Dossier le plus récent: ${path.basename(folder)}`);
    await sendToTelegram(folder);
  })();
}
