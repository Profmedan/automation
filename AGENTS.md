# Fabrication des vidéos Vive l’IA

Le bot fabrique les vidéos par `generate-video.js`, avec les modules de `scripts/local/`. Conserver le pipeline HTML/GSAP/Hyperframes, le calage sur la parole, la voix clonée, les sources et le circuit d’approbation.

Pour fabriquer ou modifier les visuels d’une vidéo, utiliser les skills locaux :

- `.agents/skills/motion-anything-video/SKILL.md` : choisir une recette, vérifier ses cas déconseillés et sa licence.
- `.agents/skills/claude-motion-video/SKILL.md` : timing, lecture, son procédural et revue des images.
- `.agents/skills/iart-motion-video/SKILL.md` : direction artistique, composition et technique GSAP/SVG.

`scripts/local/motion-skills.js` charge leurs règles dans le prompt et sélectionne les adaptations déjà supportées par le rendu. Les exemples web upstream sont des références : leurs animations RAF/CSS/scroll doivent être converties en timelines pausées pour une vidéo.

Chaque nouveau rendu contient `motion-plan.json`, `motion-sfx/` et `motion-review/`. Examiner les planches après un changement visuel ; le statut `images_a_examiner` ne signifie pas « validé ». Une correction exige un nouveau rendu et une nouvelle revue. Le test de compréhension et l’approbation avant publication restent applicables.

Contrôles locaux : `node --test tests/*.test.js`. Le témoin `node scripts/check-motion-skills.js /tmp/temoin-motion` utilise Hyperframes en cache, sans génération éditoriale, voix ou publication. `HYPERFRAMES_CLI` peut désigner le fichier CLI local déjà installé pour éviter toute résolution npm.

## Voix et rythme demandés par Pierre — 14 novembre 2026

- À l’oral, OpenAI se prononce « Open-A-I », ChatGPT se prononce « tchat gépété », IA « i-a » et l’IA « l’i-a » (li-a). Conserver ChatGPT et IA dans les titres et sous-titres. Le dictionnaire effectif est `scripts/local/prononciation.json`, appliqué par `texteDit` dans `scripts/local/voix-locale.js`.
- Accélérer la voix de 10 % par rapport à la prise brute : `CHATTERBOX.tempo = 1.10` dans `scripts/local/config-locale.js`. Appliquer le tempo avant la réécoute Whisper et le calcul des sous-titres, avec conservation de la hauteur. La vitesse ne doit pas rester à 1.05.
- Nouveau dessin et nouvelle animation au plus toutes les deux secondes. Préparer le storyboard après le calage de la voix ; ne pas se limiter à rejouer une entrée sur un dessin figé. Chaque dessin reste explicatif, conforme au plan et lisible.

## Contrôle audio Earshot obligatoire

À chaque création, modification ou nouveau rendu de vidéo, utiliser la skill `earshot` issue de `Leonxlnx/earshot`. Le générateur appelle `scripts/local/revue-audio.js` sur le MP4 final, après le mixage. Une erreur Earshot ou des niveaux non conformes bloquent la préparation pour approbation. Conserver `audio-review/earshot.json`, les résultats détaillés et la planche de chaque passage ; vérifier leur empreinte vidéo avant de commenter le son. Ne pas se contenter d’une transcription Whisper.

Le contrôle s’exécute localement dans `earshot-local:0.4.1-4ac3d2a`, hors réseau, sans clé. Ne pas activer le mode optionnel Gemini/llm ni téléverser l’audio. Earshot ne reconnaît ni le texte ni la langue : la prononciation reste contrôlée par le dictionnaire et Whisper. Interpréter son profil de films de lancement selon le format pédagogique et la voix clonée souhaités ; ne pas rejeter une synthèse sonore intentionnelle à cause de sa seule probabilité de son synthétique.

## Directions visuelles et six dépôts supplémentaires

Pour chaque nouvelle vidéo, consulter les adaptations suivantes ; leurs règles actives sont réellement chargées par `scripts/local/motion-skills.js` et leur provenance est jointe au `motion-plan.json` :

- `.agents/skills/vox-explainer-video/SKILL.md` — bestuserever121/vox-explainer (MIT) : composition propre au propos, objets et collage éditorial.
- `.agents/skills/hand-drawn-explainer-video/SKILL.md` — hi-nikola/hand-drawn-explainer-video-nikola (Apache-2.0) : route d’illustrations SVG programmées, tracés successifs et progression avec la voix. Ne pas présenter cette route comme l’exécution du moteur bitmap de dessin progressif.
- `.agents/skills/anything2explainer-video/SKILL.md` — Vincentwei1021/anything2explainer (PolyForm Noncommercial) : actif pour l’usage personnel non commercial confirmé par Pierre le 14 novembre 2026, consigné dans `video-directions-registry.json`. Réexaminer sa licence avant toute activité commerciale.
- `.agents/skills/bang-motion-video/SKILL.md` — bangtutorial/bang-motion (MIT) : direction avant storyboard, nouveaux décors et gestes explicatifs, refus du diaporama de boîtes.
- `.agents/skills/claude-remotion-video/SKILL.md` — haidrrrry/claude-remotion-skill (MIT) : thème, couches, contraste, entrées et revue, adaptés à Hyperframes/GSAP ; ne pas annoncer un rendu Remotion lorsque ce moteur n’est pas utilisé.
- `.agents/skills/video-shotcraft-video/SKILL.md` — Vincentwei1021/video-shotcraft (Apache-2.0) : hiérarchie du sujet, couches de profondeur, cadrages et revue indépendante.

La collection homonyme imMamdouhaboammar/motion-graphics-skills est propriétaire à la révision examinée et n’est pas importée ; la source Vox retenue ci-dessus est MIT. Aucun script upstream d’installation, de publication, de TTS distant ou d’envoi de télémétrie n’est exécuté par les adaptations.

### Changement visuel effectif

`preparerDirection` écrit `direction-artistique.json` avant la voix et le storyboard. Choisir le décor, la typographie, l’illustration et la mise en scène ensemble ; éviter la direction du dernier rendu. Le fond bleu ne doit plus être le choix automatique. Les directions actuelles permettent le collage éditorial, le carnet dessiné, le tableau graphique, l’affiche animée et le studio d’objets. Des parties explicatives et des nuances peuvent avoir des décors contrastés au sein d’une palette cohérente.

Le storyboard doit fournir de vrais objets illustrés, avec des pictogrammes ou des tracés SVG déclaratifs originaux. Les noms écrits dans des cartes ne remplacent plus un dessin. Les tracés n’acceptent aucun code, URL ou attribut libre. Les éléments restent assez grands pour une lecture à 480 px de large ; les libellés des plans courts visent au moins 36 px à 1080 px de large.

La référence Instagram `https://www.instagram.com/reel/Dft9mBIJSRr/` a été examinée : présentatrice, titres sur papier découpé, captures annotées et illustrations superposées. En reprendre des principes de hiérarchie et de montage ; ne pas réutiliser ses images ni inventer de fausses captures officielles.

Un contrôle Hyperframes en erreur, illisible, ou sans examen réel du navigateur arrête l’export. Une image de travail préparée avec `preparerSeulement` ne constitue pas un MP4 prêt à approuver. Le MP4 final passe toujours Earshot, la revue des images et le test de compréhension.

### Vérification du sens et crédits

`controle-storyboard.js` compare les affirmations et les titres des dessins au plan complet avant export. Refuser les promesses absolues non étayées, les détails techniques inventés et les fonctions futures présentées comme actives. Une fonction annoncée pour l’avenir reste représentable si son statut est explicite. Le verdict est archivé et lié par empreinte au contenu ; une modification du plan, des mots ou des dessins invalide sa réutilisation. Ce contrôle ne remplace pas l’examen des images ni la revue indépendante.

Pour quatre références au plus, la bibliographie reste visible pendant tout le générique des sources ; le focus éditorial et un dessin distinct animé changent entre les plans courts. Les titres complets et les auteurs ne doivent plus disparaître chacun après moins de deux secondes. Conserver les autres sources si l’article en comporte davantage, avec pagination adaptée. La banque anonymisée conserve les dispositions mais remplace aussi les pictogrammes et les tracés du sujet précédent : l’objet du nouveau sujet doit être redessiné.

La revue finale vérifie aussi les pixels : titre sans rognage, connecteurs au bord des boîtes, sous-titres et sources lisibles. Varier les échelles et les cadrages (sujet dominant, détail, diagonale ou organisation verticale) plutôt que répéter deux objets de même taille sur une ligne. Une direction secondaire cohérente peut accompagner une partie explicative. Les appels et crédits ont aussi un nouveau dessin animé à chaque plan court.

## Choix aléatoire d’un skill directeur — 15 novembre 2026

Par défaut, tirer uniformément UN directeur parmi `motion-anything-video`, `claude-motion-video`, `iart-motion-video`, `vox-explainer-video`, `hand-drawn-explainer-video`, `anything2explainer-video`, `bang-motion-video`, `claude-remotion-video`, `video-shotcraft-video` et `lemo-opuscar-video`. Lemo est adapté de `lemomo-ai/lemo-opuscar` à la révision du registre (documents CC BY-NC 4.0 et permission additionnelle de réalisation de films ; licences conservées). Cette adaptation ne promet pas l’exécution des 99 styles upstream.

`choisirSkill` écrit `selection-motion.json` avant le premier appel de script. Réutiliser ce choix pendant les reprises de texte, la correction après compréhension et tous les plans du storyboard. Le prompt charge seulement le directeur choisi, avec les contraintes communes de Pierre. Les recettes et outils de rendu/son restent techniques et communs. Le style effectif est conservé dans `direction-artistique.json` ; le choix du directeur figure aussi dans le script et le plan motion. `article.motionSkill` ou `VIDEO_MOTION_SKILL` permet un choix explicite qui prime sur le hasard. Ne pas confondre tirage d’un skill avec mélange des dix styles.

Earshot reste obligatoire pour toutes les vidéos et ne fait pas partie du tirage artistique. Les prononciations, voix ×1,10, nouveaux dessins ≤2 s, faits, sources, avatar et approbation restent obligatoires, quel que soit le directeur.
