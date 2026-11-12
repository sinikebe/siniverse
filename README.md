# Siniverse

La page d’accueil de **[siniverse.cc](https://siniverse.cc)** : un point d’entrée pour les applications de la famille Siniverse.

| Application | À quoi elle sert | Accès |
| --- | --- | --- |
| Finapp | Comparer des scénarios financiers, projeter son budget et son patrimoine. | [finapp.siniverse.cc](https://finapp.siniverse.cc) |
| Garapp | Suivre ses véhicules, interventions, composants, carburant, assurance et dépenses. | [garapp.siniverse.cc](https://garapp.siniverse.cc) |
| Branchlab | Représenter ses appareils, ports et câbles pour comprendre les compatibilités et les limites des connexions vidéo directes. | [branchlab.siniverse.cc](https://branchlab.siniverse.cc) |

Site statique en français, responsive et utilisable sans JavaScript. Aucune installation de dépendances, aucun compte, aucun traceur, aucune police externe. Les illustrations de la page sont des exemples fictifs, pas des captures de données utilisateur.

## Déploiement sur Cloudflare Pages

Dans **Workers & Pages → Create application → Pages → Import an existing Git repository**, sélectionner `sinikebe/siniverse`.

| Réglage | Valeur |
| --- | --- |
| Nom du projet | `siniverse` (ou un nom disponible) |
| Branche de production | `main` |
| Framework preset | `None` |
| Build command | `exit 0` |
| Build output directory | `public` |
| Root directory | Laisser vide (racine du dépôt) |
| Variables d’environnement | Aucune |

Le dossier `public` contient directement les fichiers à servir. Le déploiement n’utilise pas de commande npm, de compilation, de Worker ou de Pages Function. Avec l’intégration Git, les nouveaux commits sur `main` sont déployés automatiquement.

Après le premier déploiement, ouvrir le projet Pages puis **Custom domains → Set up a domain**, saisir `siniverse.cc` et suivre la validation Cloudflare. Le domaine racine doit appartenir à une zone Cloudflare sur ce compte. Passer par cet écran associe le domaine au projet et configure l’enregistrement DNS nécessaire ; un enregistrement DNS ajouté seul ne suffit pas.

Références officielles : [déployer un site HTML statique](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/), [domaines personnalisés](https://developers.cloudflare.com/pages/configuration/custom-domains/), [en-têtes HTTP](https://developers.cloudflare.com/pages/configuration/headers/).

## Aperçu local

Avec Node.js 22 ou plus récent, depuis la racine du dépôt :

```sh
node tools/serve.mjs
```

Ouvrir [127.0.0.1:4175](http://127.0.0.1:4175). `npm start` et `npm run dev` lancent le même serveur si npm est disponible. La variable `PORT` permet de choisir un autre port. Le serveur écoute uniquement sur la boucle locale et sert uniquement `public` ; il ne remplace pas la gestion des en-têtes et du DNS de Cloudflare.

## Modifier la page ou ajouter une application

- `public/index.html` : contenu, liens et cartes des applications. Ajouter un nouvel `<article class="project-card">` dans `.project-grid` pour présenter un autre projet ; la grille s’adapte au nombre de cartes.
- `public/assets/site.css` : mise en page, couleurs et affichage mobile. Chaque carte peut définir `--accent`, `--tint` et `--accent-light` pour son identité.
- `public/assets/` : logos SVG locaux. Les logos Finapp et Garapp reprennent ceux de leurs applications ; Branchlab possède une icône de branchement.
- `public/_headers` : politique de contenu et en-têtes servis par Cloudflare Pages. La page ne charge pas de scripts ni de ressources externes ; réviser cette politique si ces besoins changent.
- `public/404.html` : page d’erreur. Sa présence conserve le comportement 404 de Pages pour les chemins inconnus.
- `public/robots.txt` et `public/sitemap.xml` : découverte par les moteurs de recherche.

Conserver des liens HTTPS vers les versions de production et ne jamais ajouter de données personnelles, de sauvegardes, de jetons ou de secrets dans ce dépôt. Pour un projet sans adresse publique confirmée, afficher « En préparation » sans lien d’accès ni lien vers un dépôt privé. La section des principes présente les fonctions disponibles dans Finapp et Garapp.
