# Mondes de navigation V3

La comparaison est séparée sur /concepts/v3/. Les liens fixes utilisent /concepts/v3/explore.html?concept=plan, reacteur ou anamorphose. Les paramètres publics app (finapp, garapp, branchlab) et angle (presentation, action, methode, limites) reconstruisent une destination complète. Aucun texte libre, calcul ou donnée personnelle n’est transporté.

## Trois expériences

- Plan-séquence : monde WebGL2 continu, voies Finapp en relief, véhicule et boucle de repères Garapp, chaîne vidéo Branchlab. Le glisser fait regarder ; Maj+glisser et W/A/S/D déplacent le point de vue ; flèches, boutons tactiles et zoom donnent des équivalents. Les objets et prises du monde proposent des trajets guidés. Une pose libre ne crée pas une entrée d’historique par frame.
- Réacteur : établi CSS3D à deux prises, outil et angle. Glisser-déposer ou activer un ingrédient recompose les18pièces de matière. L’angle peut précéder l’outil et reste choisi lors d’un remplacement. Les molettes près de la lecture évitent de remonter vers les banques sur mobile.
- Anamorphose : relief WebGL2 typographique, visées guidées et point de vue libre borné. Les fragments et inscriptions sont distribués en profondeur ; le changement de regard révèle une autre lecture. Aucun ajustement au pixel n’est nécessaire.

Les explications sont celles du catalogue public ; les illustrations sont fictives. Les applications réelles s’ouvrent dans le même onglet sur leurs sous-domaines, sans embarquer leur interface ni échanger leurs données. Une place libre dans le Plan évoque de futurs projets sans annoncer une application disponible.

## État et accessibilité

Le noyau ne partage que les destinations, l’historique/focus et les préférences. Les modules restent montés pendant la navigation sémantique et possèdent leurs gestes, mouvements et poses. Retour/Avant restaure aussi la pose transitoire et la lecture ouverte/fermée. Les poses ne figurent pas dans les URL partagées.

Les liens explicites fixent leur concept indépendamment d’une préférence figée. Sans concept forcé, un rechargement suit Plan → Réacteur → Anamorphose. Figer garde le courant. Reprendre conserve la vue immédiatement puis réactive la suite au prochain rechargement. La clé siniverse.navigation-concepts.v3 est indépendante de V1/V2 ; session, historique d’onglet et mémoire servent de replis.

Les commandes sont de vrais liens/boutons ; les cibles hors champ du Plan sont masquées du Tab et les trajets directs restent disponibles. Le mouvement réduit conserve les destinations sans animation décorative continue. Une perte réelle ou une indisponibilité WebGL expose une navigation textuelle, sans présenter ce fallback comme un rendu3D.

## Moteur et budget

Three.js0.187.0 et esbuild0.28.2 sont verrouillés dans package/lock. Les deux fichiers officiels Three sont vérifiés par SHA256, minifiés localement et servis sous /concepts/v3/vendor/ avec licence MIT et provenance détaillée. Le serveur dev utilise la même génération, avec une whitelist de quatre fichiers. Aucun CDN, importmap inline, texture distante, API IA ou service ajouté.

Budget strict des deux modules :1,5Mo bruts et350Ko gzip au maximum ; sortie actuelle environ772Ko minifiés/199Ko gzip. Le Plan limite le DPR à1,5, rend à la demande et arrête ses frames lorsque la page est masquée. Les animations sont liées aux actions. Les trois scènes libèrent leurs ressources à la sortie.

## Vérification

npm test couvre routes, assemblage libre, préférences isolées, poses de caméra, bornes de déplacement, distinction clic/drag et provenance du moteur. Le workflow Concept browser review utilise le Chrome déjà installé sur ubuntu-24.04. SwiftShader et son opt-in sont limités à ce harnais isolé ; ils ne configurent pas le navigateur des visiteurs.

Le QA exige un vrai WebGL2, des pixels non uniformes et du picking natif pour le Plan, une recomposition de géométrie/poses CSS3D pour le Réacteur et une erreur de reprojection/profondeur réelle pour l’Anamorphose. Il vérifie les gestes, états, Back/Forward, lecture, rotation, stockage bloqué, mouvement réduit et perte réelle de contexte. Captures et rapport ont une rétention d’un jour. Les V1/V2 restent des régressions du même parcours, sans modification de leur comportement.

Les deux HTML V3 reçoivent la version CI. La CSP interactive reste limitée à /concepts/* avec imports locaux ; l’accueil et la confidentialité ne changent pas. La CI partagée/pin et les Workers existants sont conservés. Toute promotion en production reste une PR dev→main après test et accord explicite.
