# RAG Chatbot

A full-stack Retrieval-Augmented Generation chatbot with a NestJS API, React/Vite UI, local MiniLM embeddings, PostgreSQL + pgvector retrieval, and OpenRouter generation.

## Project structure

- `document-rag/` — NestJS API and RAG pipeline
- `document-rag-ui/` — React + Vite frontend
- `Dockerfile` — production multi-stage build serving the UI and API together
- `render.yaml` — Render Blueprint for the app and managed PostgreSQL database

## Local development

1. Start PostgreSQL with pgvector:

```bash
cd document-rag
docker compose up -d
```

2. Create `document-rag/.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=rag_user
DB_PASSWORD=rag_password
DB_NAME=rag_db
OPENROUTER_API_KEY=your_key_here
```

3. Start the API:

```bash
cd document-rag
npm ci
npm run start:dev
```

4. Start the UI in another terminal:

```bash
cd document-rag-ui
npm ci
VITE_API_URL=http://localhost:3000/api npm run dev
```

## Production deployment on Render

1. Open Render Blueprints and select this repository.
2. Render reads `render.yaml` and creates the Docker web service plus PostgreSQL.
3. Enter `OPENROUTER_API_KEY` when prompted.
4. Deploy. The UI and API are served from one HTTPS domain; the API lives under `/api`.

The production startup script creates the `vector` extension before NestJS synchronizes the schema. Upgrade the free database/service plans for persistent production use and stronger availability.
