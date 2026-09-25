# Conceptuo — Atelier 3D

Prototype indépendant pour importer un plan, reconstruire les murs et aménager une scène 3D éditable. L’exemple intégré permet de tester immédiatement sans clé API.

## Démarrer

Node.js 22.13+ ou 24 et npm sont nécessaires.

```sh
npm ci
npm run dev
```

Ouvrir l’adresse locale affichée (habituellement http://localhost:5173).

```sh
npm test
npm run typecheck
npm run build
```

## Parcours

1. Importer le PDF d’origine du plan d’architecte, jusqu’à 25 Mo. L’application cherche elle-même la page qui porte le plan. Elle lit ensuite les tracés vectoriels et le texte du fichier (échelle, surfaces, baies) pour reconstruire les murs et les ouvertures, sans IA.
2. **Étape 1 · Relevé de l’existant.** Corriger dans le plan 2D ce que l’extraction a manqué. Ces corrections ne comptent pas comme travaux. Cliquer ensuite sur **Valider l’existant**.
3. **Étape 2 · Projet de rénovation.** Démolir, construire, percer, reboucher, changer une épaisseur. Chaque écart avec l’existant est dessiné sur le plan, en jaune pour ce qui est à démolir et en rouge pour ce qui est à construire, avec un numéro de repère.
4. **Modifications (n)** ouvre le tableau des postes : repère, type, coordonnées de début et de fin, longueur, épaisseur, hauteur, surface nette. Un clic sur une ligne zoome le plan sur le repère. L’onglet JSON donne le document d’échange avec Conceptuo, à copier ou à télécharger. Le format est décrit dans [GUIDE-DEVELOPPEURS.md](GUIDE-DEVELOPPEURS.md).
5. Les pièces et leurs surfaces sont calculées à partir des murs. Une pièce garde la surface imprimée sur le plan tant que ses murs n’ont pas changé ; sinon, sa surface est recalculée. Supprimer le mur entre deux pièces les réunit en une seule pièce, « Cuisine + Bureau » par exemple : un clic sur son nom permet de la renommer.
6. Toutes les modifications se font dans le plan 2D. La maquette 3D en est la représentation en direct : on peut la faire tourner et y cliquer pour sélectionner un élément, mais pas y déplacer quoi que ce soit.
7. Enregistrer un JSON pour reprendre l’édition, ou exporter un GLB pour un autre outil 3D.

Raccourcis : V sélection, M mur, Échap annuler le tracé ou la sélection, Suppr suppression, Cmd/Ctrl Z annuler, Cmd/Ctrl Maj Z rétablir. L’historique d’annulation, 30 pas, est conservé après un rechargement de la page. « Analyser avec l’IA » reste disponible en repli manuel : il envoie une image de la page à OpenAI, avec la clé saisie dans « Connexions IA ».

## Architecture

- React + TypeScript, Vinext/Vite ; endpoint HTTP compatible Cloudflare Workers.
- PDF.js rend la page dans le navigateur, avec worker, polices et décodeurs servis localement. `predev` et `prebuild` synchronisent ces ressources depuis la version installée.
- L’endpoint `/api/analyze` transmet une image de la page à l’API Responses d’OpenAI. Un schéma JSON strict décrit les axes des murs et les ouvertures. Les coordonnées sont contrôlées côté serveur, puis converties de l’image vers les mètres côté client.
- JSON est le format maître. Les positions 2D x/y correspondent aux axes x/z en 3D. Les murs et produits sont des groupes Three.js distincts, y compris dans l’export GLB.
- Les ouvertures sont créées en découpant le mur en volumes ; elles suivent leur mur lors d’un déplacement ou d’une rotation.
- Les meubles intégrés sont des volumes paramétriques simplifiés, pas des références fournisseurs. Les modèles GLB importés gardent leur géométrie et leurs matériaux.

## Données et clé API

Le projet courant et son historique d’annulation sont sauvegardés dans IndexedDB sur l’appareil, sans serveur de stockage. Le PDF original reste dans l’onglet ; seule l’image de la page choisie figure dans le projet sauvegardé. Pour changer de page après un rechargement, importer à nouveau le PDF. L’ouverture d’un nouveau plan et l’analyse sont annulables pendant la session. Les 30 dernières modifications restent annulables, y compris après un rechargement.

La clé OpenAI est saisie par l’utilisateur, conservée uniquement dans la mémoire de l’onglet, et transmise à l’endpoint uniquement lors d’une analyse. Elle n’est ni placée dans une URL, ni enregistrée dans IndexedDB/JSON, ni journalisée par le code applicatif. L’appel OpenAI utilise `store: false`. Les frais éventuels sont ceux du compte API de l’utilisateur ; l’application ne possède pas de clé partagée. Ne pas utiliser ce prototype comme service public sans réexaminer accès, quotas et protections.

## Limites du MVP

- Un seul niveau, murs droits, hauteur initiale 2,60 m et épaisseur initiale 15 cm pour les murs détectés. Ces valeurs sont des hypothèses modifiables.
- L’IA peut manquer des murs ou confondre une annotation : ce n’est ni un relevé certifié ni un plan d’exécution. Aucune performance de détection n’a été mesurée sur un corpus métier.
- Sol rectangulaire indicatif calculé sur l’emprise de la scène ; pas de calcul de surface nette des pièces, de toiture ou de plafond.
- Le déplacement d’un mur n’entraîne pas ses voisins. Pas de contraintes de raccordement, collision ou faisabilité structurelle.
- Une recalibration met à l’échelle les coordonnées et largeurs d’ouverture, mais conserve les dimensions physiques des meubles, la hauteur et l’épaisseur des murs.
- GLB sans Draco/Meshopt/KTX2 et sans ressources externes. Un GLB exporté se réimporte comme produit ; pour retrouver l’édition sémantique des murs, rouvrir le JSON.
- Pas d’authentification applicative autonome : une publication Sites privée utilise le contrôle d’accès de l’hébergeur.
- Pas de synchronisation multi-appareils. Conserver une copie JSON hors du navigateur.

## Validation effectuée

Les tests contrôlent les déplacements, la calibration, les entrées invalides, les coordonnées IA, les ouvertures réelles dans les murs, l’export/réimport GLB et les objets indépendants, ainsi que les réponses et erreurs de l’API avec une réponse OpenAI simulée. La vérification TypeScript et la compilation complètent ces contrôles.

L’analyse réelle avec une clé API et les interactions dans un navigateur ne sont pas validées par ces tests. Les outils WebMCP (`read_floor_plan`, `add_catalog_item`) sont facultatifs et activés seulement si le navigateur les prend en charge ; leur validation en contexte WebMCP n’était pas disponible.

Documentation utilisée : [images et vision OpenAI](https://developers.openai.com/api/docs/guides/images-vision), [sorties structurées OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs), [Three.js](https://threejs.org/docs/), [PDF.js](https://mozilla.github.io/pdf.js/).

## Nouveaux outils

Les outils « Ajouter une porte » et « Ajouter une fenêtre » se trouvent sous le dessin de mur. Cliquer sur un mur pour placer une ouverture, puis la glisser le long de ce mur en 2D ou 3D. Ses propriétés règlent aussi sa position et ses dimensions.

Dans Objets, « Depuis un lien produit » lit une fiche marchand avec OpenAI. Vérifier la photo et les trois dimensions, puis lancer la génération Meshy. Les deux clés se renseignent dans « Connexions IA ». Une photo et des dimensions saisies manuellement permettent aussi de lancer Meshy sans lecture OpenAI. Ce parcours manuel permet de traiter les pages bloquées. Le résultat est un véritable GLB texturé, mis aux dimensions confirmées et ajouté à la bibliothèque. La ressemblance dépend de la photo ; les faces cachées sont estimées.

La génération consomme les crédits du compte Meshy. Fermer la fenêtre laisse la tâche continuer ; son identifiant est conservé dans la session pour reprendre le suivi sans recréer de tâche. Les clés restent uniquement en mémoire. La photo est transmise à Meshy ; les informations de la fiche sont transmises à OpenAI. Aucun appel payant réel n’a été testé sans les clés de l’utilisateur.

« Rendu réaliste » reprend le cadrage de la vue 3D et calcule éclairage, ombres et réflexions progressivement avec les matériaux présents. Choisir l’ambiance et 32, 64 ou 128 passes, puis télécharger un PNG de 1 280 × 800 pixels. Le calcul utilise le GPU local ; un rendu standard est proposé en cas d’incompatibilité. La géométrie simplifiée du catalogue reste simplifiée dans le rendu.

Les tests supplémentaires couvrent la projection des ouvertures, leurs limites de déplacement, l’extraction des fiches, les restrictions d’URL et les réponses Meshy simulées (création, progression, crédits insuffisants). L’extraction des métadonnées et de la photo a aussi réussi sur une fiche IKEA publique. Le rendu GPU et la génération réelle restent à vérifier sur l’appareil et avec les comptes de l’utilisateur.

Documentation : [API Image to 3D Meshy](https://docs.meshy.ai/en/api/image-to-3d), [moteur de rendu](https://github.com/gkjohnson/three-gpu-pathtracer).

Guide de transmission et limites connues : [GUIDE-DEVELOPPEURS.md](GUIDE-DEVELOPPEURS.md).
