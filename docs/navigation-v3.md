# Mondes de navigation V3

La comparaison est séparée sur /concepts/v3/. Les liens fixes utilisent /concepts/v3/explore.html?concept=plan, reacteur ou anamorphose. Les paramètres publics app (finapp, garapp, branchlab) et angle (presentation, action, methode, limites) reconstruisent une destination complète. Aucun texte libre, calcul ou donnée personnelle n’est transporté.

## Trois expériences

- Plan-séquence : une maison WebGL2 sculptée, avec un bureau pour Finapp et Branchlab et un garage pour le véhicule Garapp. Une entrée extérieure et une porte intérieure relient réellement les pièces. La vue d’ensemble peut retirer le toit ; une fois entré, le regard reste à 1,65 m et les déplacements au sol respectent les murs, le bureau et la voiture. Glisser fait regarder, W/A/S/D et les boutons tactiles font marcher. Survoler ou focaliser un support annonce son rôle ; le premier tap tactile affiche un aperçu et une action Découvrir. Une activation approche le poste ou le véhicule par les portes, puis agrandit son support vers une lecture plein champ. Une présentation unique de chaque application et sa sortie réelle sont disponibles dans ce lecteur. Fermer ou Échap referme vers le même objet et restaure le focus. Les poses et aperçus n’ajoutent pas d’entrée d’historique par frame.
- Réacteur : établi CSS3D à deux prises, outil et angle. Glisser-déposer ou activer un ingrédient recompose les18pièces de matière. L’angle peut précéder l’outil et reste choisi lors d’un remplacement. Les molettes près de la lecture évitent de remonter vers les banques sur mobile.
- Anamorphose : relief WebGL2 typographique, visées guidées et point de vue libre borné. Les fragments et inscriptions sont distribués en profondeur ; le changement de regard révèle une autre lecture. Aucun ajustement au pixel n’est nécessaire.

Les explications sont celles du catalogue public ; les illustrations sont fictives. Les applications réelles s’ouvrent dans le même onglet sur leurs sous-domaines, sans embarquer leur interface ni échanger leurs données.

### Manipuler les objets de la maison

Chaque application du Plan-séquence possède une seule page d’explication continue : présentation, fonctions principales et accès à l’application. Le lecteur et le parcours sans WebGL n’affichent plus de choix entre rôle, action, méthode ou limites. Les anciennes URL `angle=action`, `angle=methode` et `angle=limites`, ainsi que les anciens états d’historique, rejoignent cette même page et sont normalisés vers une URL sans `angle`. Les autres maquettes conservent leurs mécanismes de comparaison.

L’aperçu de chaque support propose aussi une démonstration sur place. La caméra rejoint le support par les passages existants. Finapp permet de faire varier un horizon fictif de 5 à 20 ans sur l’écran ; Branchlab branche et débranche une liaison, avec un connecteur qui se déplace réellement et un signal ponctuel ; le carnet articulé Garapp ouvre trois événements fictifs, avec une pagination bornée. Ces démonstrations ne chargent aucune donnée des applications.

Les commandes sont projetées sur les écrans et la page du carnet. Découvrir ouvre le lecteur à partir de ce support ; sa fermeture rend la manipulation et son état. Revenir dans la pièce ou Échap quitte la démonstration. L’historique conserve l’horizon, la connexion et la page avec la pose ; aucun changement de curseur ou frame d’animation n’ajoute d’entrée d’historique. Les animations se terminent après l’action et respectent le mouvement réduit.

La maison-atelier est implantée dans un jardin minéral continu : relief, rochers aux normales lissées, graminées instanciées et horizons brumeux. Le zinc, le chêne, l'enduit clair et les tons sauge composent une direction originale. Le bardage, les gouttières, les joints, les luminaires et les détails du bureau donnent une échelle à l'architecture. La voiture conserve ses passages de roues ouverts et reçoit une réflexion locale du véritable garage. Les écrans larges et leurs coordonnées UV normalisées gardent les démonstrations sur place ; chaque application conserve une seule page d'explication. Les commandes translucides se superposent désormais à la scène plein écran.

La maison conserve sa géométrie compacte : toiture à joints debout, tableaux de fenêtres, plinthes, porte à panneaux et parquet. La vue en coupe soulève et efface le toit puis le remet à sa position exacte ; les collisions au sol restent identiques pendant cette transition. Le carnet ouvre sa couverture en 3D avant la lecture.

## État et accessibilité

Le noyau ne partage que les destinations, l’historique/focus et les préférences. Les modules restent montés pendant la navigation sémantique et possèdent leurs gestes, mouvements et poses. Retour/Avant restaure aussi la pose transitoire, le lecteur ouvert/fermé, son défilement et le focus. La fermeture explicite garde l’application dans l’URL et mémorise la vue du support ; un nouveau lien direct ouvre la lecture. Les poses ne figurent pas dans les URL partagées.

Les liens explicites fixent leur concept indépendamment d’une préférence figée. Sans concept forcé, un rechargement suit Plan → Réacteur → Anamorphose. Figer garde le courant. Reprendre conserve la vue immédiatement puis réactive la suite au prochain rechargement. La clé siniverse.navigation-concepts.v3 est indépendante de V1/V2 ; session, historique d’onglet et mémoire servent de replis.

Les commandes sont de vrais liens/boutons. Les repères du Plan sont masqués lorsqu’ils sont hors champ ou derrière la maison. L’aperçu reste lié à un objet exposé ; la lecture utilise un dialog plein champ avec retour explicite, Échap et focus contenu. Les trajets directs restent disponibles. Le mouvement réduit conserve les destinations sans animation décorative continue. Une perte réelle ou une indisponibilité WebGL expose une navigation textuelle, sans présenter ce fallback comme un rendu3D.

## Moteur et budget

Three.js0.187.0 et esbuild0.28.2 sont verrouillés dans package/lock. Les deux fichiers officiels Three sont vérifiés par SHA256, minifiés localement et servis sous /concepts/v3/vendor/ avec licence MIT et provenance détaillée. Le serveur dev utilise la même génération, avec une whitelist de quatre fichiers. Aucun CDN, importmap inline, texture distante, API IA ou service ajouté.

Budget strict des deux modules :1,5Mo bruts et350Ko gzip au maximum ; sortie actuelle environ772Ko minifiés/199Ko gzip. Les cartes photographiques de chêne, gravier, roche et relief d'enduit proviennent de [Poly Haven, sous CC0](https://polyhaven.com/license). Leurs sources, empreintes et conversions WebP sont consignées dans `public/assets/house/provenance.json` ; les sept fichiers 1K restent sous 3Mo. Ils sont servis localement. Les matières procédurales assurent l'affichage initial et les tests sans DOM, puis sont remplacées quand les cartes sont chargées. Aucun modèle, texture ou code d'Igloo n'est repris.

La radiance du ciel HDR est générée en mémoire ; une capture cubique ponctuelle du garage produit les reflets de la voiture. Le rendu du Plan ajoute une occlusion ambiante à demi-résolution, un filtre de profondeur qui respecte les contours, une légère halation et une sortie ACES avec une seule conversion sRGB. Le rendu couleur utilise deux échantillons d'anticrénelage, dans la limite du GPU. Le DPR reste plafonné à1,5 et le tampon à2,4millions de pixels. Si WebGL signale un moteur logiciel, le budget descend à400000pixels, les ombres à1024px et la végétation à1800touffes, avec les mêmes matériaux et interactions. Le rendu reste à la demande, sans animation décorative continue ; les frames s'arrêtent lorsque la page est masquée. Les ombres directionnelles sont recalculées lors d'un changement de géométrie (toit, carnet ou câble). Textures, captures cubiques, cibles de rendu, géométries et matières sont libérées à la sortie.

## Vérification

npm test couvre routes, assemblage libre, préférences isolées, poses de caméra, bornes de déplacement, distinction clic/drag et provenance du moteur. Le workflow Concept browser review utilise le Chrome déjà installé sur ubuntu-24.04. SwiftShader et son opt-in sont limités à ce harnais isolé ; ils ne configurent pas le navigateur des visiteurs.

Le QA exige un vrai WebGL2, des pixels non uniformes, une entrée et une marche humaine par les passages, du picking natif sur les postes/voiture et un mur réellement occultant pour le Plan, une recomposition de géométrie/poses CSS3D pour le Réacteur et une erreur de reprojection/profondeur réelle pour l’Anamorphose. Il vérifie les gestes, aperçus répétés, activation tactile/clavier, expansion depuis le support, fermeture et interruption par Échap, focus, défilement Back/Forward, collisions, rotation, stockage bloqué, mouvement réduit et perte réelle de contexte. Captures et rapport ont une rétention d’un jour. Les V1/V2 restent des régressions du même parcours, sans modification de leur comportement.

Les démonstrations sur support ajoutent des contrôles navigateur ordinateur/mobile : variation native du curseur, modification des courbes, connexion réversible du câble physique, ouverture du carnet, bornes de pagination et conservation après lecture. Les tests de géométrie vérifient aussi le retour exact du toit et du connecteur, ainsi que les bornes de la charnière.

Les assertions d’état et les attentes des tests consultent un état léger avec `inspect({fast:true})` : aucune lecture de pixels ni recherche de cible 3D pour ces attentes. Les points de contrôle visuels et de picking utilisent l’inspection complète pour mesurer les pixels et les maillages et retrouver les objets à cliquer. Le comportement d’inspection par défaut conserve ces mesures.

Les deux HTML V3 reçoivent la version CI. La CSP interactive reste limitée à /concepts/* avec imports locaux ; l’accueil et la confidentialité ne changent pas. La CI partagée/pin et les Workers existants sont conservés. Toute promotion en production reste une PR dev→main après test et accord explicite.
