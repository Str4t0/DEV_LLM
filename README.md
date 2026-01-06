# 🧠 DEV LLM – AI-Powered Developer Environment

> **Fejlesztői környezet AI-ügynökkel (Agentic LLM)**  
> FastAPI + React + OpenAI/Anthropic/Gemini + RAG + Real-time WebSocket

---

## 📘 Áttekintés

A **DEV LLM** egy lokális, AI-ügynök alapú fejlesztői környezet, amely képes a **saját kódbázisodat megérteni, elemezni és módosítani**.

### ✨ Fő jellemzők:
- 🤖 **Agentic rendszer** - Az AI önállóan olvas, ír és módosít fájlokat
- 🔄 **Auto/Manual mód** - Automatikus vagy jóváhagyás-alapú műveletek
- 🎨 **Dark/Light téma** - Cursor IDE-szerű modern megjelenés
- 📱 **Reszponzív** - Mobilon is használható
- 🔌 **Multi-LLM** - OpenAI, Anthropic Claude, Google Gemini támogatás
- 🔍 **RAG** - Vektoros keresés a projekt kódbázisában

---

## 🏗️ Architektúra

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │ Projekt │  │  Chat   │  │  Kód    │  │ Diff Viewer     │ │
│  │ Manager │  │ (LLM)   │  │ Editor  │  │ (LCS algoritmus)│ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API + WebSocket
┌────────────────────────┴────────────────────────────────────┐
│                      BACKEND (FastAPI)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Agentic     │  │ RAG Helper  │  │ Token Manager       │  │
│  │ Tools       │  │ (embeddings)│  │ (budget control)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Model       │  │ WebSocket   │  │ Context Manager     │  │
│  │ Router      │  │ Sync        │  │ (smart context)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Fő funkciók

### 🤖 Agentic AI rendszer
Az AI-ügynök **önállóan használ eszközöket** a feladatok elvégzésére:

| Eszköz | Leírás |
|--------|--------|
| `read_file` | Fájl tartalmának olvasása |
| `apply_edit` | Kód módosítása (old_text → new_text) |
| `write_file` | Új fájl létrehozása |
| `delete_file` | Fájl törlése |
| `create_directory` | Könyvtár létrehozása |
| `execute_terminal` | Terminal parancs futtatása |
| `list_files` | Könyvtár tartalmának listázása |
| `search_codebase` | Kód keresése regex-szel |

### 🔄 Auto / Manual mód

| Mód | Leírás |
|-----|--------|
| **Auto** | Az AI automatikusan végrehajtja a módosításokat |
| **Manual** | Minden művelet jóváhagyást igényel (diff előnézet) |

### 📊 Diff Viewer
- **LCS algoritmus** - Pontos változás-detektálás
- **Zöld/piros kiemelés** - Hozzáadott/törölt sorok
- **Navigáció** - Előző/Következő változás gombok
- **Csoportosítás** - Egy fájl = egy oldal

### 🎨 Témák
- **Sötét mód** - Cursor IDE-szerű sötét téma
- **Világos mód** - Magas kontrasztú világos téma
- **Automatikus** - A jóváhagyás modal is követi a témát

### 💬 Chat funkciók
- **@fájl** - Fájl hivatkozás autocomplete-tel
- **Alt+Enter** - Új sor beszúrása
- **Dátum+idő** - Minden üzenetnél (YYYY.MM.DD HH:MM:SS)
- **Diff linkek** - Kattintható `[[DIFF:path]]` hivatkozások

### 🔌 Multi-LLM támogatás

| Provider | Modellek |
|----------|----------|
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4-turbo |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus |
| **Google** | Gemini 1.5 Pro, Gemini 1.5 Flash |

---

## 📁 Könyvtárstruktúra

```
DEV_LLM/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI belépési pont
│   │   ├── agentic_tools.py     # AI ügynök eszközök
│   │   ├── model_router.py      # Multi-LLM router
│   │   ├── token_manager.py     # Token budget kezelés
│   │   ├── rag_helper.py        # RAG segédfüggvények
│   │   ├── context_manager.py   # Smart context
│   │   ├── websocket_manager.py # WebSocket kezelés
│   │   ├── database.py          # SQLite + SQLAlchemy
│   │   ├── models.py            # ORM modellek
│   │   ├── schemas.py           # Pydantic sémák
│   │   ├── config.py            # Konfiguráció
│   │   └── system_prompt.txt    # AI rendszer prompt
│   ├── requirements.txt
│   └── vector_store.py          # RAG vektoros index
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Fő UI komponens
│   │   ├── App.css              # Stílusok (dark/light)
│   │   ├── components/
│   │   │   ├── LogWindow.tsx    # Log ablak
│   │   │   ├── LLMSettings.tsx  # LLM beállítások
│   │   │   ├── ProjectsList.tsx # Projekt lista
│   │   │   └── ContextMenu.tsx  # Jobb-klikk menü
│   │   ├── types/
│   │   │   └── index.ts         # TypeScript típusok
│   │   ├── utils/
│   │   │   ├── useWebSocketSync.ts  # WebSocket hook
│   │   │   ├── fileUtils.ts     # Fájl segédfüggvények
│   │   │   ├── patchUtils.ts    # Patch segédfüggvények
│   │   │   └── codeUtils.ts     # Kód segédfüggvények
│   │   └── config.ts            # Frontend konfiguráció
│   ├── package.json
│   └── vite.config.ts
│
├── start_dev_env.bat            # Windows indító script
├── .env                         # Környezeti változók
└── README.md
```

---

## ⚙️ Technológiák

| Komponens | Stack |
|-----------|-------|
| **Backend** | FastAPI · SQLAlchemy · OpenAI · Anthropic · Google AI · WebSocket |
| **Frontend** | React 18 · TypeScript · Vite · CSS Variables |
| **RAG** | OpenAI Embeddings · ChromaDB / SQLite |
| **Diff** | LCS (Longest Common Subsequence) algoritmus |
| **Sync** | WebSocket real-time szinkronizáció |

---

## 🔑 Konfiguráció

### Backend `.env`

```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Anthropic (opcionális)
ANTHROPIC_API_KEY=sk-ant-...

# Google AI (opcionális)
GOOGLE_API_KEY=...

# CORS
FRONTEND_ORIGINS=*

# Titkosítás (API kulcsok DB-ben)
ENCRYPTION_KEY=your-32-byte-key-here
```

### Frontend `.env`

```env
VITE_BACKEND_URL=http://localhost:8000
```

---

## 🧩 Telepítés

### 1️⃣ Klónozás

```bash
git clone https://github.com/Str4t0/DEV_LLM.git
cd DEV_LLM
```

### 2️⃣ Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3️⃣ Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

### 4️⃣ Egyszerű indítás (Windows)

```bash
start_dev_env.bat
```

---

## 🧠 API végpontok

### Projektek

| Metódus | Útvonal | Leírás |
|---------|---------|--------|
| GET | `/projects` | Projektek listázása |
| POST | `/projects` | Új projekt létrehozása |
| PUT | `/projects/{id}` | Projekt módosítása |
| DELETE | `/projects/{id}` | Projekt törlése |
| POST | `/projects/{id}/reindex` | RAG index újraépítése |
| GET | `/projects/{id}/files` | Fájlfa lekérése |
| GET | `/projects/{id}/file` | Fájl tartalom lekérése |
| POST | `/projects/{id}/file` | Fájl mentése |

### Chat & AI

| Metódus | Útvonal | Leírás |
|---------|---------|--------|
| POST | `/chat` | Chat az LLM-mel (agentic mód) |
| POST | `/api/agentic/execute-approved` | Jóváhagyott művelet végrehajtása |
| GET | `/api/llm-settings` | LLM beállítások lekérése |
| POST | `/api/llm-settings` | LLM beállítások mentése |

### WebSocket

| Útvonal | Leírás |
|---------|--------|
| `/ws/{project_id}` | Real-time szinkronizáció |

---

## 🎯 Használat

### 1. Projekt létrehozása
- Add meg a **nevet** és **gyökérmappát**
- Kattints a **Reindex** gombra (RAG index építés)

### 2. Chat használata
```
Te: Nézd át a game.js fájlt és javítsd a hibákat

AI: [Olvas, elemez, módosít az apply_edit eszközzel]
    ✅ 3 fájl módosítva (+15/-8 sor)
```

### 3. Manual mód
- Kapcsold be a **Manual** módot
- Az AI jóváhagyást kér minden módosításhoz
- Lásd az **Eredeti vs Új** diff-et
- Kattints **Jóváhagyás** vagy **Elutasítás**

### 4. Diff nézet
- Kattints a fájlnévre a chat-ben
- Zöld = hozzáadott sorok
- Piros = törölt sorok
- Navigálj az **Előző/Következő** gombokkal

---

## 🔧 Fejlesztői tippek

### Vite cache törlése
```bash
cd frontend
rmdir /s /q node_modules\.vite
npm run dev
```

### Backend újraindítás
```bash
# Ctrl+C a terminálban, majd:
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Böngésző hard refresh
```
Ctrl+Shift+R
```

---

## 📜 Licenc

MIT License © 2025

Személyes fejlesztői és AI-integrációs projektekhez készült.

---

## 🤝 Közreműködés

Pull request-eket szívesen fogadunk! Kérjük, nyiss egy issue-t a nagyobb változtatások előtt.

---

**Made with ❤️ and 🤖 AI**
