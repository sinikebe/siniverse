# Siniverse

La page d’accueil de **[siniverse.cc](https://siniverse.cc)** : un point d’entrée pour les applications de la famille Siniverse.

| Application | À quoi elle sert | Accès |
| --- | --- | --- |
| Finapp | Comparer des scénarios financiers, projeter son budget et son patrimoine. | [finapp.siniverse.cc](https://finapp.siniverse.cc) |
| Garapp | Suivre ses véhicules, interventions, composants, carburant, assurance et dépenses. | [garapp.siniverse.cc](https://garapp.siniverse.cc) |

Site statique en français, responsive et utilisable sans JavaScript. Aucune installation de dépendances, aucun compte, aucun traceur, aucune police externe. Les illustrations de la page sont des exemples fictifs, pas des captures de données utilisateur.

## Déploiement sur Cloudflare Workers

Le site public est servi par un Worker de fichiers statiques. Le fichier
`wrangler.jsonc` limite les fichiers publiés à `public/` et laisse Cloudflare
servir les ressources sans invoquer de code Worker. Le dossier `api/` contient
un second Worker, indépendant, pour la connexion Google Drive des applications.

Dans Cloudflare **Workers & Pages**, utiliser le Worker existant `siniverse`
lié au dépôt `sinikebe/siniverse`, avec la racine du dépôt comme répertoire de
travail, la branche `main`, la commande de build `node --test test/site.test.mjs` et la
commande de déploiement `npx wrangler deploy`. Aucun
outil n'est nécessaire sur l'ordinateur personnel : cette commande s'exécute
dans la construction Cloudflare. Aucun secret n'est nécessaire au site public.

Tester d'abord l'adresse `workers.dev`, puis transférer le domaine personnalisé
`siniverse.cc` du projet Pages vers le Worker. Garder le projet Pages disponible
pendant la vérification pour faciliter un retour arrière. Le Worker API a sa
propre configuration et son propre domaine `api.siniverse.cc` : voir son guide
dans `api/` avant d'activer la connexion persistante dans les applications.

Après avoir retiré le domaine du projet Pages et l'avoir attaché au Worker,
déclarer durablement ce domaine dans `wrangler.jsonc` avec
`"routes": [{"pattern":"siniverse.cc","custom_domain":true}]`, puis
redéployer. La route n'est pas encore dans le dépôt pour permettre au nouveau
Worker de se déployer et d'être testé avant la bascule du projet Pages.

## Retour arrière

Le projet Pages actuel peut rester disponible pendant la vérification du
nouveau Worker. Un seul projet doit porter `siniverse.cc` à la fois : en cas de
problème, retirer le domaine personnalisé du Worker et le réassocier au projet
Pages. Ne supprimer l'ancien projet qu'après validation des applications et
de leurs liens depuis la page d'accueil.

Références : [migration Pages vers Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/),
[domaines personnalisés Workers](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Aperçu local

Avec Node.js 22 ou plus récent, depuis la racine du dépôt :

```sh
node tools/serve.mjs
```

Ouvrir [127.0.0.1:4175](http://127.0.0.1:4175). `npm start` et `npm run dev` lancent le même serveur si npm est disponible. La variable `PORT` permet de choisir un autre port. Le serveur écoute uniquement sur la boucle locale et sert uniquement `public` ; il ne remplace pas la gestion des en-têtes et du DNS de Cloudflare.

## Modifier la page ou ajouter une application

- `public/index.html` : contenu, liens et cartes des applications. Ajouter un nouvel `<article class="project-card">` dans `.project-grid` pour présenter un autre projet ; la grille s’adapte au nombre de cartes.
- `public/assets/site.css` : mise en page, couleurs et affichage mobile. Chaque carte peut définir `--accent`, `--tint` et `--accent-light` pour son identité.
- `public/assets/` : logos SVG locaux. Les logos Finapp et Garapp reprennent ceux de leurs applications.
- `public/_headers` : politique de contenu et en-têtes servis par Workers Static Assets. La page ne charge pas de scripts ni de ressources externes ; réviser cette politique si ces besoins changent.
- `public/404.html` : page d'erreur pour les chemins inconnus.
- `public/confidentialite.html` : politique de confidentialité des applications et de la connexion facultative à Google Drive.
- `public/robots.txt` et `public/sitemap.xml` : découverte par les moteurs de recherche.

Conserver des liens HTTPS vers les versions de production et ne jamais ajouter de données personnelles, de sauvegardes, de jetons ou de secrets dans ce dépôt.
