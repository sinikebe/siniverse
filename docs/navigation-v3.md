# Mondes de navigation V3

La comparaison est séparée sur /concepts/v3/. Les liens fixes utilisent /concepts/v3/explore.html?concept=plan, reacteur ou anamorphose. Les paramètres publics app (finapp, garapp, branchlab) et angle (presentation, action, methode, limites) reconstruisent une destination complète. Aucun texte libre, calcul ou donnée personnelle n’est transporté.

## Trois expériences

- Plan-séquence : une maison toon WebGL2, avec un bureau pour Finapp et Branchlab et un garage pour le véhicule Garapp. Une entrée extérieure et une porte intérieure relient réellement les pièces. La vue d’ensemble peut retirer le toit ; une fois entré, le regard reste à 1,65 m et les déplacements au sol respectent les murs, le bureau et la voiture. Glisser fait regarder, W/A/S/D et les boutons tactiles font marcher ; les flèches gauche/droite tournent le regard. Les trajets directs utilisent les passages ouverts, avec une halte devant la voiture avant la lecture du carnet. Les explications sont projetées sur les deux écrans et le carnet physique. Le mode lecture garde ce support et donne la place au texte. Une pose libre ne crée pas une entrée d’historique par frame.
- Réacteur : établi CSS3D à deux prises, outil et angle. Glisser-déposer ou activer un ingrédient recompose les18pièces de matière. L’angle peut précéder l’outil et reste choisi lors d’un remplacement. Les molettes près de la lecture évitent de remonter vers les banques sur mobile.
- Anamorphose : relief WebGL2 typographique, visées guidées et point de vue libre borné. Les fragments et inscriptions sont distribués en profondeur ; le changement de regard révèle une autre lecture. Aucun ajustement au pixel n’est nécessaire.

Les explications sont celles du catalogue public ; les illustrations sont fictives. Les applications réelles s’ouvrent dans le même onglet sur leurs sous-domaines, sans embarquer leur interface ni échanger leurs données.

## État et accessibilité

Le noyau ne partage que les destinations, l’historique/focus et les préférences. Les modules restent montés pendant la navigation sémantique et possèdent leurs gestes, mouvements et poses. Retour/Avant restaure aussi la pose transitoire et la lecture ouverte/fermée. Les poses ne figurent pas dans les URL partagées.

Les liens explicites fixent leur concept indépendamment d’une préférence figée. Sans concept forcé, un rechargement suit Plan → Réacteur → Anamorphose. Figer garde le courant. Reprendre conserve la vue immédiatement puis réactive la suite au prochain rechargement. La clé siniverse.navigation-concepts.v3 est indépendante de V1/V2 ; session, historique d’onglet et mémoire servent de replis.

Les commandes sont de vrais liens/boutons. Les repères du Plan sont masqués lorsqu’ils sont hors champ ou derrière la maison ; une lecture partiellement visible reste découpée par le viewport. Les trajets directs restent disponibles. Le mouvement réduit conserve les destinations sans animation décorative continue. Une perte réelle ou une indisponibilité WebGL expose une navigation textuelle, sans présenter ce fallback comme un rendu3D.

## Moteur et budget

Three.js0.187.0 et esbuild0.28.2 sont verrouillés dans package/lock. Les deux fichiers officiels Three sont vérifiés par SHA256, minifiés localement et servis sous /concepts/v3/vendor/ avec licence MIT et provenance détaillée. Le serveur dev utilise la même génération, avec une whitelist de quatre fichiers. Aucun CDN, importmap inline, texture distante, API IA ou service ajouté.

Budget strict des deux modules :1,5Mo bruts et350Ko gzip au maximum ; sortie actuelle environ772Ko minifiés/199Ko gzip. Le Plan limite le DPR à1,5, rend à la demande et arrête ses frames lorsque la page est masquée. Les animations sont liées aux actions. Les trois scènes libèrent leurs ressources à la sortie.

## Vérification

npm test couvre routes, assemblage libre, préférences isolées, poses de caméra, bornes de déplacement, distinction clic/drag et provenance du moteur. Le workflow Concept browser review utilise le Chrome déjà installé sur ubuntu-24.04. SwiftShader et son opt-in sont limités à ce harnais isolé ; ils ne configurent pas le navigateur des visiteurs.

Le QA exige un vrai WebGL2, des pixels non uniformes, une entrée et une marche humaine par les passages, du picking natif sur les postes/voiture et un mur réellement occultant pour le Plan, une recomposition de géométrie/poses CSS3D pour le Réacteur et une erreur de reprojection/profondeur réelle pour l’Anamorphose. Il vérifie les gestes, états, Back/Forward, lecture, rotation, stockage bloqué, mouvement réduit et perte réelle de contexte. Captures et rapport ont une rétention d’un jour. Les V1/V2 restent des régressions du même parcours, sans modification de leur comportement.

Les deux HTML V3 reçoivent la version CI. La CSP interactive reste limitée à /concepts/* avec imports locaux ; l’accueil et la confidentialité ne changent pas. La CI partagée/pin et les Workers existants sont conservés. Toute promotion en production reste une PR dev→main après test et accord explicite.
