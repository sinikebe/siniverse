# Règles de contribution Siniverse

Choisir le titre de chaque PR selon le vrai changement : `feat:` pour une fonctionnalité, `fix:` pour une correction, et `!` dans le titre Conventional Commit ou `BREAKING CHANGE:` dans le corps pour une rupture de compatibilité. Les autres changements reçoivent un incrément patch par défaut.

Un seul label `semver:major`, `semver:minor` ou `semver:patch` peut remplacer cette classification si nécessaire. Ne pas cumuler ces labels.

Après le reset initial autorisé, ne pas augmenter manuellement les versions de `package.json` et des lockfiles : `0.0.1` est la base locale. La CI attribue les versions réelles par tags annotés immuables des canaux main/dev et injecte `SINIVERSE_VERSION` au build. Le footer, les métadonnées de déploiement et les caches doivent rester cohérents avec cette valeur. Voir `automation/VERSIONING.md`.

Préserver main/dev, l'historique archivé et les données applicatives. Ne pas ajouter de service de release, PAT, secret ou infrastructure pour le versionnement.
