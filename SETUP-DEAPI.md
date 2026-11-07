# Configuration deAPI.ai

> Convention : `$WORKSPACE_ROOT` = chemin de ton workspace (défini dans `.env`).

## Changements effectués

✅ **FINI les slides unicolores !**

Le système génère maintenant **toujours** des images IA, alternant entre :
- **DALL-E 3** : haute qualité, pour titres, CTA, et 1 scène sur 4 (~0.04$/image)
- **deAPI.ai** : économique et photoréaliste pour le reste (~0.0027$/image)

## Obtenir une clé API deAPI.ai

1. Aller sur https://deapi.ai/
2. Créer un compte
3. Aller dans "API Keys" ou "Credentials"
4. Générer une nouvelle clé API
5. Copier la clé (format : `sk_...` ou similaire)

## Configuration

Ajouter la clé dans le fichier `.env` :

```bash
DEAPI_API_KEY=sk_votre_cle_ici
```

## Coûts estimés

Pour une vidéo de 10 scènes :
- 3× DALL-E (~0.12$)
- 7× deAPI.ai (~0.02$)
- **Total : ~0.14$ par vidéo**

Comparé à 100% DALL-E : ~0.40$ par vidéo
**Économie : ~65%**

## Modèles disponibles deAPI.ai

Le code utilise actuellement `flux-1.1-pro`. Vous pouvez changer dans `fetch-images.js` :

- `flux-1.1-pro` : meilleur qualité/vitesse
- `flux-schnell` : ultra-rapide, économique
- `z-image` : alternative

## Test manuel

Tester la génération d'images :

```bash
cd "$WORKSPACE_ROOT/linkedin-video-automation"
node scripts/fetch-images.js <script.json> <output-dir>
```

## En cas d'erreur

Si deAPI.ai échoue, le système :
1. Essaie DALL-E en fallback
2. Retry avec prompt simplifié
3. Lève une erreur si les deux APIs échouent

**Plus de slides unicolores garantis !** ✅
