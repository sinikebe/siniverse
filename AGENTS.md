# Règles de contribution Siniverse

Toute PR de travail cible d'abord `dev`. Le propriétaire teste la version de dev. Seule une PR `dev` vers `main`, depuis le même dépôt, peut promouvoir la production et nécessite son accord explicite après ce test. Une fusion vers `dev` peut être réalisée sans nouvel accord ; aucune promotion vers `main` ne doit être automatique.

Choisir le titre de chaque PR selon le vrai changement : `feat:` pour une fonctionnalité, `fix:` pour une correction, et `!` dans le titre Conventional Commit ou `BREAKING CHANGE:` dans le corps pour une rupture de compatibilité. Ces marqueurs décrivent le changement mais ne déterminent plus l’incrément de version.

Chaque commit intégré dans l’historique principal de `dev` incrémente uniquement le patch. Une PR fusionnée compte une fois, sans recompter les commits de sa branche de travail. Chaque promotion `dev` vers `main` incrémente une fois la minor de la dernière production et remet le patch à zéro. Les labels `semver:*` ne remplacent pas cette règle. Une relance de CI réutilise la version du même commit. Après une production plus récente, les patchs de dev partent de cette version, sans diminuer une version dev historique déjà attribuée.

Après le reset initial, ne pas augmenter manuellement les versions de `package.json` et des lockfiles : `0.0.1` est la base locale. La CI attribue les versions réelles par tags annotés immuables des canaux main/dev et injecte `SINIVERSE_VERSION` au build. Le footer, les métadonnées de déploiement et les caches doivent rester cohérents avec cette valeur. Voir `automation/VERSIONING.md`.

Préserver main/dev, l'historique archivé et les données applicatives. Ne pas ajouter de service de release, PAT, secret ou infrastructure pour le versionnement.
