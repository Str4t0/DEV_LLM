# 🧠 DEV LLM – Local AI-Powered Developer Environment

> **Fejlesztői környezet AI-modellek (LLM-ek) segítségével**  
> FastAPI + React + OpenAI + Vektoros adatbázis (RAG)

---

## 📘 Áttekintés

A **DEV LLM** egy lokális, LLM-alapú fejlesztői környezet, amely képes a **saját kódbázisodat megérteni és feldolgozni**.  
Segít a kód olvasásában, magyarázatában, refaktorálásában és a fejlesztési folyamat gyorsításában.

A rendszer két fő komponensből áll:

- 🐍 **Backend:** Python + FastAPI + SQLAlchemy + OpenAI integráció  
- ⚛️ **Frontend:** React + TypeScript + Vite  
- 🧩 **RAG (Retrieval-Augmented Generation):** vektoros keresés a projekt fájljaiban (`vector_store.py`)

---

## 🚀 Fő funkciók

### 🗂️ Projektkezelés
- Új projektek létrehozása, szerkesztése, törlése
- Leírás + gyökérmappa (`root_path`)
- „Reindex” gomb: újraépíti a vektoros indexet (RAG)

### 📁 Fájlrendszer böngésző
- Fa-nézetben listázza a projekt gyökérmappáját
- Fájlok kattintással betölthetők és szerkeszthetők

### 🧠 LLM Chat (RAG-gal)
- Chat az LLM-mel az aktuális projekt kontextusában
- Vektoros keresés a projekt kódbázisában  
- Az LLM fájlrészleteket kap, így ténylegesen a **projekt kódját elemzi**
- Kattintható hivatkozások:  
  `(FILE: backend\app\main.py | chunk #0)` → a megfelelő fájl megnyílik a szerkesztőben

### 💬 Chat memória
- A beszélgetések **projektenként mentődnek** `localStorage`-be  
- Oldalfrissítés után sem tűnnek el a korábbi üzenetek

### 🧱 Kódszerkesztő
- Forrás- és módosított kód panel
- Undo/Redo
- Diff-nézet
- Projekt-specifikus mentés (`localStorage`)

### 📶 Állapotfigyelés
- „Online / Offline” kijelzés a `/health` endpoint alapján

### 📱 Mobil-nézet támogatás
- Reszponzív elrendezés: kód / projektek / chat tabok között lehet váltani

---

## 🧩 Könyvtárstruktúra

```plaintext
DEV_LLM/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI belépési pont + /chat (RAG)
│   │   ├── database.py      # SQLite + SQLAlchemy
│   │   ├── models.py        # ORM modellek (Project, stb.)
│   │   ├── schemas.py       # Pydantic sémák
│   │   ├── config.py        # OpenAI, CORS, ENV-olvasás
│   │   └── app.db           # SQLite adatbázis
│   ├── requirements.txt
│   └── venv/
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Fő UI komponens (projektek, chat, szerkesztő)
│   │   ├── App.css
│   │   ├── config.ts        # Backend URL ENV-ből
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.ts
│
├── vector_store.py          # Vektoros indexelő + lekérdező
├── start_dev_env.bat        # Indítja a backend + frontend ablakokat
├── .env                     # Lokális konfiguráció
├── .gitignore
└── README.md

⚙️ Technológiák
Komponens	Stack
Backend	FastAPI · SQLAlchemy · OpenAI · python-dotenv · SQLite
Frontend	React · TypeScript · Vite · CSS
RAG	OpenAI Embeddings + Chroma / SQLite tárolás
Integráció	REST API + CORS + JSON schema

🔑 Konfiguráció
Backend .env
env
Kód másolása
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# CORS engedélyezett origin-ek
FRONTEND_ORIGINS=*
Frontend .env
env


VITE_BACKEND_URL=yourbackendurl
# vagy lokálisan:
# VITE_BACKEND_URL=yourlocalurl

🧠 RAG – vektoros kontextus
A vector_store.py feldarabolja a projektfájlokat chunkokra

A chunkok embeddingjei OpenAI Embeddings API-val kerülnek eltárolásra

Kérdés esetén a backend meghívja:

python
Kód másolása
chunks = query_project(project_key, search_text, top_k=5)
és az eredményeket system üzenetként adja át az LLM-nek.

Ezáltal a modell a projekt saját kódjára válaszol.
A válaszokban fájl- és chunk-hivatkozásokat látsz, amelyek a frontendben kattinthatók.

🧠 API rövid áttekintés
Metódus	Útvonal	Leírás
GET	/health	Egyszerű státuszellenőrzés
GET	/projects	Projektek listázása
POST	/projects	Új projekt létrehozása
PUT	/projects/{id}	Projekt módosítása
DELETE	/projects/{id}	Projekt törlése
POST	/projects/{id}/reindex	Kódbázis újraindexelése
GET	/projects/{id}/files	Fájlfa lekérése
GET	/projects/{id}/file	Fájl tartalmának lekérése
POST	/chat	Chat az LLM-mel (RAG integrációval)

🧩 Telepítés
1 ️⃣ Klónozás
bash
Kód másolása
git clone https://github.com/Str4t0/DEV_LLM.git
cd DEV_LLM
2 ️⃣ Backend
bash
Kód másolása
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
3️ ⃣ Frontend
bash
Kód másolása
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
4 ️⃣ Egyszerű indítás (Windows)
bash
Kód másolása
start_dev_env.bat
Ez automatikusan:

aktiválja a virtualenv-et,

elindítja a FastAPI backendet,

és külön ablakban a React frontendet.

💾 Mentés és állapotkezelés
Projektek → SQLite adatbázisban (backend/app/app.db)

Vektoros index → külön SQLite DB (vector_store.py)

Forráskód + projected kód → localStorage

Chat előzmények → projektenként localStorage (projectChat_{id})

🧭 Használat röviden
Indítsd el a környezetet (start_dev_env.bat)

Nyisd meg a frontendet:
👉 http://localhost:5173 vagy http://<IP>:5173

Hozz létre egy projektet, add meg a root_path-ot

Nyomd meg a Reindex gombot (vektoros index építése)

Nyisd meg a Chatet és kérdezd meg pl.:

„Hol van a FastAPI belépési pont a projektben?”

Az LLM válaszában fájl-hivatkozásokat fogsz látni, amelyekre kattintva a fájl megnyílik a kódszerkesztőben.

🧠 Fejlesztői cél
A DEV LLM célja, hogy a fejlesztés során:

megértsd a komplex kódbázisokat,

refaktorálást végezhess az LLM segítségével,

és saját offline / on-premise környezetet biztosítson AI-integrációhoz.

📜 Licenc
MIT License © 2025
Személyes fejlesztői és AI-integrációs projektekhez készült.