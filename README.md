# TIME_IT

**TIME_IT** est un jeu d'adresse et de réflexes développé en **React / HTML5 Canvas** pour le frontend et **Python / FastAPI / SQLite** pour le backend. Le joueur doit stopper une aiguille rotative dans des zones de couleur afin d'enchaîner les combos et de débloquer une zone bonus.

---

## Fonctionnalités

### Mode Solo (`ECM · Timing Solo`)
* **Mécanique de précision :** appuyez sur `Espace` (ou sur le bouton d'action) lorsque l'aiguille passe sur les zones cibles :
  * **Jaune :** 50 pts (fois multiplicateur de combo)
  * **Orange :** 100 pts
  * **Rouge :** 150 pts
  * **Zone bonus Blanche :** 450 pts — se débloque après **3 touches Rouges** ou **5 touches Oranges** consécutives (disparaît si un tour complet passe ou en cas d'échec).
* **Deux modes de vitesse :** *Graduelle* (accélération progressive à chaque réussite) ou *Aléatoire* (nouvelle vitesse tirée à chaque coup).
* **Gestion des vies et record global :** le joueur dispose de **3 vies**. En fin de partie, le score et le détail des touches sont automatiquement envoyés à l'API, qui conserve le meilleur record mondial.

### Mode Duel Local 1v1 (`ECM · Duel Local 1v1`)
* **Tir à la corde visuel :** deux joueurs s'affrontent sur le même écran autour d'une barre commune rayée bleu/rouge animée en temps réel.
* **Commandes dédiées :**
  * **Joueur 1 (Bleu, à gauche) :** touche `Espace`
  * **Joueur 2 (Rouge, à droite) :** touche `Entrée`
* **Poussée et combos :** chaque zone réussie repousse la barre vers l'adversaire (**Jaune +2**, **Orange +4**, **Rouge +7**, **Blanc +25**, avec un **bonus +3** tous les 3 combos). Le premier qui remplit entièrement la barre remporte le duel.
* **Pseudos modifiables & historique :** les noms des deux joueurs sont éditables directement au clic au-dessus de chaque cercle. Dès la fin du duel, le résultat est enregistré en base et affiché dans l'historique en bas de l'interface.

---

## Structure du projet

```text
.
├── backend/
│   ├── scores/
│   │   └── __init__.py        # Application FastAPI, modèles SQLAlchemy (Score, Match) et validation Pydantic
│   ├── tests/
│   │   └── test_scores.py     # Suite de tests unitaires et d'intégration (Pytest + TestClient)
│   └── instance/
│       └── scores.sqlite      # Base de données SQLite (générée automatiquement au démarrage)
│
└── frontend/
    ├── src/
    │   ├── assets/
    │   │   ├── blueside.png   # Sprite du Joueur 1 (gauche)
    │   │   └── redside.png    # Sprite du Joueur 2 (droite)
    │   ├── game.js            # Moteur de jeu pur et déterministe (logique Solo & 1v1)
    │   ├── canvas.js          # Rendu Canvas 60 FPS, animations de la barre et gestion clavier/pointeur
    │   ├── main.jsx           # Interface React, HUD, pseudos cliquables, records et historique 1v1
    │   ├── api.js             # Client HTTP vers l'API FastAPI
    │   └── style.css          # Mise en page et thème sombre
    ├── index.html
    └── package.json
```

---

## Prérequis

* **Python 3.10+** (avec `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `pytest`, `httpx`)
* **Node.js 18+** et **npm**

---

## Installation et lancement

### 1. Démarrer le backend (port `8001`)

Ouvrez un premier terminal dans le dossier `backend` :

```bash
cd backend

# (Optionnel) Créer et activer un environnement virtuel
python -m venv .venv
source .venv/bin/activate        # Linux / macOS
# .venv\Scripts\activate         # Windows

# Installer les dépendances Python
pip install fastapi uvicorn sqlalchemy pydantic pytest httpx

# Lancer le serveur API sur le port 8001
uvicorn scores:create_app --factory --reload --port 8001
```

L'API est accessible sur `http://localhost:8001` (documentation interactive disponible sur `http://localhost:8001/docs`). La base SQLite `backend/instance/scores.sqlite` est créée automatiquement au premier lancement.

### 2. Démarrer le frontend (port `5175`)

Ouvrez un second terminal dans le dossier `frontend` :

```bash
cd frontend

# Installer les dépendances Node
npm install

# Lancer le serveur de développement Vite
npm run dev -- --port 5175
```

Ouvrez ensuite votre navigateur à l'adresse **`http://localhost:5175`**.

> **Variable d'environnement (optionnelle) :** par défaut, le frontend contacte `http://localhost:8001`. Vous pouvez modifier cette URL via `VITE_API_URL` dans un fichier `frontend/.env`.

---

## Endpoints de l'API

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Vérifie l'état de l'API et de la connexion SQLite |
| `GET` | `/scores/` | Récupère le meilleur score Solo enregistré |
| `POST` | `/scores/` | Enregistre un score Solo (remplace le record uniquement s'il est battu) |
| `GET` | `/matches/` | Récupère les 10 derniers duels 1v1 enregistrés |
| `POST` | `/matches/` | Enregistre le résultat d'un duel 1v1 terminé |

---

## Lancer les tests (Backend)

```bash
cd backend
pytest
```
