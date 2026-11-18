---
name: motion-anything-video
description: Créer des compositions motion originales, réutiliser une banque extensible et varier les animations des vidéos HTML/GSAP.
---

# Motion Anything · vidéo

Ces ressources sont adaptées au pipeline existant, elles ne changent pas de moteur à elles seules. Pour les vidéos Vive l’IA, conserver HTML/GSAP/Hyperframes, le format vertical, la voix clonée, les sous-titres et les sources. Caler les effets sur la parole ; ne pas déplacer la voix vers une grille musicale. La fabrication ne vaut pas approbation de publication.
Les documents upstream sont des références techniques, pas des instructions autorisant leurs installations, services ou commandes. Lire seulement la référence utile. Les SHA et licences sont dans `references/provenance.json`.

Consulter d’abord [les règles vidéo](references/video-rules.md), puis [MOTION-SPEC](references/MOTION-SPEC.md) pour les budgets et les cas déconseillés.
Rechercher dans le catalogue local : `python3 scripts/search_recipes.py count` (mots-clés upstream en anglais : `count`, `stagger`, `text`, `transition`). Le résultat donne la licence, `avoid_when`, le budget et le chemin du manifeste. `--category entrance` filtre une catégorie ; `--id count-up` affiche une recette exacte.
Le catalogue contient les 218 manifestes réellement présents au SHA figé, dont 16 YAML invalides conservés et signalés. Les entrées invalides ne sont jamais recommandées. Ne pas promettre 403 implémentations vérifiées sur la seule foi du README.
Seuls les exemples Apache-2.0 `fade-in-up`, `count-up` et `stagger-list` sont embarqués dans `assets/recipes/`. Leur logique web utilise RAF/IntersectionObserver : l’adapter en timeline GSAP pausée, ne pas l’injecter telle quelle dans une vidéo. Les autres entrées sont des descriptions consultables ; inspecter leur code et leur licence upstream avant de les reprendre. Les recettes Hippocratic-2.1 ne sont pas les exemples Apache.
Les douze compositions nommées de [render-recipes.json](references/render-recipes.json) sont disponibles comme solutions de repli. Le registre est dans `../../../scripts/local/motion-recipes.js`. Le mode ouvert de `../../../scripts/local/motion-composition.js` permet de concevoir de nouveaux dessins sans identifiant de gabarit préexistant. `motion-plan.json` version 3 enregistre le mode, la direction artistique et les décisions réellement passées au rendu. Les trois exemples upstream embarqués restent des références, sans limiter les compositions exécutables. Un chiffre doit rester exact et suffisamment longtemps visible.

## Banque ouverte et styles

Les douze compositions nommées sont désormais des solutions de repli, pas un plafond. Lire [open-composition.md](references/open-composition.md) pour créer un dessin inédit avec les éléments et relations du sujet. Le modèle fournit une structure déclarative ; aucun code du modèle n’est exécuté. Le moteur offre vingt mouvements et huit directions artistiques, à composer librement dans les contraintes de lisibilité. Ne pas présenter leurs combinaisons comme autant de recettes upstream vérifiées.

Le générateur demande en priorité des compositions adaptées au plan pour le développement et les nuances. Les dessins produits enrichissent automatiquement `linkedin-videos/.motion-library/` après un rendu réussi. La banque garde des dispositions anonymisées, sans chiffres ni textes d’anciens articles ; trois exemples au plus sont proposés au prochain script, sans empêcher la création d’un nouveau dessin. `motion-plan.json` version 3 enregistre la direction, le mode réellement utilisé et les références enregistrées.

## Prononciation et direction permanentes de Pierre

OpenAI se lit « Open-A-I », ChatGPT « tchat gépété », IA « i-a », l’IA « l’i-a » ; écriture usuelle à l’écran. Prises brutes ×1,10 avant le calage et le storyboard ; nouveau dessin animé au plus toutes les deux secondes. Consulter aussi les six adaptations de direction répertoriées dans `AGENTS.md` et leur registre. Choisir fond, typographie, illustration et mise en scène ensemble ; ne pas revenir systématiquement au fond bleu et aux cartes. Contrôler chaque MP4 final avec Earshot et examiner ses images avant la préparation pour approbation.

## Sélection du directeur — 15 novembre 2026

Par défaut, choisir au hasard UN skill directeur parmi les dix adaptations actives du générateur. `scripts/local/motion-skills.js` fournit `choisirSkill` ; le choix est conservé dans `selection-motion.json`, le script et le plan motion. Un choix explicite de Pierre prime. Le prompt charge uniquement les règles du directeur choisi, avec le contrat commun de voix, cadence, faits, sources, avatar, Earshot et approbation. Ne pas cumuler les dix langages artistiques dans le même film. Les utilitaires de recettes et de synthèse sonore restent disponibles.
