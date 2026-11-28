# La maison Siniverse

Le plan-séquence est l’unique accueil, à `/`. Le bureau ouvre Finapp et Branchlab, le garage donne accès à Garapp et la salle gaming accueille les jeux.

À côté de la voiture, l’écran mural ouvre Garapp depuis son domaine habituel, `https://garapp.siniverse.cc`. Cliquez sur l’écran ou la voiture, ou suivez le lien direct `/?room=garage`. Sur ordinateur, l’application s’affiche sur le mur et peut être agrandie. Sur mobile, elle s’ouvre en grand. Pendant la visite, Garapp garde sa page et les saisies en cours quand on agrandit l’écran, revient au garage ou quitte la pièce. La fiche `/?app=garapp` propose aussi d’utiliser l’écran. Le carnet à feuilleter à côté du véhicule reste un exemple fictif.

Le bureau du PC gaming affiche une icône Décalage, également disponible dans sa vue agrandie. Elle ouvre `https://dev.decalage.siniverse.cc` dans un nouvel onglet depuis dev et en local. Lors d’une future promotion vers main, le site de production utilisera `https://decalage.siniverse.cc`, sans préfixe dev. Le jeu ne se charge pas pendant la visite de la maison ; les contrôles de Siniverse vérifient seulement le lien et ne lancent pas le jeu.

Le bureau dispose d’un seul PC pour Finapp et Branchlab. `/?room=office` ouvre son bureau ; `/?room=office&program=finapp` et `/?room=office&program=branchlab` ouvrent directement les applications. Elles se chargent à la demande depuis leurs domaines publics, dans des cadres isolés dont les droits sont limités aux fonctions usuelles des apps (scripts, stockage de leur origine, formulaires, sauvegardes et fenêtres de connexion). Le sélecteur interne de Finapp peut aussi ouvrir Garapp : son domaine est donc autorisé, sans ajouter de raccourci Garapp au PC.

Les deux cadres restent montés lorsque l’on change d’app, revient au bureau, réduit l’écran ou quitte le poste. Le plein écran est automatique sur mobile et disponible sur ordinateur. Une perte de WebGL bascule l’écran dans une fenêtre classique sans recréer les cadres. Siniverse ne lit ni ne recopie leurs données. Les liens `/?app=…` conservent les présentations ; l’ancien câble et les mini-démonstrations fictives du bureau ont été retirés. Le carnet Garapp reste dans le garage.

Liens directs : `/?app=finapp`, `/?app=garapp`, `/?app=branchlab` et `/?room=gaming`. Les anciennes URL `/concepts/*` sont redirigées vers l’accueil ; les paramètres de concept et d’angle sont ignorés puis retirés de l’URL. Il n’existe plus de sélection, d’épinglage ni de rotation de concepts. La visite ne dépend d’aucun stockage local.

Le code et les styles de la maison se trouvent dans `public/house/`. Les textures photographiques locales gardent leur provenance dans `public/assets/house/provenance.json`. Three.js est généré depuis la dépendance verrouillée dans `dist/house/vendor/`. Les collisions, le rendu adaptatif, la vue en coupe et les passages par les portes restent conservés.

Une rue résidentielle longe la façade et rejoint le chemin d’entrée et l’allée du garage. Une longère, une maison à patio et une maison à pignon composent le voisinage. Le jardin bas contre le garage réserve environ 8 × 10 m pour une future extension. Dans « Trajets directs », « La rue depuis le seuil » tourne la caméra vers la maison d’en face. Cette vue est aussi accessible à `/?room=street`.

Les graminées suivent la brise, la pelleteuse travaille sur son tas de terre et le chariot de la grue déplace son crochet en fond de scène. Ces mouvements se déroulent à des rythmes différents. Ils se mettent en pause à l’intérieur, en vue en coupe, lorsque l’onglet est masqué ou lorsque la réduction des animations est activée.

Les liens sémantiques et l’historique du navigateur gardent les vues, le focus, les lectures, les manipulations et la bibliothèque gaming. Une page sans JavaScript conserve les accès directs aux applications ; sans WebGL, la lecture reste disponible dans une version textuelle.

`node tools/check-house-browser.mjs` examine l’accueil sur ordinateur et mobile après le build : déplacements, occlusion, lectures, carnet, bibliothèque, historique, absence de stockage et mouvement réduit. Le PC utilise des pages de test isolées sur les deux origines autorisées pour vérifier la saisie, les changements de fenêtre et la conservation d’un brouillon après agrandissement, fermeture ou perte de WebGL, sans toucher aux données des vrais sites. L’intégration des applications publiques est aussi vérifiée dans le navigateur sur dev. La CI publie uniquement sur dev jusqu’à l’accord explicite du propriétaire pour promouvoir main.
