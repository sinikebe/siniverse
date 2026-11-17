// Public descriptions and fictional demonstrations; no application data.
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
    "id": "finapp",
    "app": "finapp",
    "eyebrow": "AVANT DE DÉCIDER",
    "title": "Comparer vos choix dans le temps.",
    "body": [
      "Finapp permet de comparer deux scénarios financiers pour comprendre ce qu’un choix change dans le temps : acheter ou louer, épargner ou changer de véhicule.",
      "Vous définissez les hypothèses de chaque scénario et un horizon commun. L’application met en regard l’évolution des dépenses et du patrimoine, puis leurs écarts, pour faciliter la comparaison.",
      "Vous pouvez par exemple examiner l’achat d’une voiture et une solution de location sur dix ans. Les projections dépendent des paramètres saisis : elles décrivent les scénarios choisis, sans prédire leur réalisation."
    ],
    "facts": [
      {
        "label": "Scénarios",
        "value": "Deux choix comparés"
      },
      {
        "label": "Lecture",
        "value": "Budget et patrimoine"
      },
      {
        "label": "Repère",
        "value": "Un horizon commun"
      }
    ],
    "related": {
      "app": "garapp",
      "label": "Et après l’achat du véhicule ?"
    }
  },
  "garapp": {
    "id": "garapp",
    "app": "garapp",
    "eyebrow": "AU FIL DES JOURS",
    "title": "Tout le suivi de vos véhicules.",
    "body": [
      "Garapp rassemble le suivi de vos véhicules : révisions, réparations, pièces, documents et dépenses. Chaque voiture possède son historique, pour retrouver ce qui a été fait et ce qui lui est associé.",
      "Après une intervention, vous pouvez conserver la date, les pièces concernées, le coût et un justificatif au même endroit. Le carburant et l’assurance complètent le suivi des dépenses au fil des mois.",
      "L’historique permet de retrouver un entretien, de consulter ses documents et de comprendre les dépenses enregistrées pour un véhicule. Il se construit à partir des informations que vous ajoutez."
    ],
    "facts": [
      {
        "label": "Suivi",
        "value": "Interventions et pièces"
      },
      {
        "label": "Budget",
        "value": "Carburant et assurance"
      },
      {
        "label": "Mémoire",
        "value": "Dates et justificatifs"
      }
    ],
    "related": {
      "app": "finapp",
      "label": "Revenir à un choix à anticiper"
    }
  },
  "branchlab": {
    "id": "branchlab",
    "app": "branchlab",
    "eyebrow": "ENTRE DEUX APPAREILS",
    "title": "Comprendre ce qui relie vos appareils.",
    "body": [
      "Branchlab représente les appareils, leurs ports et les câbles qui les relient. L’installation devient un schéma dans lequel on peut suivre chaque liaison, de la source à l’écran.",
      "Vous placez les éléments et leurs connexions, puis consultez les caractéristiques et les explications associées. Le diagnostic vidéo s’appuie sur les références disponibles dans le catalogue et sur leurs sources.",
      "La première version couvre les connexions vidéo directes de ce catalogue. Les compatibilités présentées dépendent des appareils et des caractéristiques pris en compte, ce qui permet de comprendre le périmètre du résultat."
    ],
    "facts": [
      {
        "label": "Chaîne",
        "value": "Appareils, ports et câbles"
      },
      {
        "label": "Diagnostic",
        "value": "Connexions vidéo directes"
      },
      {
        "label": "Catalogue",
        "value": "Références et sources"
      }
    ],
    "related": {
      "app": "finapp",
      "label": "Et si le prochain choix était un achat ?"
    }
  }
};
export function contentFor(app) { return CONTENT[app] || {eyebrow:"SINIVERSE",title:"Bienvenue chez Siniverse.",body:["Bureau, garage et salle gaming. À chaque projet, sa pièce."],facts:[]}; }
