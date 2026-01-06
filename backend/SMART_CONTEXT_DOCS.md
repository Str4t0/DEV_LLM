# Smart Context System - Dokumentáció

## Probléma

A korábbi rendszerben az AI nem tudta, milyen fájlokat kell megnéznie:
- A RAG keresés nem mindig találta meg a releváns kódot
- Ha a user `@game.js`-t írt, nem történt semmi
- A chat history túl rövid volt (8 üzenet × 1200 karakter)
- Nem volt memória a beszélgetések között

## Megoldás: Smart Context System

### 1. @file Mention Parser

**Használat:**
```
@static/js/game.js mi okozza az ütközésérzékelés hibát?
@game.js nézd meg a collision logikát
@"path with spaces/file.js" működik idézőjelekkel is
```

**Működés:**
- A backend automatikusan felismeri a `@fájlnév` mintákat
- Megkeresi a fájlt a projekt mappában (pontos útvonal VAGY fájlnév alapján)
- A TELJES fájl tartalmát betölti a kontextusba
- Az LLM EXPLICIT kapja meg a fájlt, nem kell találgatnia

### 2. Project Memory System

**Mit tárol:**
- Fontos tények a projektről (pl. "collision detection a game.js 150. sorban van")
- Architektúra információk
- Korábbi hibák és megoldásaik

**Automatikus tanulás:**
- Az LLM válaszaiból kinyeri a fontos tényeket
- Későbbi beszélgetésekhez is elérhető

**Database:** `backend/project_memory.db`

### 3. Active Files Tracking

- Követi, mely fájlok kerültek szóba a beszélgetésben
- Session-alapú (böngésző session)
- Az LLM emlékeztetőt kap: "Ezek a fájlok korábban szóba kerültek..."

### 4. Extended Chat History

**Régi értékek:**
- Max 8 üzenet
- Max 1200 karakter/üzenet

**Új értékek:**
- Max 25 üzenet
- Max 3000 karakter/üzenet

### 5. Prioritás sorrend a kontextusban

1. **Explicit fájlok** (@file mentions) - LEGMAGASABB
2. **Projekt memória** - Korábbi tények
3. **RAG kontextus** - Szemantikus keresés
4. **Aktív fájlok** - Emlékeztető
5. **Chat history** - Beszélgetés előzmények

## Implementáció

### Backend fájlok

- `backend/app/context_manager.py` - Smart Context logika
- `backend/app/main.py` - Integráció a chat endpoint-ba
- `backend/app/schemas.py` - session_id mező
- `backend/app/system_prompt.txt` - Új utasítások az LLM-nek

### Frontend változások

- Session ID generálás és tárolás
- @file szintaxis hint a chat inputnál
- session_id küldése a chat kérésekkel

## Használati példák

### Probléma: "Nem érzékeli az ütközéseket"

**Régi módon (NEM MŰKÖDÖTT):**
```
User: Nézd meg a game.js-t, mi okozza a hibát
AI: [Általános tanácsokat ad, nem látja a kódot]
```

**Új módon (MŰKÖDIK):**
```
User: @static/js/game.js mi okozza hogy nem érzékeli az ütközéseket?
AI: [Látja a teljes game.js-t, pontos választ ad a konkrét kódra hivatkozva]
```

### Több fájl betöltése

```
@game.js @collision.js Hogyan kapcsolódik ez a két fájl?
```

## Technikai részletek

### Context méret

- Max 8000 karakter per betöltött fájl
- Max 25000 karakter összes betöltött fájlból
- Max 10 fájl egyszerre

### Database séma

```sql
-- Project Memory
CREATE TABLE project_memory (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    fact_type TEXT NOT NULL,
    fact_key TEXT NOT NULL,
    fact_value TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL,
    access_count INTEGER DEFAULT 1
);

-- Active Files
CREATE TABLE active_files (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    relevance_score REAL DEFAULT 1.0,
    mentioned_at TEXT NOT NULL
);
```

## Debug

A backend logol minden Smart Context műveletet:
```
[SMART CONTEXT] File mentions: ['static/js/game.js']
[SMART CONTEXT] Loaded files: 1
[SMART CONTEXT] Memory facts: 3
[SMART CONTEXT] Active files: ['game.js', 'collision.js']
[CONTEXT] Explicit files loaded: ['static/js/game.js']
[CONTEXT] Total context size: 15234 chars, 8 messages
```








