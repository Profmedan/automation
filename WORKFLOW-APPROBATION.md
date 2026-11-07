# Workflow d'Approbation Vidéo LinkedIn

## Vue d'ensemble

Chaque vidéo générée nécessite une **approbation manuelle** avant publication LinkedIn.

> Convention : `$WORKSPACE_ROOT` = chemin de ton workspace (défini dans `.env`).

## Étapes automatiques

1. **Article publié** sur Blogger (cron 8h/12h/16h/20h)
2. **Vidéo générée** automatiquement :
   - Script vidéo (ChatGPT)
   - Voix-off (ElevenLabs avec voix clonée)
   - Métadonnées LinkedIn
3. **Notification Telegram** envoyée avec résumé
4. **Statut** : `pending_approval`

## Fichiers générés

Chaque vidéo crée un dossier `linkedin-videos/YYYY-MM-DDTHH-MM-SS/` contenant :

```
📁 2026-02-16T10-21-14/
├── voiceover.mp3       # Audio généré (voix clonée)
├── script.json         # Script vidéo détaillé
├── metadata.json       # Légende + hashtags LinkedIn
├── source.json         # Lien article Drive source
├── status.json         # État d'approbation
└── video.json          # Config vidéo (render futur)
```

## Format de notification

```
🎥 NOUVELLE VIDÉO LINKEDIN PRÊTE

ID: `2026-02-16T10-21-14`

Article source:
[Titre de l'article]
[URL Google Drive]

Légende LinkedIn:
[Texte de la légende générée]

Hashtags: #IA #Innovation #Tech

Fichiers générés:
📁 /path/to/folder
🎙️ voiceover.mp3 (547 KB)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMANDES D'APPROBATION:

✅ `approuve 2026-02-16T10-21-14` - Publier sur LinkedIn
✏️ `modifie 2026-02-16T10-21-14 légende: [texte]` - Modifier la légende
❌ `rejette 2026-02-16T10-21-14` - Archiver sans publier
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏳ Status: En attente d'approbation
```

## Commandes disponibles

### 1. Approuver directement

```
approuve 2026-02-16T10-21-14
```

→ Publie immédiatement sur LinkedIn avec les métadonnées générées.

### 2. Modifier puis approuver

```
modifie 2026-02-16T10-21-14 légende: Voici ma nouvelle légende personnalisée avec des corrections.
```

→ Met à jour `metadata.json`, puis :

```
approuve 2026-02-16T10-21-14
```

→ Publie avec la légende modifiée.

### 3. Rejeter

```
rejette 2026-02-16T10-21-14
```

→ Archive la vidéo, change le statut en `rejected`, ne publie pas.

## États du statut.json

```json
{
  "status": "pending_approval",  // État actuel
  "created_at": "2026-02-16T10:21:14Z",
  "approved_at": null,
  "published_at": null,
  "rejected_at": null,
  "modifications": []  // Historique des modifications
}
```

**États possibles :**
- `pending_approval` : En attente de décision
- `approved` : Approuvé, prêt pour publication
- `published` : Publié sur LinkedIn
- `rejected` : Rejeté, archivé

## Traçabilité

Chaque modification est loggée dans `status.json` :

```json
{
  "modifications": [
    {
      "type": "caption",
      "old": "Ancienne légende...",
      "new": "Nouvelle légende...",
      "timestamp": "2026-02-16T11:15:00Z"
    }
  ]
}
```

## Implémentation future

**Publication LinkedIn API** (TODO) :
- Upload vidéo via LinkedIn API
- Post avec légende + hashtags
- Mise à jour `status.json` → `published`

## Automatisation complète (à activer)

Une fois le système validé, on pourra activer :

1. **Génération automatique** après chaque article blog
2. **Notification Telegram** automatique
3. **Approbation** via commandes Telegram
4. **Publication LinkedIn** automatique après approbation

**Commande de test manuel :**
```bash
cd "$WORKSPACE_ROOT/linkedin-video-automation"
npm run from-drive
```

---

**Dernière mise à jour :** 2026-02-16
