# Phase 1 MVP

This branch upgrades the original public single-library demo into a private multi-user MVP.

## Included

- Built-in signed-token authentication with scrypt password hashing
- User-isolated documents and retrieval
- PDF signature and 10 MB upload validation
- Document selection and deletion
- Page-aware chunks, excerpts, relevance scores, and citations
- Configurable relevance threshold to avoid unsupported answers
- Persisted conversations and messages
- Token-by-token SSE answer streaming
- Per-user question rate limiting
- TypeORM migration with automatic production execution

## Required environment variables

```env
AUTH_SECRET=use-at-least-32-random-characters
OPENROUTER_API_KEY=your-key
DATABASE_URL=postgresql://...
DB_SSL=true
```

Optional:

```env
APP_URL=https://your-app.example
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
MINIMUM_SIMILARITY=0.25
```

Render generates `AUTH_SECRET` automatically through `render.yaml`. Existing pre-authentication documents remain in the database with no owner and are intentionally hidden from newly registered users. Re-upload those documents after signing in.

## Verification checklist

1. Register and sign in.
2. Upload a text-based PDF and verify page/chunk counts.
3. Select one or more documents and ask a question.
4. Confirm the answer streams and citations display page numbers and excerpts.
5. Refresh and reopen the saved conversation.
6. Delete a document and verify it is removed only for that user.
7. Create a second account and verify complete document/chat isolation.
