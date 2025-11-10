# 🧠 LLM Dev Environment

**Fejlesztői környezet AI-modellek segítségével, React + FastAPI alapokon.**

Ez a projekt egy lokális fejlesztői környezet, amely lehetővé teszi a kódok, projektek és AI-alapú interakciók kezelését.  
A rendszer két részből áll: egy **Python FastAPI backendből** (SQLite adatbázissal) és egy **React + TypeScript frontendből (Vite)**.

---

## 🚀 Fő funkciók

- Projektek létrehozása és kezelése (név, leírás, gyökérmappa)
- Kódszerkesztő több panellel (forrás, módosított, diff nézet)
- Helyi mentés (LocalStorage) projekt-specifikus beállításokhoz
- Egyszerű undo/redo és diff összehasonlítás
- Online/offline állapotjelző (backend elérhetősége alapján)
- Alap AI-integrációra előkészített architektúra

---

## 📂 Könyvtárstruktúra

```plaintext
llm_dev_env/
│
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI belépési pont, API-végpontok
│   │   ├── database.py      # SQLite adatbázis kapcsolat + SQLAlchemy Base
│   │   ├── models.py        # SQLAlchemy ORM modellek
│   │   ├── schemas.py       # Pydantic sémák (request/response modellek)
│   │   └── app.db           # SQLite adatbázis fájl
│   └── venv/                # (virtuális környezet)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Fő React komponens (kódszerkesztő és UI)
│   │   ├── config.ts        # Backend URL konfiguráció
│   │   ├── main.tsx         # React entry point
│   │   ├── App.css          # Alkalmazás stílus
│   │   └── index.css        # Globális stílus
│   ├── package.json         # Frontend függőségek (React, Vite, TypeScript)
│   ├── tsconfig.json        # TypeScript konfiguráció
│   └── vite.config.ts       # Vite build konfiguráció
│
└── README.md
⚙️ Használt technológiák
Backend
Python 3.10+

FastAPI

SQLAlchemy

SQLite

Frontend
React 18

TypeScript

Vite

CSS (custom UI layout)

## 🧩 Telepítés és futtatás
1️⃣ Backend (FastAPI)
bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

pip install fastapi uvicorn sqlalchemy
uvicorn app.main:app --reload
A backend ezután a http://127.0.0.1:8000 címen lesz elérhető.
Egyszerű health check:

bash
curl http://127.0.0.1:8000/health
# {"status":"ok"}
2️⃣ Frontend (React + Vite)
bash
cd frontend
npm install
npm run dev
A frontend alapértelmezetten a http://localhost:5173 címen fut, és automatikusan kommunikál a backenddel (http://localhost:8000).

## 🧠 API végpontok
Módszer	Útvonal	Leírás
GET	/health	Egyszerű online/ok állapotjelzés
GET	/projects	Összes projekt listázása
POST	/projects	Új projekt létrehozása

Példa POST-body:

json
{
  "name": "Teszt projekt",
  "description": "Ez egy teszt projekt",
  "root_path": "C:/Projektek/Teszt"
}
## 🧰 Fejlesztői információk
A frontend és backend külön fut, CORS engedéllyel összekötve.

A projektek SQLite adatbázisban tárolódnak (backend/app.db).

A frontend a localStorage-t használja a projektekhez kötött kódok és beállítások mentésére.

A diff nézet a két kódszöveg soronkénti egyszerű összehasonlítását végzi.

## 🧩 Fejlesztői cél
Ez a környezet AI-modellek integrációjához és lokális LLM-fejlesztéshez készült,
ahol a backend képes modelleket kiszolgálni, a frontend pedig fejlesztői felületet biztosít a kódfuttatáshoz, mentéshez és interakcióhoz.

📜 Licenc
MIT License © 2025
Készült személyes fejlesztői környezethez és AI-integrációs kísérletekhez.
