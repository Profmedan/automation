# 🎬 GUIDE DE SETUP - Automatisation Vidéos LinkedIn

## ✅ ÉTAT ACTUEL

**Infrastructure créée :**
- ✅ Dossier projet: `$WORKSPACE_ROOT/linkedin-video-automation`

> Astuce : définis `WORKSPACE_ROOT` dans `.env` (par défaut `/Users/ph/.openclaw/workspace`). Remplace-le dans les commandes ci-dessous selon ton installation.
- ✅ Scripts d'automatisation installés
- ✅ Dépendances npm installées (246 packages)
- ✅ Clé OpenAI configurée
- ✅ Structure de dossiers créée

**En attente :**
- ⏳ Configuration ElevenLabs (clonage vocal)

---

## 🎤 ÉTAPE 1 : SETUP ELEVENLABS (15 min)

### A) Créer ton compte

1. Va sur : **https://elevenlabs.io/**
2. Clique sur "Sign Up" (ou "Get Started")
3. Inscris-toi avec ton email
4. **Choisis le plan "Starter" (5$/mois)**
   - 30,000 caractères/mois
   - Voice cloning inclus
   - Suffisant pour 90 vidéos/mois

### B) Cloner ta voix (IMPORTANT !)

**Texte à lire pour le clonage** (copie-colle) :

\`\`\`
Bonjour, je m'appelle Pierre. Dans mes articles, j'explore l'intelligence artificielle et son impact sur l'économie et la société. Je partage des analyses sur les dernières innovations, les tendances du marché, et les défis que pose cette révolution technologique. Mon objectif est de rendre ces sujets complexes accessibles à tous, en offrant des perspectives concrètes et des exemples pratiques. Que vous soyez entrepreneur, étudiant ou simplement curieux, j'espère que mes contenus vous apporteront des insights utiles pour comprendre et naviguer dans ce monde en transformation.
\`\`\`

**Comment enregistrer :**

**Option 1 : QuickTime (Mac)**
1. Ouvre QuickTime Player
2. Fichier > Nouvel enregistrement audio
3. Clique sur le bouton rouge
4. Lis le texte ci-dessus **naturellement**
5. Stop et sauvegarde (ex: `ma-voix.m4a`)

**Option 2 : iPhone**
1. Ouvre "Mémos vocaux"
2. Enregistre-toi lisant le texte
3. Partage le fichier vers ton Mac (AirDrop)

**Conseils qualité :**
- 🎙️ Parle comme si tu expliquais à un ami
- 🔇 Environnement calme (pas de bruit de fond)
- 📱 Distance micro : 20-30 cm
- ⏱️ Durée : 1 minute minimum

**Upload dans ElevenLabs :**
1. Dans ElevenLabs, va dans **"Voice Lab"** (menu gauche)
2. Clique sur **"Instant Voice Cloning"**
3. Upload ton fichier audio
4. Nom de la voix : **"Pierre_Original"**
5. Description : "Ma voix pour les vidéos LinkedIn"
6. Clique **"Add Voice"**

⏳ L'IA va analyser ta voix (30 secondes)

### C) Récupérer les clés API

**1. API Key :**
1. Clique sur ton profil (en haut à droite)
2. **"Profile"** > **"API Key"**
3. Copie la clé (format: `sk_...`)

**2. Voice ID :**
1. Retourne dans **"Voice Lab"**
2. Trouve ta voix **"Pierre_Original"**
3. Clique sur les **3 petits points** (⋮)
4. **"Voice ID"**
5. Copie l'ID (format: `21m00Tcm4TlvDq8ikWAM` ou similaire)

---

## 🔧 ÉTAPE 2 : CONFIGURATION (2 min)

### Modifier le fichier `.env`

1. Ouvre le fichier :
   \`\`\`bash
   open "$WORKSPACE_ROOT/linkedin-video-automation/.env"
   \`\`\`

2. Remplace les lignes vides :
   \`\`\`env
   ELEVENLABS_API_KEY=<colle_ta_clé_api_ici>
   ELEVENLABS_VOICE_ID=<colle_ton_voice_id_ici>
   \`\`\`

3. Sauvegarde le fichier (⌘S)

### Exemple de fichier `.env` rempli :
\`\`\`env
OPENAI_API_KEY=sk-proj-4N5sONxOKLL...56AA
ELEVENLABS_API_KEY=sk_1234567890abcdefgh
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
BLOGGER_OUTPUT_PATH=$WORKSPACE_ROOT/blogger-automation
VIDEO_OUTPUT_PATH=$WORKSPACE_ROOT/linkedin-videos
\`\`\`

---

## ✅ ÉTAPE 3 : VÉRIFICATION (1 min)

### Teste la configuration :

\`\`\`bash
cd "$WORKSPACE_ROOT/linkedin-video-automation"
npm test
\`\`\`

**Tu dois voir :**
\`\`\`
✅ OpenAI API Key: sk-proj-...
✅ ElevenLabs API Key: sk_...
✅ ElevenLabs Voice ID: 21m...
✅ Configuration complète - Prêt à générer des vidéos !
\`\`\`

Si tout est ✅, **c'est bon !**

---

## 🎬 UTILISATION

### Test manuel (génération d'une vidéo)

Une fois configuré, Arc pourra générer des vidéos automatiquement à partir de tes articles.

**Workflow automatique (après setup) :**

1. Article blog généré (8h, 12h, 16h)
2. Script vidéo créé automatiquement
3. Voix-off générée avec ta voix clonée
4. Vidéo créée (slides + audio + sous-titres)
5. Notification Telegram : "Vidéo prête !"
6. Tu postes sur LinkedIn (30 secondes)

**Durée vidéo :** 90-120 secondes  
**Format :** 1080x1080 (carré, optimisé mobile)  
**Qualité :** Professionnelle avec ta vraie voix

---

## 📊 COÛTS

- **ElevenLabs Starter :** 5$/mois (30k caractères)
- **Capacité :** ~90 vidéos/mois (largement suffisant pour 3/jour)
- **Autres services :** Inclus dans tes abonnements existants (OpenAI)

**Total : 5€/mois**

---

## 🆘 BESOIN D'AIDE ?

Une fois ElevenLabs configuré, dis-moi simplement :

**"C'est configuré"**

Et je :
1. Vérifierai que tout fonctionne
2. Générerai une vidéo test
3. Intégrerai avec ton automation blog existante

---

## 📝 CHECKLIST RAPIDE

- [ ] Compte ElevenLabs créé (plan Starter 5$/mois)
- [ ] Voix clonée ("Pierre_Original")
- [ ] API Key copiée
- [ ] Voice ID copié
- [ ] Fichier .env modifié
- [ ] npm test → tout ✅
- [ ] Prêt à générer des vidéos !

**Temps total setup : ~20 minutes**

---

**Questions ? Dis-moi où tu en es et je t'aide !** 🚀
