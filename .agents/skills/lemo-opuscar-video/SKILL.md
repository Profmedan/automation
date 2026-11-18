---
name: lemo-opuscar-video
description: Diriger une vidéo originale avec les principes Lemo-Opuscar de cadrage, sujet dominant, geste propre au médium et relecture, adaptés au pipeline local de Pierre.
---

# lemo-opuscar-video

## Contrat permanent de Pierre

Ce fichier est une adaptation locale documentée, et non une installation intégrale du moteur upstream. Les règles exécutées sont chargées depuis `references/video-rules.md` par `scripts/local/motion-skills.js`. La provenance et les exclusions sont dans `references/provenance.json` ; la copie source sert à la revue, pas à lancer ses commandes.

- Voix française clonée de Pierre en local. OpenAI se prononce « Open-A-I », ChatGPT « tchat gépété », IA « i-a » et l’IA « l’i-a ». Orthographe usuelle à l’écran. Prises brutes ×1,10 avant Whisper, sous-titres et storyboard.
- Nouveau dessin et sa propre animation au plus toutes les deux secondes, sur le calage réel. Les actions peuvent se poursuivre d’un dessin au suivant ; garder les mots immobiles et lisibles. Cette cadence et le format 1080 × 1920 priment sur les durées ou ratios des exemples upstream.
- Préparer une direction artistique justifiée : décor, typographie, illustration, cadrage et mouvements. Varier la composition elle-même ; changer seulement la couleur ou le mouvement d’entrée ne suffit pas. Un objet cité doit être montré quand il explique le propos.
- Conserver les faits, les nuances, les sources et l’avatar. Une illustration schématique ne constitue ni un logo officiel ni une capture réelle. Aucune API payante supplémentaire, aucun téléversement audio, aucune publication automatique.
- Pour chaque MP4 final : contrôle Earshot local obligatoire, mesures, timeline, critique et planche conservées avec l’empreinte vidéo. Examiner les images, corriger puis refaire le rendu et ses contrôles. L’approbation de Pierre avant publication reste requise.

## Références

Lire `references/video-rules.md` pour la direction appliquée, puis les fichiers de `references/upstream/` utiles au plan choisi. Lire la licence fournie avant toute réutilisation. Aucun script upstream n’est exécuté par cette adaptation.

## Contrôles du générateur

Les dessins passent un contrôle factuel contre le plan complet avant export, lié à leur empreinte. Refuser les promesses non sourcées et distinguer explicitement l’actuel du futur. Les crédits restent lisibles pendant les plans de fermeture. Une disposition réutilisée ne doit pas importer le sujet ou les tracés de la vidéo précédente. Le verdict automatique complète la revue des images et Earshot, sans les remplacer.

## Source et licence

Adaptation modifiée de Lemo-Opuscar by Lemomo (LemoLab), https://github.com/lemomo-ai/lemo-opuscar, documents sous CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/) et permission additionnelle de réalisation de films dans LICENSE. Usage personnel non commercial confirmé par Pierre. Ce pack ne prétend pas exécuter les 99 styles ou reproduire leurs demos : il adapte la direction au dessin SVG et aux timelines GSAP disponibles. Lire la référence choisie avant de reprendre son langage ; ne pas remplacer un effet natif absent par une imitation annoncée comme exacte. Aucune installation automatique, modèle TTS distant ou musique upstream.

## Sélection du directeur — 15 novembre 2026

Par défaut, choisir au hasard UN skill directeur parmi les dix adaptations actives du générateur. `scripts/local/motion-skills.js` fournit `choisirSkill` ; le choix est conservé dans `selection-motion.json`, le script et le plan motion. Un choix explicite de Pierre prime. Le prompt charge uniquement les règles du directeur choisi, avec le contrat commun de voix, cadence, faits, sources, avatar, Earshot et approbation. Ne pas cumuler les dix langages artistiques dans le même film. Les utilitaires de recettes et de synthèse sonore restent disponibles.
