# Earshot local

Version 0.4.1, dépôt Leonxlnx/earshot, commit 4ac3d2ac2b151e1c23376f9ce7f3047a17050013 (MIT). L’image `earshot-local:0.4.1-4ac3d2a` réutilise la pile CPU de `chatterbox-fr:0.1.7`, sans la modifier.

`review.py` produit les mesures, la timeline, la critique complète et la planche du MP4. Le wrapper `scripts/local/revue-audio.js` monte seulement le fichier en lecture, le dossier de résultats et le cache ; Docker est hors réseau pendant toute analyse. Aucun mode llm/Gemini n’est utilisé.

Pour reconstruire l’image, récupérer le dépôt à ce commit, créer un contexte contenant ce Dockerfile et review.py ainsi qu’un dossier earshot composé du sous-dossier Python earshot, de pyproject.toml, README.md et LICENSE. Les tests et évaluations du dépôt sont exclus. Construire avec `docker build -t earshot-local:0.4.1-4ac3d2a <contexte>`. Charger une fois les modèles publics avec `python -m earshot doctor --fetch --load --json` dans cette image, sans drapeau hors ligne et sans monter d’audio, en montant le cache sur /cache.

Le cache effectif est `.cache/earshot/`. Les modèles CLAP et AST sont figés par Earshot et leurs poids safetensors ont été vérifiés avec doctor. En production les drapeaux EARSHOT_OFFLINE, HF_HUB_OFFLINE et TRANSFORMERS_OFFLINE sont activés, avec `--network none`.

Une analyse défaillante bloque le rendu prêt à approuver. Les mesures de niveau suivent la cible du projet : −16 ±1,5 LUFS, crête vraie au plus −4 dBTP, aucun échantillon saturé. Le score du profil de films de lancement est conservé pour interprétation ; il ne certifie ni la prononciation ni la qualité artistique d’une vidéo pédagogique parlée.
