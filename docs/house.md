# La maison Siniverse

Le plan-séquence est l’unique accueil, à `/`. Le bureau présente Finapp et Branchlab, le garage présente Garapp et la salle gaming prépare l’arrivée des jeux. Les démonstrations sont fictives et les applications gardent leurs domaines et leurs données.

Liens directs : `/?app=finapp`, `/?app=garapp`, `/?app=branchlab` et `/?room=gaming`. Les anciennes URL `/concepts/*` sont redirigées vers l’accueil ; les paramètres de concept et d’angle sont ignorés puis retirés de l’URL. Il n’existe plus de sélection, d’épinglage ni de rotation de concepts. La visite ne dépend d’aucun stockage local.

Le code et les styles de la maison se trouvent dans `public/house/`. Les textures photographiques locales gardent leur provenance dans `public/assets/house/provenance.json`. Three.js est généré depuis la dépendance verrouillée dans `dist/house/vendor/`. Les collisions, le rendu adaptatif, la vue en coupe et les passages par les portes restent conservés.

Le chantier statique est construit dans `construction-site.mjs` : pelleteuse sur chenilles, grue à tour en arrière-plan, barrières, cônes, panneau et matériaux. Le terrain est nivelé et la végétation dégagée autour des installations. Elles restent hors des parcours à pied ; le treillis de la grue et les patins des chenilles sont instanciés pour limiter le coût de rendu. Aucune animation de chantier ni boucle de rendu continue n’est ajoutée.

Les liens sémantiques et l’historique du navigateur gardent les vues, le focus, les lectures, les manipulations et la bibliothèque gaming. Une page sans JavaScript conserve les accès directs aux applications ; sans WebGL, la lecture reste disponible dans une version textuelle.

`node tools/check-house-browser.mjs` examine l’accueil sur ordinateur et mobile après le build : déplacements, occlusion, lectures, manipulations, bibliothèque, historique, absence de stockage et mouvement réduit. La CI publie uniquement sur dev jusqu’à l’accord explicite du propriétaire pour promouvoir main.
