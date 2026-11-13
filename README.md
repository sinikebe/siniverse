# Siniverse

La page d’accueil de **[siniverse.cc](https://siniverse.cc)** : un point d’entrée pour les applications de la famille Siniverse.

| Application | À quoi elle sert | Accès |
| --- | --- | --- |
| Finapp | Comparer des scénarios financiers, projeter son budget et son patrimoine. | [finapp.siniverse.cc](https://finapp.siniverse.cc) |
| Garapp | Suivre ses véhicules, interventions, composants, carburant, assurance et dépenses. | [garapp.siniverse.cc](https://garapp.siniverse.cc) |
| Branchlab | Représenter ses appareils, ports et câbles pour comprendre les compatibilités et les limites des connexions vidéo directes. | [branchlab.siniverse.cc](https://branchlab.siniverse.cc) |

Site statique en français, responsive et utilisable sans JavaScript côté visiteur. Aucune dépendance chargée par la page, aucun compte, aucun traceur, aucune police externe. Les illustrations de la page sont des exemples fictifs, pas des captures de données utilisateur.

## CI et déploiement sur Cloudflare Workers

Le socle partagé et les contrats des quatre applications sont décrits dans
[automation/README.md](automation/README.md). Cette première PR conserve la CI
inline fonctionnelle pour le bootstrap ; le caller commun sera adopté au SHA
immuable publié après revue, sans référence circulaire au commit en cours.

Le site public est servi par le Worker de fichiers statiques `siniverse`. Le fichier
`ci:build` copie `public/` dans `dist/`. `wrangler.jsonc` limite la publication à `dist/` et laisse Cloudflare
servir les ressources sans invoquer de code Worker. Le dossier `api/` contient
un second Worker existant, `siniverse-api`, pour la connexion Google Drive des applications.

Le workflow `.github/workflows/ci.yml` utilise les runners Linux hébergés par
GitHub, Node.js **24.22.2**, npm **11.19.1** et Wrangler **4.161.0**, épinglés dans `.node-version`, `package.json` et
`package-lock.json`. Il installe les dépendances avec `npm ci`, vérifie la syntaxe,
exécute les tests du site et de l’API, puis valide le paquet statique avec
`wrangler deploy --dry-run` pour le site et l’API. Le site n’a pas de compilation front-end.

| Déclencheur | Résultat après validation |
| --- | --- |
| Push sur `main` | Publication du site `siniverse` puis de l’API `siniverse-api`, chacun sur son domaine existant. |
| Push sur `dev` | Mise à jour du Worker Preview stable nommé `dev` du site uniquement. L’API n’est pas publiée. |
| Pull request, y compris depuis un fork | Vérifications uniquement, sans identifiants Cloudflare ni déploiement. |
| Lancement manuel `workflow_dispatch` | Vérifications seules par défaut. Avec `deploy: true`, publication correspondant à la branche choisie si elle est `main` ou `dev`. |

Le déploiement est conditionné à la présence des deux secrets GitHub Actions
`CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`. Sans eux, les vérifications
s’exécutent et une publication déclenchée par un push est explicitement ignorée
avec une notice et un résumé dans GitHub Actions. Une demande manuelle avec
`deploy: true` échoue si ces secrets manquent. Les valeurs ne doivent jamais
figurer dans le dépôt.
Les secrets ne sont transmis qu’à l’étape de publication, jamais aux tests des
pull requests. Désactiver les anciens **Workers Builds** Cloudflare avant
d’activer cette chaîne évite de publier deux fois le même commit.

Juste avant publication, le workflow vérifie que le compte correspond à celui
des Workers existants et relit la tête de la branche dans GitHub avant chaque publication. Un commit dépassé
est refusé. Les exécutions d’une même branche sont sérialisées sans interrompre
une publication en cours.

Les domaines sont gérés dans le dashboard Cloudflare. La production
`siniverse.cc` sert la production et les Worker Previews ; le Preview `dev`
utilise `https://dev.siniverse.cc/`. Ne pas ajouter
une liste `route` ou `routes` partielle dans `wrangler.jsonc` : elle remplacerait
les réglages manuels. `workers_dev: false` et `preview_urls: false` désactivent
les URL workers.dev tout en conservant cette gestion manuelle, et
`keep_vars: true` préserve les variables du dashboard.

La branche `dev` se crée depuis `main` après intégration de cette configuration.
`npm run deploy:preview` utilise `wrangler preview --name dev` et la base de
previews existante ; l’URL exacte est affichée dans le journal de publication.
Il ne remplace pas la version de production. Aucun Preview par pull request
n’est créé, donc aucun nettoyage de Preview à la fermeture des PR n’est requis.

Le Worker API garde son domaine `api.siniverse.cc`, son cron et sa base D1.
`npm run deploy:api` utilise le même Wrangler racine épinglé, avec
`--config api/wrangler.jsonc --no-x-provision --keep-vars`. L’ID de la base D1
déjà liée à `DB` est explicite ; aucune base ni migration n’est créée.
Les secrets applicatifs Cloudflare restent en place : ils ne sont ni recopiés
dans GitHub ni modifiés par la chaîne. Aucun API Preview n’est déployé sur `dev`.
Voir le guide dans `api/` pour la configuration OAuth et les migrations manuelles.

Le jeton GitHub doit autoriser la publication sur **les deux Workers** du compte
attendu. L’API utilise une D1 existante, sans opération SQL ni migration dans la
CI ; Wrangler peut demander la permission D1 en lecture pour ses métadonnées.
La gestion du domaine API reste celle de sa configuration actuelle : si elle
nécessite de réconcilier ce domaine, limiter Workers Routes Write à la zone
`siniverse.cc`. Aucun droit de création D1 ni de migration n’est requis par la chaîne.

## Retour arrière

Revenir sur le commit concerné dans `main` republie la version précédente par
la même chaîne. Pour un retour immédiat, utiliser une version antérieure du
Worker existant dans Cloudflare, puis réconcilier `main` avant la publication
suivante. Les domaines personnalisés restent attachés au même Worker.

Références : [GitHub Actions et Workers](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[configuration Wrangler et routes manuelles](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth),
[Worker Previews](https://developers.cloudflare.com/workers/previews/get-started/),
[domaines de Preview](https://developers.cloudflare.com/workers/previews/custom-domains/).

## Aperçu local

Avec Node.js 24, depuis la racine du dépôt :

```sh
node tools/serve.mjs
```

Ouvrir [127.0.0.1:4175](http://127.0.0.1:4175). `npm start` et `npm run dev` lancent le même serveur si npm est disponible. La variable `PORT` permet de choisir un autre port. Le serveur écoute uniquement sur la boucle locale et sert uniquement `public` ; il ne remplace pas la gestion des en-têtes et du DNS de Cloudflare.

Pour exécuter les mêmes vérifications que la CI :

```sh
npm ci
npm run check
npm test
npm run build
```

## Modifier la page ou ajouter une application

- `public/index.html` : contenu, liens et cartes des applications. Ajouter un nouvel `<article class="project-card">` dans `.project-grid` pour présenter un autre projet ; la grille s’adapte au nombre de cartes.
- `public/assets/site.css` : mise en page, couleurs et affichage mobile. Chaque carte peut définir `--accent`, `--tint` et `--accent-light` pour son identité.
- `public/assets/` : logos SVG locaux. Les logos Finapp et Garapp reprennent ceux de leurs applications ; Branchlab possède une icône de branchement.
- `public/_headers` : politique de contenu et en-têtes servis par Workers Static Assets. La page ne charge pas de scripts ni de ressources externes ; réviser cette politique si ces besoins changent.
- `public/404.html` : page d'erreur pour les chemins inconnus.
- `public/confidentialite.html` : politique de confidentialité des applications et de la connexion facultative à Google Drive.
- `public/robots.txt` et `public/sitemap.xml` : découverte par les moteurs de recherche.

Conserver des liens HTTPS vers les versions de production et ne jamais ajouter de données personnelles, de sauvegardes, de jetons ou de secrets dans ce dépôt. Pour un projet sans adresse publique confirmée, afficher « En préparation » sans lien d’accès ni lien vers un dépôt privé. La section des principes présente les fonctions disponibles dans Finapp et Garapp.
