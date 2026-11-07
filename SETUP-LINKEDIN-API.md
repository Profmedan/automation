# Configuration API LinkedIn

## Étape 1 : Créer une App LinkedIn

1. Va sur **LinkedIn Developers** : https://www.linkedin.com/developers/apps
2. Clique sur **"Create app"**
3. Remplis les informations :
   - **App name** : `Blog Automation`
   - **LinkedIn Page** : (sélectionne ta page ou profil)
   - **Privacy policy URL** : (si demandé, utilise une URL de ton blog)
   - **App logo** : (optionnel, 100x100px minimum)
4. Accepte les conditions et crée l'app

## Étape 2 : Obtenir les credentials

### Client ID et Client Secret

Dans l'onglet **"Auth"** de ton app :
- **Client ID** : Copie-le
- **Client Secret** : Clique sur "Show", puis copie-le

### Redirect URL

Ajoute cette URL dans **"Redirect URLs"** :
```
http://localhost:3000/auth/linkedin/callback
```

## Étape 3 : Demander les permissions (Products)

Dans l'onglet **"Products"**, demande accès à :

1. **Sign In with LinkedIn using OpenID Connect** (approval instantané)
2. **Share on LinkedIn** (approval instantané)
3. **Advertising API** (optionnel, pour analytics)

Les deux premières sont généralement approuvées instantanément.

## Étape 4 : Vérifier les scopes

Dans l'onglet **"Auth"**, vérifie que tu as ces **OAuth 2.0 scopes** :
- ✅ `openid`
- ✅ `profile`
- ✅ `email`
- ✅ `w_member_social` ← **ESSENTIEL pour publier**

Si `w_member_social` n'apparaît pas, c'est que "Share on LinkedIn" n'est pas activé.

## Étape 5 : Configuration dans .env

Une fois les credentials obtenus, ajoute-les dans `.env` :

```bash
# LinkedIn API
LINKEDIN_CLIENT_ID=ton_client_id_ici
LINKEDIN_CLIENT_SECRET=ton_client_secret_ici
LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/linkedin/callback
```

## Étape 6 : Authentification OAuth

Après avoir configuré `.env`, lance :

```bash
npm run linkedin-auth
```

Cela va :
1. Ouvrir une page d'authentification LinkedIn
2. Te demander d'autoriser l'app
3. Sauvegarder ton token OAuth dans `linkedin-token.json`

**⚠️ Important :** Le token expire après 60 jours. Le système le renouvellera automatiquement.

## Étape 7 : Test de publication

Une fois authentifié, teste avec :

```bash
npm run test-linkedin
```

Cela publiera un post test sur ton profil LinkedIn.

## Notes importantes

### Limites API LinkedIn

- **100 posts par jour** par utilisateur
- **Vidéos max 200 MB**, durée max 10 minutes
- Format vidéo : MP4, MOV, MPEG-1, ou MPEG-2

### Permissions

LinkedIn API nécessite l'autorisation de l'utilisateur (OAuth).
Tu ne peux publier **QUE sur ton propre profil** ou une page dont tu es admin.

### Sécurité

- ❌ Ne commit **JAMAIS** `linkedin-token.json` sur Git
- ❌ Ne partage jamais tes credentials
- ✅ Ajoute `.env` et `linkedin-token.json` dans `.gitignore`

## Dépannage

### "insufficient_permissions"
→ Vérifie que "Share on LinkedIn" est activé dans Products

### "token_expired"
→ Relance `npm run linkedin-auth` pour renouveler

### "invalid_client"
→ Vérifie Client ID et Client Secret dans `.env`

---

**Prêt à configurer ?** Suis les étapes et envoie-moi tes credentials quand tu les as.
