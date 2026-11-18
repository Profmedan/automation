# Fabriquer une composition inédite

Le contrat `visuel.type = composition` remplace le choix obligatoire d’un gabarit. Décrire une intention, des `elements` et des `liens`. Le registre du moteur est `scripts/local/motion-composition.js` à la racine du projet ; ses exports `reglesComposition`, `MOUVEMENTS` et `STYLES` donnent le contrat courant utilisé par le véritable prompt.

Chaque élément a un identifiant simple, une primitive (texte, carte, cercle, rectangle ou donnee), un texte tiré du plan, une géométrie x/y/w/h en pourcentage de la zone graphique et un mouvement contrôlé. Les valeurs de donnee et les chiffres des textes restent vérifiés contre le plan. Les coordonnées ne sont pas des faits. Les citations entre guillemets français restent vérifiées contre le contenu.

Composer selon le sujet : flux d’informations, architecture, boucle, réseau de relations, hiérarchie, matrice, modules imbriqués sans recouvrement des textes, ou donnée commentée. Les relations affichées doivent être dans le plan. Changer seulement les couleurs ou les paramètres d’un exemple n’en fait pas un nouveau sujet.

Choisir `motionStyle` au niveau de la vidéo : editorial, blueprint, neon, paper, duotone, glass, terminal ou cinematic. Garder cette direction entre les plans. Un seul mouvement fortement accentué par vidéo ; les autres révèlent le contenu puis le laissent au repos. Les noms des mouvements sont donnés par le module, sans copie de liste susceptible de vieillir ici.

La banque `.motion-library` conserve uniquement la structure anonymisée. Le moteur la recharge dans les prochains prompts ; tous les libellés et valeurs doivent être remplacés par ceux du nouveau plan. Les fichiers `script.json` et `motion-plan.json` de chaque vidéo conservent le dessin particulier pour la revue. Une disposition enregistrée est structurée et rendue, mais son enregistrement ne vaut pas approbation humaine.

Contrôle : `node --test tests/motion-open.test.js`. Galerie technique : `node scripts/check-motion-open.js /tmp/galerie-motion` avec le CLI Hyperframes local en cache, ou `HYPERFRAMES_CLI` pointant sur son fichier existant. Examiner les sept planches. Cette galerie compare des scènes indépendantes : ses changements de style et ses effets forts répétés ne sont pas une prescription pour un film éditorial.

## Contrat vérifié de la génération automatisée

Sur les scènes idée principale, développement et nuances, au moins la moitié doivent fournir une composition originale ; aucune de ces scènes ne peut se contenter d’un titre. Les autres schémas explicatifs restent possibles. Les identifiants uniques du modèle sont canonisés en e0, e1, etc. avec leurs liens ; les doublons et les extrémités inconnues restent invalides. Cette normalisation ne modifie aucun texte, fait ou placement.

Chaque essai du script et ses erreurs sont conservés dans `script-essai-N.json` du dossier vidéo. Après trois essais, un dessin toujours invalide ou un contrat motion non respecté bloque la génération avant la voix : aucun remplacement silencieux par un titre. Vérifier `tests/motion-telegram.test.js` avec les autres tests du projet. Le test de compréhension ne remplace pas ce contrôle motion.
