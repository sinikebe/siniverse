# Comparaison des concepts d’accueil

L’accueil existant reste inchangé pendant la sélection. Les trois maquettes se trouvent sur une route séparée :

- `/concepts/?concept=instrument` : Instrument impossible.
- `/concepts/?concept=fil` : Fil des possibles.
- `/concepts/?concept=machine` : Machine à déclics.
- `/concepts/` : démonstration de rotation séquentielle au rechargement.

Un lien direct reste stable et ne remplace pas un éventuel thème mémorisé. « Figer ce thème » enregistre un choix explicite. « Reprendre la rotation » conserve la scène courante, retire le concept forcé de l’URL si l’historique est accessible, puis laisse le rechargement suivant avancer.

La clé `siniverse.home-concepts.v1` est isolée des données des applications. Le stockage local se replie sur la session, l’état de l’onglet puis la mémoire. Si tout stockage est bloqué, les commandes restent utilisables et la page indique la durée limitée du choix. Les données d’exemple sont fictives ; aucune API, iframe d’application ou synchronisation distante n’est utilisée.

Les liens réels des trois apps sont présents dès l’en-tête. Chaque mécanisme dispose de boutons utilisables au clavier ; les animations sont ponctuelles et le mouvement réduit supprime les transitions, la rotation d’objet et la parallaxe. Le ruban utilise le défilement natif, sans détourner la molette verticale.

Les scripts sont locaux et la CSP reste stricte hors de `/concepts/*`. Le build injecte la version CI dans le footer commun. Les tests couvrent surtout choix direct/rotation/épingle, reprise et défaillances de stockage. La revue navigateur doit compléter ces contrôles pour les rendus ordinateur/mobile.
