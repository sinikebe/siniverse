# Versions antérieures au reset

Le 13 novembre 2026, le portail Siniverse est réinitialisé à `0.0.1` à la demande de son propriétaire pour commencer le versionnement commun aux quatre applications.

Avant ce reset, `package.json` et `package-lock.json` indiquaient `1.0.0`. Leur dernier état est conservé dans le commit `f16bb9f893992e0a1145f45d95908f697b13e56e` et dans l'historique Git. Aucun changelog antérieur n'est supprimé ; le dépôt n'en contenait pas.

Le paquet API `siniverse-auth-api` indiquait `0.1.0` dans ce même commit. Son numéro est également réinitialisé à `0.0.1` ; il n'existe pas de lockfile API séparé. Aucun code, donnée ou format de session de l'API ne change.

`0.0.1` reste la valeur locale par défaut. La version réelle est attribuée par la CI dans un tag annoté immuable, puis injectée par `SINIVERSE_VERSION` dans le build. Le pied de page fonctionne hors connexion, sans requête de version à l'exécution.
