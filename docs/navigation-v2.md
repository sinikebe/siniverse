# Trois grammaires de navigation

La comparaison V2 est séparée de l’accueil et des premières scènes : [comparateur](/concepts/v2/), [Emboîtement](/concepts/v2/explore.html?concept=emboitement), [Bifurcations](/concepts/v2/explore.html?concept=bifurcations), [Montage](/concepts/v2/explore.html?concept=montage).

## Modèles de navigation

- **Emboîtement** : Ensemble → outil → rôle, méthode ou exemple. Les régions du dessin sont de vrais liens. Leur parent reste le cadre de retour ; « Ressortir » fonctionne aussi depuis un lien profond.
- **Bifurcations** : les fragments du récit sont des destinations révisables. Revenir à un mot permet de choisir une autre suite ; la partie abandonnée du chemin disparaît de l’état courant.
- **Montage** : une explication s’ouvre à côté de sa source. Trois surfaces actives au maximum ; deux peuvent être conservées. Une source évincée reste nommée et navigable. Replier une surface garde les autres.

Le noyau ne partage que le catalogue public, les URL validées et le transport de l’historique/focus. Les paramètres \`lieu\`, \`chemin\`, \`avec\`, \`focus\`, \`garder\`, \`depuis\` portent uniquement des identifiants connus ; aucun texte libre ni donnée personnelle. Retour/Avant restaure l’état entier et le contrôle d’origine, et ne choisit jamais une nouvelle grammaire.

Les liens externes ouvrent normalement les applications sur leurs sous-domaines. Le portail explique leur rôle avec des exemples fictifs ; il n’embarque pas leurs moteurs, leurs interfaces ou leurs données.

## Comparaison et rotation

Un lien explicite \`?concept=…\` reste stable et ne change pas une préférence figée ailleurs. Le mode Rotation sans concept forcé choisit, à l’arrivée ou au rechargement, Emboîtement → Bifurcations → Montage. Figer garde le courant. Reprendre retire le choix forcé de l’URL, garde la vue à l’écran et réactive la suite au prochain rechargement.

La clé \`siniverse.navigation-concepts.v2\` est indépendante de la V1. Les replis session, historique de l’onglet puis mémoire gardent le site utilisable quand le stockage est bloqué. L’état de navigation et la préférence occupent des clés distinctes dans history.state. Si tout stockage est interdit, la préférence ne peut survivre à une nouvelle visite.

## Vérification

\`npm test\` vérifie les graphes, liens profonds, parents, choix révisés, montage borné, préférences et replis. Le workflow **Concept browser review** utilise le Chrome déjà installé sur ubuntu-24.04, sans télécharger de navigateur ni ajouter de service. Il effectue les visites complètes sur ordinateur et mobile, l’activation clavier des régions SVG, Retour/Avant et le focus, la reprise d’une source repliée, la rotation/épingle et le mouvement réduit. Les captures et le rapport JSON ont une rétention d’un jour.

Les deux documents reçoivent la version CI au build. La CSP interactive reste limitée à \`/concepts/*\` avec scripts/styles locaux ; l’accueil et la confidentialité conservent leurs restrictions existantes. Aucune promotion de la V2 en production ne se fait sans revue et accord après test de dev.
