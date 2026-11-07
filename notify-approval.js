#!/usr/bin/env node

/**
 * Envoie une notification Telegram pour approbation vidéo LinkedIn
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Génère le message de notification
 */
async function generateNotificationMessage(videoFolder) {
  const metadata = JSON.parse(
    await fs.readFile(path.join(videoFolder, 'metadata.json'), 'utf-8')
  );
  
  const source = JSON.parse(
    await fs.readFile(path.join(videoFolder, 'source.json'), 'utf-8')
  );
  
  const videoId = path.basename(videoFolder);
  
  const message = `🎥 **NOUVELLE VIDÉO LINKEDIN PRÊTE**

**ID:** \`${videoId}\`

**Article source:**
${source.title}
${source.driveUrl}

**Légende LinkedIn:**
${metadata.caption}

**Hashtags:** ${metadata.hashtags.join(' ')}

**Fichiers générés:**
📁 ${videoFolder}
🎙️ voiceover.mp3 (${await getFileSize(path.join(videoFolder, 'voiceover.mp3'))})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Commandes disponibles :*

• \`approuve vidéo ${videoId}\`
• \`rejette vidéo ${videoId}\`
• \`remplace scène X ${videoId}\` + pièce jointe
• \`modifie vidéo ${videoId} légende: [texte]\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏳ Status: En attente d'approbation`;

  return message;
}

/**
 * Obtient la taille d'un fichier formatée
 */
async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const kb = (stats.size / 1024).toFixed(1);
    return `${kb} KB`;
  } catch {
    return 'N/A';
  }
}

/**
 * Crée le fichier de statut
 */
async function createStatusFile(videoFolder) {
  const status = {
    status: 'pending_approval',
    created_at: new Date().toISOString(),
    approved_at: null,
    published_at: null,
    rejected_at: null,
    modifications: []
  };
  
  await fs.writeFile(
    path.join(videoFolder, 'status.json'),
    JSON.stringify(status, null, 2)
  );
}

/**
 * Envoie la notification via OpenClaw message tool
 * (sera appelé par OpenClaw directement)
 */
async function notifyApproval(videoFolder) {
  await createStatusFile(videoFolder);
  const message = await generateNotificationMessage(videoFolder);
  
  console.log('\n📤 NOTIFICATION PRÊTE:\n');
  console.log(message);
  console.log('\n✅ Fichier status.json créé');
  
  return {
    message,
    videoFolder,
    videoId: path.basename(videoFolder)
  };
}

// Export
module.exports = { notifyApproval, generateNotificationMessage, createStatusFile };

// CLI
if (require.main === module) {
  const videoFolder = process.argv[2];
  
  if (!videoFolder) {
    console.error('Usage: node notify-approval.js <video-folder>');
    process.exit(1);
  }
  
  notifyApproval(videoFolder).then(result => {
    console.log('\n✅ Prêt pour envoi via message tool');
  });
}
