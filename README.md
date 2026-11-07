# LinkedIn Video Automation

Système d'automatisation de création de vidéos LinkedIn à partir des articles du blog.

## 🎬 Workflow

1. Article blog généré (blogger-automation)
2. Script vidéo créé (ChatGPT)
3. Voix-off générée (ElevenLabs - voix clonée de Pierre)
4. Vidéo créée (Remotion : slides + voix + sous-titres)
5. Notification Telegram avec preview

## 📦 Installation

```bash
npm install
cp .env.example .env
# Remplir les clés API dans .env
```

## 🎤 Setup ElevenLabs

1. Créer compte sur https://elevenlabs.io/
2. Plan Starter (5$/mois)
3. Cloner ta voix (Voice Lab > Instant Voice Cloning)
4. Récupérer API Key + Voice ID

## 🚀 Utilisation

### Génération manuelle
```bash
npm run from-drive -- --article <articleId>
```
- `--article <articleId>` : ID du dossier `pending-articles` (ex: `2026-03-23T13-59-52`).
- `--drive-id <docId>` : option avancée si vous avez directement l’ID Google Docs.
- `--drive-url <url>` : permet de cibler un lien `_Document Google_` spécifique.
- Sans argument, le script retombe sur « dernier document du dossier automation » (mode legacy à éviter).

### Intégration avec automation blog
Le script `watch-articles.js` surveille les nouveaux articles et génère automatiquement les vidéos.

```bash
npm run watch
```

## 📁 Structure

- `generate-video.js` - Script principal de génération
- `scripts/` - Utilitaires (ChatGPT, ElevenLabs, Remotion)
- `video/` - Template Remotion (slides animées)
- `output/` - Vidéos générées

## 🔧 Configuration

Voir `.env.example` pour les variables d'environnement requises.
