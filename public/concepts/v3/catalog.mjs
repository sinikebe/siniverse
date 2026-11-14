// Public descriptions and clearly fictional examples, shared by the three scenes.
export const APPS = {
  "finapp": {
    "name": "Finapp",
    "url": "https://finapp.siniverse.cc",
    "color": "#3866F2"
  },
  "garapp": {
    "name": "Garapp",
    "url": "https://garapp.siniverse.cc",
    "color": "#DB7253"
  },
  "branchlab": {
    "name": "Branchlab",
    "url": "https://branchlab.siniverse.cc",
    "color": "#9E78D7"
  }
};
export const CONTENT = {
  "finapp": {
    "presentation": {
      "id": "finapp",
      "app": "finapp",
      "eyebrow": "AVANT DE DÉCIDER",
      "title": "Donner un horizon à ses choix.",
      "body": [
        "Acheter ou louer, épargner, changer de voiture : Finapp met deux scénarios en regard et montre comment le budget et le patrimoine peuvent évoluer.",
        "Un même horizon rend les hypothèses comparables. L’application reste l’endroit où vous saisissez vos propres scénarios."
      ],
      "facts": [
        {
          "label": "À explorer",
          "value": "Horizon · scénarios · écarts"
        }
      ],
      "related": {
        "app": "garapp",
        "label": "Et après l’achat du véhicule ?"
      }
    },
    "action": {
      "id": "finapp.exemple",
      "app": "finapp",
      "eyebrow": "EXEMPLE FICTIF",
      "title": "Deux chemins, un même horizon.",
      "body": [
        "Camille hésite entre acheter une voiture et conserver une solution de location. À dix ans, les deux approches ne répartissent ni les dépenses ni le patrimoine de la même façon.",
        "L’exemple met en regard deux façons de lire le même choix, sans projection chiffrée."
      ],
      "facts": [
        {
          "label": "Scénario A",
          "value": "Acheter"
        },
        {
          "label": "Scénario B",
          "value": "Louer"
        },
        {
          "label": "Horizon commun",
          "value": "10 ans"
        }
      ],
      "related": {
        "app": "garapp",
        "label": "Après le choix, conserver son historique"
      }
    },
    "methode": {
      "id": "finapp.methode",
      "app": "finapp",
      "eyebrow": "LA MÉTHODE",
      "title": "Même horizon, hypothèses visibles.",
      "body": [
        "Définissez les deux scénarios, choisissez un horizon commun, puis regardez leur évolution et leurs écarts.",
        "Le portail explique cette lecture ; les calculs et les paramètres appartiennent à Finapp."
      ],
      "facts": [
        {
          "label": "1",
          "value": "Poser deux scénarios"
        },
        {
          "label": "2",
          "value": "Partager un horizon"
        },
        {
          "label": "3",
          "value": "Lire les écarts"
        }
      ]
    },
    "limites": {
      "eyebrow": "LES HYPOTHÈSES RESTENT VISIBLES",
      "title": "Une projection est un scénario.",
      "body": [
        "Les évolutions dépendent des paramètres choisis. Comparer deux scénarios au même horizon aide à lire leurs écarts ; cela ne prédit pas le futur.",
        "Dans Finapp, vos propres hypothèses prennent la place de cet exemple fictif."
      ],
      "facts": [
        {
          "label": "À garder en tête",
          "value": "Horizon et hypothèses"
        }
      ]
    }
  },
  "garapp": {
    "presentation": {
      "id": "garapp",
      "app": "garapp",
      "eyebrow": "AU FIL DES JOURS",
      "title": "Un véhicule laisse des repères.",
      "body": [
        "Garapp rassemble interventions, pièces et documents des véhicules. Le carburant, l’assurance et les dépenses y trouvent aussi leur place.",
        "Une date, une intervention, un justificatif : ce qui était dispersé devient plus facile à retrouver."
      ],
      "facts": [
        {
          "label": "À explorer",
          "value": "Historique · dépenses · documents"
        }
      ],
      "related": {
        "app": "finapp",
        "label": "Revenir à un choix à anticiper"
      }
    },
    "action": {
      "id": "garapp.exemple",
      "app": "garapp",
      "eyebrow": "HISTORIQUE FICTIF",
      "title": "Un repère qui reste lisible.",
      "body": [
        "Le 24 avril 2026, Camille remplace les essuie-glaces de son véhicule. La dépense de 34 € et le justificatif rejoignent le même repère.",
        "Ce ticket est un exemple de ce que l’on retrouve dans un historique, pas une donnée provenant de Garapp."
      ],
      "facts": [
        {
          "label": "24 avril 2026",
          "value": "Essuie-glaces"
        },
        {
          "label": "Dépense d’exemple",
          "value": "34 €"
        },
        {
          "label": "Trace",
          "value": "Justificatif joint"
        }
      ]
    },
    "methode": {
      "id": "garapp.methode",
      "app": "garapp",
      "eyebrow": "LA MÉTHODE",
      "title": "Rattacher chaque trace au véhicule.",
      "body": [
        "Ajoutez un repère daté, une dépense et, si besoin, un document. Retrouvez ensuite le fil par véhicule.",
        "Un historique structuré facilite la lecture des entretiens et des dépenses dans la durée."
      ],
      "facts": [
        {
          "label": "Repère",
          "value": "Date et intervention"
        },
        {
          "label": "Contexte",
          "value": "Pièce, dépense, document"
        }
      ]
    },
    "limites": {
      "eyebrow": "LE PÉRIMÈTRE DU SUIVI",
      "title": "Un historique se construit.",
      "body": [
        "Le suivi reflète les interventions, dépenses et documents enregistrés. Un repère documenté raconte ce qui a été saisi pour un véhicule.",
        "Les exemples du portail n’accèdent à aucun garage ni à aucune sauvegarde."
      ],
      "facts": [
        {
          "label": "À conserver",
          "value": "Dates, contexte, justificatifs"
        }
      ]
    }
  },
  "branchlab": {
    "presentation": {
      "id": "branchlab",
      "app": "branchlab",
      "eyebrow": "ENTRE DEUX APPAREILS",
      "title": "Voir le rôle de chaque liaison.",
      "body": [
        "Branchlab représente appareils, ports et câbles pour comprendre les compatibilités et les limites d’une installation.",
        "Sa première version se concentre sur les connexions vidéo directes couvertes par son catalogue et ses sources."
      ],
      "facts": [
        {
          "label": "À explorer",
          "value": "Appareil · port · câble · écran"
        }
      ],
      "related": {
        "app": "finapp",
        "label": "Et si le prochain choix était un achat ?"
      }
    },
    "action": {
      "id": "branchlab.exemple",
      "app": "branchlab",
      "eyebrow": "LIAISON FICTIVE",
      "title": "Suivre un signal, élément par élément.",
      "body": [
        "Un ordinateur rejoint un écran par une sortie DisplayPort et un câble. L’exemple distingue la source, la sortie, le câble et l’entrée.",
        "Ouvrez Branchlab pour représenter une installation avec les références disponibles dans son catalogue."
      ],
      "facts": [
        {
          "label": "Source",
          "value": "Ordinateur"
        },
        {
          "label": "Sortie → câble",
          "value": "DisplayPort"
        },
        {
          "label": "Destination",
          "value": "Entrée de l’écran"
        }
      ]
    },
    "methode": {
      "id": "branchlab.methode",
      "app": "branchlab",
      "eyebrow": "LA MÉTHODE",
      "title": "Représenter, puis lire les sources.",
      "body": [
        "Placez les appareils et leurs ports, reliez-les, puis consultez les informations et le diagnostic vidéo sourcé pour le périmètre couvert.",
        "Une compatibilité dépend des références et des caractéristiques prises en compte ; le catalogue n’est pas universel."
      ],
      "facts": [
        {
          "label": "Représentation",
          "value": "Éléments et liaisons"
        },
        {
          "label": "Explication",
          "value": "Limites et sources"
        }
      ]
    },
    "limites": {
      "eyebrow": "LE PÉRIMÈTRE DES SOURCES",
      "title": "Une liaison, des limites précises.",
      "body": [
        "La première version de Branchlab couvre les connexions vidéo directes du catalogue. Le diagnostic dépend des références et des caractéristiques prises en compte.",
        "Les rôles du schéma restent utiles pour comprendre la chaîne ; les compatibilités réelles se consultent dans l’application avec les références disponibles."
      ],
      "facts": [
        {
          "label": "Couverture",
          "value": "Vidéo directe et catalogue sourcé"
        }
      ]
    }
  }
};
export const ANGLES = ['presentation', 'action', 'methode', 'limites'];
export const ANGLE_NAMES = {presentation:'Présentation',action:'En action',methode:'Méthode',limites:'Limites'};
export function contentFor(app, angle='presentation') { return CONTENT[app]?.[angle] || {eyebrow:'SINIVERSE',title:'Trois outils, un monde à explorer.',body:['Prévoir un choix, retrouver un événement ou comprendre une liaison.'],facts:[]}; }
