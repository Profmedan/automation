# Génération Vidéo Slideshow LinkedIn

## Vue d'ensemble

Système de génération automatique de vidéos LinkedIn au format **slideshow statique** :
- Format : 1080x1080 (carré)
- Slides avec texte superposé
- Audio synchronisé (voix clonée ElevenLabs)
- Transitions entre slides

> Convention : `$WORKSPACE_ROOT` désigne ton répertoire de travail (défini dans `.env`).

## Prérequis

### FFmpeg (obligatoire)

```bash
# macOS
brew install ffmpeg

# Vérifier l'installation
ffmpeg -version
```

### ImageMagick (optionnel, améliore les slides)

```bash
# macOS
brew install imagemagick

# Vérifier
convert -version
```

Si ImageMagick n'est pas disponible, FFmpeg générera des slides de secours (moins jolies mais fonctionnelles).

## Architecture

```
linkedin-video-automation/
├── scripts/
│   ├── render-slideshow.js    # Génération slideshow FFmpeg
│   ├── render-video.js         # Interface principale
│   ├── generate-script.js      # Script vidéo (ChatGPT)
│   └── generate-voiceover.js   # Voix-off (ElevenLabs)
├── fetch-and-generate.js       # Workflow Drive → Vidéo
└── handle-approval.js          # Gestion approbations
```

## Processus de génération

### 1. Génération des slides

Pour chaque scène du script :
- Fond coloré selon le type (`title`, `stat`, `visual`, `quote`, `cta`)
- Texte centré en blanc
- Résolution 1080x1080 PNG

**Types de slides et couleurs :**
- `title` (intro) : Bleu foncé `#1a1a2e`
- `stat` (chiffres) : Bleu marine `#16213e`
- `visual` (description) : Bleu profond `#0f3460`
- `quote` (citation) : Violet `#533483`
- `cta` (appel à l'action) : Rouge/rose `#e94560`

### 2. Assemblage vidéo

FFmpeg combine :
- Les slides (avec durées du script)
- L'audio voix-off
- Output : MP4 H.264 + AAC, 30fps

### 3. Format final

```
2026-02-16T12-00-00/
├── video.mp4          ← Vidéo finale !
├── voiceover.mp3      ← Audio source
├── script.json        ← Script avec durées
├── metadata.json      ← Légende LinkedIn
├── source.json        ← Lien article Drive
└── status.json        ← État d'approbation
```

## Test manuel

### Générer une vidéo depuis Drive

```bash
cd "$WORKSPACE_ROOT/linkedin-video-automation"
npm run from-drive
```

→ Récupère le dernier article Drive et génère la vidéo complète.

### Test du render slideshow seul

```bash
node scripts/render-slideshow.js \
  path/to/script.json \
  path/to/voiceover.mp3 \
  path/to/output.mp4
```

## Personnalisation

### Modifier les couleurs de slides

Éditer `scripts/render-slideshow.js`, section `backgrounds` :

```javascript
const backgrounds = {
  title: '#1a1a2e',    // Votre couleur pour intro
  stat: '#16213e',     // Votre couleur pour stats
  // ...
};
```

### Modifier la police/taille

Dans `generateSlideImage()` :

```javascript
-font Helvetica-Bold -pointsize 60
```

→ Changer `Helvetica-Bold` et `60` (taille)

### Ajuster la résolution

Changer `1080x1080` dans :
- `convert -size 1080x1080`
- `color=c=${bgColor}:s=1080x1080`

## Limitations actuelles

- ❌ Pas d'animations (slides statiques)
- ❌ Pas de transitions sophistiquées
- ❌ Pas de graphiques dynamiques
- ✅ Fonctionne sans dépendances complexes
- ✅ Rapide à générer (~10-20s)
- ✅ Format compatible LinkedIn

## Évolutions futures possibles

1. **Transitions** : Fades/slides entre scènes
2. **Animations** : Texte qui apparaît progressivement
3. **Graphiques** : Intégration de charts pour les stats
4. **Branding** : Logo/watermark automatique
5. **Remotion** : Upgrade vers animations React (complexe)

## Dépannage

### Erreur "ffmpeg not found"
```bash
brew install ffmpeg
```

### Erreur "convert not found"
ImageMagick manquant → Les slides seront générées par FFmpeg (moins jolies mais OK).

### Vidéo trop courte/longue
Vérifier les durées dans `script.json`. Total devrait correspondre à la durée de l'audio.

### Texte coupé sur les slides
Réduire `pointsize` dans `generateSlideImage()` ou raccourcir le texte des scènes.

---

**Dernière mise à jour :** 2026-02-16
**Version :** Slideshow statique v1.0
