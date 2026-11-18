#!/usr/bin/env node

/**
 * Publication automatique sur LinkedIn
 * Upload vidéo + création post avec légende
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const { createReadStream, statSync } = require('fs');
const path = require('path');

// Même version que le partage des articles ; surcharge possible dans .env.
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || '202610';

const TOKEN_PATH = path.join(__dirname, '..', 'linkedin-token.json');

/**
 * Charge le token LinkedIn
 */
async function loadToken() {
  try {
    const tokenData = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));
    
    // Vérifier expiration
    const expiresAt = tokenData.created_at + (tokenData.expires_in * 1000);
    if (Date.now() >= expiresAt) {
      throw new Error('Token LinkedIn expiré. Relancez l\'authentification.');
    }
    
    return tokenData.access_token;
  } catch (error) {
    console.error('❌ Erreur chargement token:', error.message);
    throw error;
  }
}

/**
 * Récupère l'ID du profil LinkedIn (person URN)
 */
async function getPersonURN(accessToken) {
  try {
    const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    // Le sub contient l'ID utilisateur
    return `urn:li:person:${response.data.sub}`;
  } catch (error) {
    console.error('❌ Erreur récupération profil:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Initialise l'upload vidéo sur LinkedIn
 * Retourne l'asset URN et l'upload URL
 */
async function initializeVideoUpload(accessToken, personURN, videoPath) {
  const stats = statSync(videoPath);
  const fileSizeBytes = stats.size;
  
  console.log(`📤 Initialisation upload (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB)...`);
  
  try {
    const response = await axios.post(
      'https://api.linkedin.com/rest/videos?action=initializeUpload',
      {
        initializeUploadRequest: {
          owner: personURN,
          fileSizeBytes: fileSizeBytes,
          uploadCaptions: false,
          uploadThumbnail: false
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': LINKEDIN_API_VERSION,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    
    const { value } = response.data;
    
    return {
      videoURN: value.video,
      uploadInstructions: value.uploadInstructions,
      uploadToken: value.uploadToken || ''
    };
  } catch (error) {
    console.error('❌ Erreur initialisation upload:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Upload la vidéo vers LinkedIn (multi-part)
 * Retourne les ETags de chaque part
 */
async function uploadVideo(uploadInstructions, videoPath) {
  console.log(`📹 Upload de la vidéo en ${uploadInstructions.length} part(s)...`);
  
  const videoBuffer = await fs.readFile(videoPath);
  const uploadedPartIds = [];
  
  for (let i = 0; i < uploadInstructions.length; i++) {
    const instruction = uploadInstructions[i];
    const start = instruction.firstByte;
    const end = instruction.lastByte + 1; // lastByte is inclusive
    const chunk = videoBuffer.slice(start, end);
    
    console.log(`  Part ${i + 1}/${uploadInstructions.length}: bytes ${start}-${instruction.lastByte} (${(chunk.length / 1024 / 1024).toFixed(2)} MB)`);
    
    try {
      const response = await axios.put(instruction.uploadUrl, chunk, {
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      
      const etag = response.headers.etag || response.headers['etag'];
      if (etag) {
        // Remove quotes from etag if present
        uploadedPartIds.push(etag.replace(/"/g, ''));
        console.log(`  ✅ Part ${i + 1} uploadée (etag: ${etag})`);
      } else {
        console.log(`  ✅ Part ${i + 1} uploadée (pas d'etag)`);
        uploadedPartIds.push('');
      }
    } catch (error) {
      const errData = error.response?.data;
      const errMsg = typeof errData === 'string' ? errData.substring(0, 200) : JSON.stringify(errData);
      console.error(`  ❌ Erreur upload part ${i + 1}:`, error.response?.status, errMsg || error.message);
      throw error;
    }
  }
  
  console.log('✅ Toutes les parts uploadées !');
  return uploadedPartIds;
}

/**
 * Finalise l'upload vidéo
 */
async function finalizeVideoUpload(accessToken, videoURN, uploadToken, uploadedPartIds) {
  console.log('🔄 Finalisation upload...');
  
  try {
    await axios.post(
      'https://api.linkedin.com/rest/videos?action=finalizeUpload',
      {
        finalizeUploadRequest: {
          video: videoURN,
          uploadToken: uploadToken,
          uploadedPartIds: uploadedPartIds
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': LINKEDIN_API_VERSION,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    
    console.log('✅ Upload finalisé !');
  } catch (error) {
    console.error('❌ Erreur finalisation:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Crée un post LinkedIn avec la vidéo
 */
async function createPost(accessToken, personURN, videoURN, caption, articleUrl) {
  console.log('📝 Création du post LinkedIn...');
  
  try {
    const response = await axios.post(
      'https://api.linkedin.com/rest/posts',
      {
        author: personURN,
        commentary: caption,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        content: {
          media: {
            title: 'Vidéo LinkedIn',
            id: videoURN
          }
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': LINKEDIN_API_VERSION,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    
    const postId = response.headers['x-restli-id'] || response.data.id || response.headers['x-linkedin-id'];
    const postUrl = postId ? `https://www.linkedin.com/feed/update/${postId}` : '(URL non disponible - post créé)';
    
    console.log('✅ Post créé:', postUrl);
    
    return { postUrl, postId };
  } catch (error) {
    console.error('❌ Erreur création post:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Publie une vidéo sur LinkedIn
 * @param {string} videoPath - Chemin local de la vidéo MP4
 * @param {Object} metadata - {title, caption, hashtags, articleUrl}
 * @returns {string} - URL du post LinkedIn
 */
async function publishToLinkedIn(videoPath, metadata) {
  console.log('\n🚀 Publication LinkedIn\n');
  
  try {
    // 1. Charger le token
    const accessToken = await loadToken();
    console.log('✅ Token chargé');
    
    // 2. Récupérer l'URN du profil
    const personURN = await getPersonURN(accessToken);
    console.log(`✅ Profil: ${personURN}`);
    
    // 3. Initialiser l'upload
    const { videoURN, uploadInstructions, uploadToken } = await initializeVideoUpload(accessToken, personURN, videoPath);
    console.log(`✅ Video URN: ${videoURN}`);
    console.log(`📋 ${uploadInstructions.length} part(s) à uploader`);
    
    // 4. Upload la vidéo (multi-part)
    const uploadedPartIds = await uploadVideo(uploadInstructions, videoPath);
    
    // 5. Finaliser l'upload
    await finalizeVideoUpload(accessToken, videoURN, uploadToken, uploadedPartIds);
    
    // 6. Attendre que LinkedIn traite la vidéo (30s)
    console.log('⏳ Attente traitement vidéo LinkedIn (30s)...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // 7. Créer le post (lien article intégré dans la légende)
    const blogLink = metadata.blogUrl || metadata.articleUrl || '';
    const captionParts = [metadata.caption];
    if (blogLink) {
      captionParts.push(`\n📖 Article complet : ${blogLink}`);
    }
    captionParts.push(`\n${metadata.hashtags.join(' ')}`);
    const caption = captionParts.join('\n');
    const { postUrl, postId } = await createPost(accessToken, personURN, videoURN, caption, metadata.articleUrl);
    
    // 8. Ajouter le commentaire avec lien blog + processus automatisé + coûts
    if (postId) {
      const blogLink = metadata.blogUrl || metadata.articleUrl || '';
      const commentText = `${blogLink ? `📖 Article complet : ${blogLink}\n\n` : ''}🤖 Cette vidéo a été entièrement générée par l'IA — voici comment.

Après ma programmation initiale sur OpenClaw (orchestrateur IA open-source) + Claude (Anthropic), voici le processus automatisé qui tourne 1× par jour :

1️⃣ Veille automatique — Extraction des newsletters IA (TLDR AI, Rundown AI, Superhuman, The Futurist, TAAFT...) depuis Gmail + recherche web (SerpAPI)
2️⃣ Rédaction — Article de fond généré par GPT-4o à partir des vraies sources, avec plan SEO optionnel
3️⃣ Image blog — Illustration créée par DALL-E 3 ou deAPI.ai (FLUX), hébergée sur ImgBB
4️⃣ Approbation article — Preview sur Telegram : approuver, rejeter, regénérer sur nouveau sujet, ou regénérer avec mon propre prompt/plan SEO
5️⃣ Publication blog — Publié sur Blogger + sauvegarde Google Drive + email
6️⃣ Script vidéo — Scénario 18 scènes généré par GPT-4o, fidèle aux faits/chiffres/noms de l'article
7️⃣ Narration — Texte généré par Claude Haiku (Anthropic), 350 mots minimum
8️⃣ Voix-off — Narration avec ma voix clonée via ElevenLabs
9️⃣ Images vidéo — Visuels générés par DALL-E 3 + Fal.ai (FLUX Schnell), ou remplacés par mes propres photos/vidéos via Telegram
🔟 Montage — Vidéo assemblée avec sous-titres automatiques (Whisper) via ffmpeg
1️⃣1️⃣ Approbation vidéo — Preview sur Drive, j'approuve ou je remplace des scènes depuis mon iPhone
1️⃣2️⃣ Publication LinkedIn — Uniquement après approbation explicite

💰 Coût par vidéo : ~0.35$
- GPT-4o (article + script) : ~0.08$
- DALL-E 3 / deAPI.ai (image blog + images vidéo) : ~0.18$
- ElevenLabs (voix-off) : ~0.09$

Abonnements : Claude Pro (~14.5€/mois) + OpenAI (~20$/mois)

⚠️ Bugs résolus : narration parasite corrigée, veille web remplacée par SerpAPI, approbation vidéo rendue obligatoire, anti-doublon renforcé.

✅ Système stable et opérationnel.`;
      await addComment(accessToken, postId, commentText);
    }
    
    console.log('\n✅ PUBLICATION RÉUSSIE !');
    console.log(`🔗 ${postUrl}\n`);
    
    return { postUrl, postId };
    
  } catch (error) {
    console.error('\n❌ Échec publication LinkedIn:', error.message);
    throw error;
  }
}

/**
 * Ajoute un commentaire sous un post LinkedIn
 * Essaie d'abord l'API v2 (legacy), puis REST si échec
 */
async function addComment(accessToken, postURN, commentText) {
  console.log('💬 Ajout du commentaire...');
  
  const personURN = await getPersonURN(accessToken);
  
  // Stratégie 1: API v2 legacy (socialActions)
  try {
    console.log('   Tentative API v2 legacy...');
    await axios.post(
      `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postURN)}/comments`,
      {
        actor: personURN,
        message: {
          text: commentText
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    console.log('✅ Commentaire ajouté (v2) !');
    return;
  } catch (error) {
    console.error('   ⚠️ API v2:', error.response?.status, error.response?.data?.message || error.message);
  }

  // Stratégie 2 : API REST avec la version configurée
  try {
    console.log(`   Tentative REST API v${LINKEDIN_API_VERSION}...`);
    await axios.post(
      'https://api.linkedin.com/rest/socialActions/' + encodeURIComponent(postURN) + '/comments',
      {
        actor: personURN,
        message: {
          text: commentText
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': LINKEDIN_API_VERSION,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    console.log('✅ Commentaire ajouté (REST) !');
    return;
  } catch (error) {
    console.error('   ⚠️ REST:', error.response?.status, error.response?.data?.message || error.message);
  }

  // Stratégie 3: API comments dédiée
  try {
    console.log('   Tentative API /rest/comments...');
    await axios.post(
      'https://api.linkedin.com/rest/comments',
      {
        actor: personURN,
        parentComment: postURN,
        message: {
          text: commentText
        },
        object: postURN
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': LINKEDIN_API_VERSION,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    console.log('✅ Commentaire ajouté (comments API) !');
    return;
  } catch (error) {
    console.error('   ⚠️ Comments API:', error.response?.status, error.response?.data?.message || error.message);
    console.log('   ❌ Toutes les stratégies de commentaire ont échoué');
    console.log('   ℹ️  Le lien blog est inclus dans la légende du post');
  }
}

module.exports = { publishToLinkedIn, addComment, loadToken };

// CLI
if (require.main === module) {
  const videoPath = process.argv[2];
  const metadataPath = process.argv[3];
  
  if (!videoPath || !metadataPath) {
    console.error('Usage: node linkedin-publisher.js <video.mp4> <metadata.json>');
    process.exit(1);
  }
  
  (async () => {
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    await publishToLinkedIn(videoPath, metadata);
  })();
}
