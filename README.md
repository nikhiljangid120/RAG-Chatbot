# RAG Chatbot

A full-stack Retrieval-Augmented Generation chatbot with a NestJS API, React/Vite UI, local MiniLM embeddings, PostgreSQL + pgvector retrieval, and OpenRouter generation.

## Project structure

- `document-rag/` — NestJS API and RAG pipeline
- `document-rag-ui/` — React + Vite frontend
- `Dockerfile` — production multi-stage build serving the UI and API together
- `render.yaml` — Render Blueprint for the app with an external PostgreSQL database

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

1. Create a PostgreSQL database that supports pgvector, for example on [Neon](https://neon.com/docs/extensions/pgvector). Choose a region close to the Render service and copy the connection string from the database's Connect dialog.
2. Open Render Blueprints and select this repository. `render.yaml` creates only the Docker web service; it does not provision a Render database.
3. Set `DATABASE_URL` to the external database connection string and enter `OPENROUTER_API_KEY`. `DB_SSL=true` is already set in the Blueprint.
4. For an existing Render service, update `DATABASE_URL` under **Environment**, keep `DB_SSL=true`, then save and redeploy the latest commit. Changing the Blueprint alone does not replace an existing service's database credentials.
5. Verify `/api` and `/api/documents` return successful responses, then upload a document and test a hybrid-search question. The UI and API are served from one HTTPS domain; the API lives under `/api`.

The production startup script creates the `vector` extension before NestJS synchronizes the schema. After synchronization, startup backfills missing search vectors and creates the GIN index, including on a completely new database.

[Render's free PostgreSQL databases expire after 30 days](https://render.com/docs/free). Using an external database avoids that Render database expiry; the web service can remain on Render. External free plans still have usage limits; check [Neon's current allowances](https://neon.com/docs/introduction/plans).

Switching `DATABASE_URL` starts with the contents of the replacement database; it does not migrate old documents. Restore a backup if available, or re-upload the source documents. Keep the suspended database until any needed data has been recovered.
