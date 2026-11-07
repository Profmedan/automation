# Mise à jour système vidéo dynamique

> Convention : `$WORKSPACE_ROOT` = chemin de ton workspace (défini dans `.env`).

## 🎉 Nouveautés (16 février 2026 - 18h40)

### ✅ Ce qui a changé

**1. Génération script dynamique**
- ❌ Ancien : 4-5 plans longs (15-25s chacun)
- ✅ Nouveau : 18-25 micro-plans courts (3-5s chacun)
- Changement de plan toutes les 3-5s max
- Rythme soutenu, viral, engageant

**2. Images variées**
- ✅ DALL-E 3 pour plans clés (1 sur 3)
- ✅ Unsplash pour images stock (optionnel, gratuit)
- ✅ Alternance pour variété visuelle max

**3. Texte overlay optimisé**
- ✅ Texte court (max 10 mots par plan)
- ✅ Superposé sur images
- ✅ Contraste élevé (fond sombre)
- ✅ Police grande et lisible

**4. Sous-titres automatiques**
- ✅ Génération via Whisper (OpenAI)
- ✅ Brûlés dans la vidéo
- ✅ SEO + Accessibilité

**5. Types de plans variés**
- Hook (accroche choc 3s)
- Stat (gros chiffre)
- Visual (image conceptuelle)
- Quote (citation)
- Split (comparaison)
- CTA (appel à l'action)

### 📁 Fichiers créés/modifiés

**Nouveaux :**
- `scripts/generate-script-dynamic.js` - Génération micro-plans
- `scripts/fetch-images.js` - Récupération images (DALL-E + Unsplash)
- `scripts/render-video-dynamic.js` - Render avec images + sous-titres
- `UPDATES.md` - Ce fichier

**Modifiés :**
- `generate-video.js` - Utilise nouveau système
- `.env` - Ajout UNSPLASH_ACCESS_KEY

### 💰 Coût par vidéo

**Avant (slideshow statique) :** ~$0
**Après (dynamique avec images) :**
- DALL-E : 6-8 images × $0.10 = **$0.60-0.80**
- Whisper : Gratuit
- Unsplash : Gratuit
- **Total : ~$0.60-0.80 par vidéo**

Pour 4 vidéos/jour : **~$2.40-3.20/jour** = **~$75-100/mois**

### 🚀 Utilisation

**Génération normale (automatique) :**
```bash
npm run from-drive
```

**Test sur article existant :**
```bash
cd "$WORKSPACE_ROOT/linkedin-video-automation"
node generate-video.js
```

### 🎯 Optimisations SEO

1. **Sous-titres brûlés** → LinkedIn favorise
2. **Changements fréquents** → Meilleur engagement
3. **Texte lisible** → Watch time plus long
4. **Miniature attractive** → Plus de clics
5. **Hashtags optimisés** → Meilleure découverte

### ⚙️ Configuration Unsplash (optionnel)

Unsplash est utilisé en complément de DALL-E pour réduire les coûts et augmenter la variété.

**Si tu veux l'activer :**
1. Va sur https://unsplash.com/developers
2. Crée une app (gratuit, 50 req/h)
3. Copie ton Access Key
4. Ajoute dans `.env` : `UNSPLASH_ACCESS_KEY=ta_clé`

**Sans Unsplash :**
- Le système fonctionne quand même
- Utilise DALL-E + fonds colorés
- Coût légèrement plus élevé (~$1/vidéo)

### 🎬 Prochains tests

1. Générer vidéo test avec nouveau système
2. Vérifier rythme et qualité visuelle
3. Ajuster si nécessaire (durées, texte, couleurs)
4. Valider avant automatisation complète

---

**Dernière mise à jour :** 2026-02-16 18:40
