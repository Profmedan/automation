#!/usr/bin/env node

/**
 * Configuration OAuth LinkedIn
 * Lance un serveur local pour obtenir le token d'accès
 */

require('dotenv').config();
const http = require('http');
const url = require('url');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/auth/linkedin/callback';
const PORT = 3000;

// w_member_social (produit "Share on LinkedIn", déjà accordé à l'application) est
// indispensable pour publier : sans lui, la vidéo et /partager sont refusés.
const SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social'
];

const TOKEN_PATH = path.join(__dirname, 'linkedin-token.json');

/**
 * Génère l'URL d'autorisation LinkedIn
 */
function getAuthUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    state: Math.random().toString(36).substring(7) // CSRF protection
  });
  
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

/**
 * Échange le code d'autorisation contre un token d'accès
 */
async function exchangeCodeForToken(code) {
  try {
    const response = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('❌ Erreur échange code:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Récupère les infos du profil LinkedIn
 */
async function getProfile(accessToken) {
  try {
    const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Erreur récupération profil:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Lance le serveur OAuth
 */
function startOAuthServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true);
      
      if (parsedUrl.pathname === '/auth/linkedin/callback') {
        const { code, error, error_description } = parsedUrl.query;
        
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>❌ Erreur d'authentification</h1>
                <p>${error}: ${error_description}</p>
                <p>Vous pouvez fermer cette fenêtre.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }
        
        if (code) {
          try {
            console.log('✅ Code d\'autorisation reçu');
            console.log('🔄 Échange du code contre un token...');
            
            const tokenData = await exchangeCodeForToken(code);
            
            console.log('✅ Token d\'accès obtenu !');
            console.log('👤 Récupération du profil...');
            
            const profile = await getProfile(tokenData.access_token);
            
            // Sauvegarde du token
            const tokenInfo = {
              access_token: tokenData.access_token,
              expires_in: tokenData.expires_in,
              scope: tokenData.scope,
              token_type: tokenData.token_type,
              created_at: Date.now(),
              profile: profile
            };
            
            await fs.writeFile(TOKEN_PATH, JSON.stringify(tokenInfo, null, 2), { mode: 0o600 });
            await fs.chmod(TOKEN_PATH, 0o600);

            console.log('✅ Token sauvegardé dans:', TOKEN_PATH);
            if (!/(^|[\s,])w_member_social($|[\s,])/.test(tokenInfo.scope || '')) {
              console.log('⚠️  Permission w_member_social non accordée : publication LinkedIn impossible. Vérifie "Share on LinkedIn" dans l\'application LinkedIn.');
            }
            if (profile) {
              console.log(`👤 Connecté en tant que: ${profile.name} (${profile.email})`);
            }
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h1 style="color: #0077B5;">✅ Authentification LinkedIn réussie !</h1>
                  ${profile ? `<p>Connecté en tant que <strong>${profile.name}</strong></p>` : ''}
                  <p>Vous pouvez fermer cette fenêtre.</p>
                  <p style="color: #666; margin-top: 30px;">Token sauvegardé. Vous pouvez maintenant publier des vidéos sur LinkedIn.</p>
                </body>
              </html>
            `);
            
            server.close();
            resolve(tokenInfo);
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>❌ Erreur</h1>
                  <p>${error.message}</p>
                  <p>Vous pouvez fermer cette fenêtre.</p>
                </body>
              </html>
            `);
            server.close();
            reject(error);
          }
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(PORT, () => {
      console.log(`\n🔐 Configuration OAuth LinkedIn\n`);
      console.log(`Serveur local démarré sur http://localhost:${PORT}`);
      console.log(`Scopes demandés: ${SCOPES.join(', ')}\n`);
      
      const authUrl = getAuthUrl();
      console.log('🌐 Ouvrez cette URL dans votre navigateur:\n');
      console.log('\x1b[36m%s\x1b[0m', authUrl);
      console.log('\n⏳ En attente de l\'autorisation...\n');
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Le port ${PORT} est déjà utilisé.`);
        console.error('Fermez l\'application qui l\'utilise ou changez le port.');
      } else {
        console.error('❌ Erreur serveur:', err.message);
      }
      reject(err);
    });
  });
}

// Vérification configuration
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Configuration manquante !');
  console.error('Vérifiez que LINKEDIN_CLIENT_ID et LINKEDIN_CLIENT_SECRET sont dans .env');
  process.exit(1);
}

// Lancement
console.log('🚀 Démarrage de l\'authentification LinkedIn...');

startOAuthServer()
  .then((tokenInfo) => {
    console.log('\n✅ Configuration terminée avec succès !');
    console.log(`\n📝 Token valide jusqu'au: ${new Date(tokenInfo.created_at + tokenInfo.expires_in * 1000).toLocaleString('fr-FR')}`);
    console.log('\n💡 Vous pouvez maintenant publier des vidéos sur LinkedIn avec le script principal.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Échec de la configuration:', error.message);
    process.exit(1);
  });
