#!/usr/bin/env node

/**
 * Utilitaires Google Drive
 * - Vérification doublons de thèmes
 * - Upload vidéos et métadonnées
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(__dirname, '..', '..');
const BLOGGER_TOKEN_PATH = process.env.BLOGGER_TOKEN_PATH || path.join(WORKSPACE_ROOT, 'blogger-automation', 'token.json');

/**
 * Initialise le client Drive OAuth2
 */
async function initDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.BLOGGER_CLIENT_ID,
    process.env.BLOGGER_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback'
  );
  
  // Token partagé avec blogger-automation
  const token = JSON.parse(await fs.readFile(BLOGGER_TOKEN_PATH, 'utf-8'));
  oauth2Client.setCredentials(token);
  
  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Liste tous les fichiers du dossier automation sur Drive
 */
async function listDriveFiles() {
  const drive = await initDriveClient();
  const folderId = process.env.DRIVE_FOLDER_ID;
  
  if (!folderId) {
    console.error('❌ DRIVE_FOLDER_ID manquant dans .env');
    return [];
  }
  
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime, webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: 100
    });
    
    return response.data.files || [];
  } catch (error) {
    console.error('❌ Erreur listing Drive:', error.message);
    return [];
  }
}

/**
 * Vérifie si un thème similaire existe déjà
 * @param {string} articleTitle - Titre du nouvel article
 * @returns {Object|null} - Fichier similaire trouvé ou null
 */
async function checkDuplicateTheme(articleTitle) {
  console.log('🔍 Vérification des doublons de thèmes sur Drive...');
  
  const files = await listDriveFiles();
  
  if (files.length === 0) {
    console.log('   ℹ️  Aucun fichier sur Drive, pas de doublon');
    return null;
  }
  
  // Normalisation du titre pour comparaison
  const normalizeTitle = (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 3); // Garde mots significatifs
  };
  
  const newTitleWords = normalizeTitle(articleTitle);
  
  // Recherche de similarité
  for (const file of files) {
    const existingWords = normalizeTitle(file.name);
    
    // Calcul du score de similarité (Jaccard)
    const intersection = newTitleWords.filter(word => existingWords.includes(word));
    const union = [...new Set([...newTitleWords, ...existingWords])];
    const similarity = intersection.length / union.length;
    
    // Seuil de similarité : 50%
    if (similarity >= 0.5) {
      console.log(`   ⚠️  Thème similaire trouvé : "${file.name}" (${Math.round(similarity * 100)}% similaire)`);
      return {
        file,
        similarity
      };
    }
  }
  
  console.log('   ✅ Pas de doublon détecté');
  return null;
}

/**
 * Upload une vidéo + métadonnées sur Drive
 * @param {string} videoPath - Chemin local de la vidéo
 * @param {Object} metadata - Métadonnées (title, script, etc.)
 * @returns {string} - URL Drive de la vidéo uploadée
 */
async function uploadVideoToDrive(videoPath, metadata) {
  console.log('📤 Upload vidéo sur Google Drive...');
  
  const drive = await initDriveClient();
  const folderId = process.env.DRIVE_FOLDER_ID;
  
  if (!folderId) {
    throw new Error('DRIVE_FOLDER_ID manquant dans .env');
  }
  
  try {
    // Génère le nom du fichier : YYYYMMDD_titre
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const titleSlug = metadata.title
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 50);
    const baseName = `${date}_${titleSlug}`;
    
    // 1. Upload la vidéo MP4
    console.log('   📹 Upload vidéo MP4...');
    const videoFile = await drive.files.create({
      requestBody: {
        name: `${baseName}.mp4`,
        parents: [folderId],
        mimeType: 'video/mp4'
      },
      media: {
        mimeType: 'video/mp4',
        body: require('fs').createReadStream(videoPath)
      },
      fields: 'id, webViewLink, webContentLink'
    });
    
    console.log('   ✅ Vidéo uploadée:', videoFile.data.webViewLink);
    
    // 2. Upload les métadonnées (script.json)
    console.log('   📄 Upload métadonnées JSON...');
    const metadataFile = await drive.files.create({
      requestBody: {
        name: `${baseName}_metadata.json`,
        parents: [folderId],
        mimeType: 'application/json'
      },
      media: {
        mimeType: 'application/json',
        body: JSON.stringify(metadata, null, 2)
      },
      fields: 'id, webViewLink'
    });
    
    console.log('   ✅ Métadonnées uploadées:', metadataFile.data.webViewLink);
    
    // 3. Crée un Google Doc récapitulatif
    console.log('   📝 Création Google Doc récapitulatif...');
    
    const docContent = `${metadata.title}

═══════════════════════════════════

🎬 VIDÉO LINKEDIN GÉNÉRÉE
Créée le : ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}

📹 Vidéo MP4 : ${videoFile.data.webViewLink}

📊 STATISTIQUES
- Durée : ${metadata.duration || 'N/A'}s
- Nombre de scènes : ${metadata.scenes?.length || 0}
- Hashtags : ${metadata.hashtags?.join(' ') || 'N/A'}

🎯 POINTS CLÉS
${metadata.keyPoints?.map((point, i) => `${i + 1}. ${point}`).join('\n') || 'N/A'}

📝 LÉGENDE LINKEDIN SUGGÉRÉE
${metadata.caption || 'Voir metadata.json'}

🔗 LIENS
Article source : ${metadata.articleUrl || 'N/A'}
Métadonnées JSON : ${metadataFile.data.webViewLink}
`;
    
    const docFile = await drive.files.create({
      requestBody: {
        name: `${baseName}_recap`,
        parents: [folderId],
        mimeType: 'application/vnd.google-apps.document'
      },
      media: {
        mimeType: 'text/plain',
        body: docContent
      },
      fields: 'id, webViewLink'
    });
    
    console.log('   ✅ Récapitulatif créé:', docFile.data.webViewLink);
    
    return {
      videoUrl: videoFile.data.webViewLink,
      metadataUrl: metadataFile.data.webViewLink,
      recapUrl: docFile.data.webViewLink
    };
    
  } catch (error) {
    console.error('❌ Erreur upload Drive:', error.message);
    throw error;
  }
}

module.exports = {
  listDriveFiles,
  checkDuplicateTheme,
  uploadVideoToDrive
};

// CLI test
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'list') {
    (async () => {
      const files = await listDriveFiles();
      console.log(`\n📁 ${files.length} fichiers sur Drive :\n`);
      files.forEach(file => {
        console.log(`- ${file.name} (${file.mimeType})`);
      });
    })();
  } else if (command === 'check') {
    const title = process.argv[3];
    if (!title) {
      console.error('Usage: node drive-utils.js check "Titre de l\'article"');
      process.exit(1);
    }
    (async () => {
      const duplicate = await checkDuplicateTheme(title);
      if (duplicate) {
        console.log('\n⚠️  Doublon détecté !');
      } else {
        console.log('\n✅ Pas de doublon');
      }
    })();
  } else {
    console.log('Usage:');
    console.log('  node drive-utils.js list                    # Liste les fichiers Drive');
    console.log('  node drive-utils.js check "Titre article"   # Vérifie les doublons');
  }
}
