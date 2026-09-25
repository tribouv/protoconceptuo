# Conceptuo — reprise du MVP (11 septembre 2026)

## Installation sur un poste développeur

1. Télécharger le ZIP depuis Google Drive, puis le décompresser dans un dossier local (ne pas exécuter directement dans le ZIP ni dans un dossier synchronisé).
2. Installer Node.js 24 LTS avec npm. Ouvrir un terminal dans le dossier contenant package.json.
3. Exécuter :

```sh
npm ci
npm run dev
```

4. Ouvrir http://localhost:5173 (ou le port affiché si celui-ci est occupé). Garder le terminal ouvert. Ctrl+C arrête le serveur.
5. Le projet exemple fonctionne sans compte API. Dans Connexions IA, saisir une clé API OpenAI pour analyser un plan. Le modèle par défaut de cette livraison est gpt-6-astra ; il doit être accessible au compte API. Le choix du modèle dans ChatGPT/Codex ne configure pas l’application.

Aucun compte Codex, abonnement Sites ou clé partagée n’est nécessaire pour lancer l’éditeur localement. Les appels IA nécessitent Internet et les crédits du fournisseur. Ne pas remplacer .openai/hosting.json pour démarrer : ce fichier est importé par la configuration. Son identifiant n’est pas un secret. La publication du site du propriétaire n’est pas incluse dans cette procédure.

## Vérifications

```sh
npm test
npm run typecheck
npm run build
```

Le lancement en développement est le parcours de référence de cette livraison. Les ressources PDF sont recréées automatiquement par predev/prebuild. Le lockfile est fourni ; utiliser npm ci. En cas de problème lié à une autre version de Node, repasser sur Node 24 et réinstaller les dépendances.

## Contenu et architecture

- components/editor : interface, plan SVG, scène Three.js, outils murs/ouvertures, produits et rendu.
- lib/editor/model.ts : format de projet JSON ; x/y du plan deviennent x/z en 3D, unités en mètres.
- lib/editor/analysis.ts et app/api/analyze/route.ts : extraction visuelle des axes de murs, puis conversion vers les dimensions calibrées.
- lib/editor/scene.ts : géométrie indépendante des murs et objets, ouvertures réelles, import/export GLB.
- app/api/product : extraction des photos et dimensions marchandes via OpenAI.
- app/api/generate-product : intégration Meshy optionnelle existante.
- components/editor/render-dialog.tsx : rendu progressif local sur GPU et export PNG.
- lib/editor/edits.ts : modifications du plan par saisie (longueur selon un point fixe, chaîne de cotes des baies, coupe, fusion, suppression qui recolle, décalage, face à face, équerre). Toute modification du plan passe par `apply` dans editor.tsx, qui appelle `finalize` : les baies sont recalées dans les murs modifiés, et une modification qui abîmerait le plan (mur de moins de 5 cm, baie qui déborde ou en chevauche une autre, hors limites du schéma) est refusée avec un message. Une nouvelle action s’écrit comme une fonction pure `(Project) => Project` dans ce fichier, avec son test.
- lib/editor/units.ts : lecture des cotes tapées (3,45 · 345cm · +12cm · 50 %).
- lib/editor/changes.ts : écarts entre l’existant validé et le projet (démolitions, constructions, percements, rebouchages, baies modifiées, épaisseurs) et JSON d’échange avec Conceptuo. Voir « Export des modifications » ci-dessous.
- lib/editor/history.ts et storage.ts : historique d’annulation enregistré dans IndexedDB (magasin `history`), l’image du plan et les modèles n’y étant rangés qu’une fois.
- tests/core.mjs : tests de géométrie et d’API simulées.

Le ZIP contient les sources et le lockfile, sans node_modules, historique Git, caches, fichiers .env ni clés API. Les données des projets de Raphaël sont stockées dans le navigateur et ne sont pas dans le ZIP. Pour transmettre un aménagement, utiliser Enregistrer dans l’application puis partager aussi le JSON obtenu. Ce JSON peut contenir l’image du plan et les modèles importés.

## Export des modifications (devis Conceptuo)

Le parcours a deux étapes. Pendant le **relevé de l’existant**, on corrige l’extraction du PDF, et rien n’est compté comme travaux. **Valider l’existant** fige une copie des murs dans `project.existing`. Ensuite, chaque écart avec cette copie est un poste de travaux. Toutes les modifications se font dans le plan 2D : la 3D en est une représentation en lecture seule.

**Principe.** On compare des géométries, jamais des identifiants de murs, parce que couper, fusionner ou recoller un mur change ses identifiants. Pour chaque mur existant, on garde les portions de son axe couvertes par un mur actuel sur le même axe (écart d’angle inférieur à 0,5°, écart d’axe inférieur à 2 cm) :
- ce qui n’est plus couvert est **démoli** ;
- une portion de mur actuel qu’aucun mur existant ne couvre est **construite** ;
- les bouts de moins de 5 cm sont ignorés ;
- un écart de cote de moins de 5 mm n’est pas une modification.

Un mur courbe est comparé entier. Le mobilier n’entre pas dans le calcul.

**Mesures.** Les longueurs sont prises sur l’axe des murs. Aux angles, elles diffèrent légèrement d’une mesure sur les faces. La surface nette vaut longueur × hauteur, moins les baies comprises dans la portion.

**Repères.** Chaque poste reçoit un numéro, affiché dans une pastille sur le plan 2D : jaune pour une démolition ou un rebouchage, rouge pour le reste. Le même numéro figure dans le tableau et dans le JSON. L’ordre est le suivant : démolitions, constructions, épaisseurs ou hauteurs, percements, rebouchages, baies modifiées. Dans chaque groupe, les postes suivent l’ordre de lecture du plan. Tant que le plan ne change pas, les numéros restent les mêmes.

**Format** `conceptuo-atelier.changes`, version 1 (bouton « Modifications », onglet JSON) :

```json
{ "format": "conceptuo-atelier.changes", "version": 1, "units": "m", "generatedAt": "…",
  "frame": { "origin": "page-top-left", "x": "right", "y": "down" },
  "project": { "name": "…", "validatedAt": "…", "source": { "fileName": "…", "page": 1, "scale": 0.0176, "pageWidth": 14.8, "pageHeight": 10.5 } },
  "changes": {
    "demolished": [{ "ref": 1, "existingWallId": "mur-13", "from": {"x":…,"y":…}, "to": {…}, "length": 3.94, "thickness": 0.06, "height": 2.73, "area": 10.75, "openings": [] }],
    "built": [{ "ref": 2, "wallId": "…", "from": {…}, "to": {…}, "length": …, "thickness": …, "height": …, "area": …, "openings": [] }],
    "resized": [{ "ref": 3, "existingWallId": "…", "from": {…}, "to": {…}, "length": …, "before": {"thickness":…,"height":…}, "after": {…} }],
    "openingsCreated": [{ "ref": 4, "existingWallId": "…", "wallId": "…", "before": null, "after": { "kind": "door", "width": 0.9, "height": 2.1, "sill": 0, "from": {…}, "to": {…}, "centre": {…} } }],
    "openingsFilled": [{ "ref": 5, …, "before": {…}, "after": null }],
    "openingsModified": [{ "ref": 6, …, "before": {…}, "after": {…} }],
    "totals": { "demolishedLength": …, "demolishedArea": …, "builtLength": …, "builtArea": …, "resizedLength": …, "openingsCreated": 1, "openingsFilled": 1, "openingsModified": 1 },
    "count": 6 },
  "existing": { "walls": [ … ], "rooms": [ … ] },
  "proposed": { "walls": [ … ], "rooms": [{ "name": "Cuisine ouverte", "area": 15.41, "source": "recalculée", "printed": 15.17, "computed": 15.408, "at": {"x":…,"y":…} }] } }
```

- **Coordonnées.** Elles sont en mètres, depuis le coin haut-gauche de la page du PDF, avec x vers la droite et y vers le bas. `source.scale` est exprimé en mètres par point PDF. La position sur la page en points vaut donc `x / scale`.
- **Identifiants.** `existingWallId` renvoie à un mur de `existing.walls`, qui ne change plus après la validation. `wallId` renvoie à un mur du projet.
- **Pièces.** `rooms` donne les pièces avant et après travaux. Elles sont calculées à partir des murs (voir `lib/editor/rooms.ts`) :
  - les murs sont peints sur une grille d’un centimètre, puis l’espace libre est rempli depuis chaque étiquette de pièce ;
  - les portes et fenêtres comptent comme du mur plein ;
  - deux étiquettes dans un même espace fermé font une seule pièce, avec les noms réunis par « + », jusqu’à ce qu’on la renomme ;
  - `area` est la surface imprimée (`source: "imprimée"`) tant que l’espace de la pièce garde la même surface qu’avec les murs de l’existant. Sinon c’est la surface calculée entre les faces des murs (`source: "recalculée"`). Avant la validation, la surface imprimée est gardée si la surface calculée la rejoint à 2 % près (0,1 m² au moins) ;
  - `computed` vaut null pour un espace non fermé.
- **Baies.** `from` et `to` sont les deux tableaux de la baie. Une baie située dans une portion démolie ou construite est listée dans les `openings` de cette portion, pas comme percement ni comme rebouchage.

## État réel et travaux prioritaires

### Analyse de plan — précision non résolue

Le retour utilisateur indique un mauvais tracé. Aucun plan problématique accompagné de son résultat n’a encore été fourni pour reproduire et mesurer l’écart. Le moteur actuel fait une seule extraction visuelle, à partir d’une image PDF réduite à 1 800 pixels, sans extraction vectorielle, revue visuelle automatique ni optimisation topologique. Changer de modèle ne garantit pas la précision architecturale.

Correction apportée dans cette livraison : un nom invalide ne retombe plus silencieusement sur gpt-4.1 ; le modèle demandé est utilisé explicitement, gpt-6-astra reçoit reasoning.effort=high et un budget de sortie adapté, et le résultat affiche le modèle utilisé. Tests simulés réussis. Aucun gain de précision sur des plans réels n’est revendiqué.

Prochaine validation : recueillir le PDF exact, la page, une cote de référence, le JSON erroné et une capture du tracé attendu. Constituer quelques plans de référence ; mesurer l’erreur des axes et extrémités, les murs manquants et les ouvertures. Étudier l’extraction vectorielle pour les PDF natifs, le découpage haute résolution pour les scans, puis une proposition superposée au plan avant application. Ne pas ajouter automatiquement des murs pour fermer les pièces sans preuve visuelle.

### Claude Design — remplacement de Meshy non réalisé

Le service indiqué est https://claude.ai/design. Les documents officiels consultés décrivent une interface de création de prototypes et des exports de documents/HTML. Aucune API officielle de génération photo-vers-GLB n’a été identifiée. Ne pas envoyer une clé Anthropic à l’endpoint Meshy, ni annoncer cette intégration comme disponible.

Une autre architecture fondée sur l’API Claude et de la géométrie procédurale serait une fonctionnalité différente, à évaluer pour la ressemblance. Ne pas exécuter directement du code arbitraire généré dans le navigateur ou le serveur. L’import GLB manuel fonctionne déjà sans Meshy.

Références : https://claude.com/product/design et https://www.anthropic.com/news/claude-design-anthropic-labs ; https://developers.openai.com/api/docs/models/gpt-6-astra

### Rendu et exploitation

Le rendu GPU et les appels IA payants n’ont pas été validés sur le poste utilisateur. Le catalogue natif reste géométriquement simplifié. Un seul étage ; pas de contraintes structurelles, collision ou synchronisation entre appareils. Le site existant est privé : son lien ne confère pas automatiquement l’accès aux développeurs. Google Drive distribue les sources, mais n’exécute pas l’application.

Les clés sont saisies dans l’onglet et conservées uniquement en mémoire. Elles transitent par les routes serveur pour appeler le fournisseur. Avant un service multiutilisateur : définir authentification, quotas, gestion des secrets, stockage et politique de données.
