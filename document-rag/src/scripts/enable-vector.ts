import { Client } from 'pg';

async function enableVectorExtension() {
  const connectionString = process.env.DATABASE_URL;
  const ssl =
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

  const client = connectionString
    ? new Client({ connectionString, ssl })
    : new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 5432),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl,
      });

  await client.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('pgvector extension is ready.');

    // Ensure searchVector column exists on chunks table for hybrid BM25 search
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chunks') THEN
          ALTER TABLE chunks ADD COLUMN IF NOT EXISTS "searchVector" tsvector;
          CREATE INDEX IF NOT EXISTS "idx_chunks_search_vector" ON chunks USING gin("searchVector");
        END IF;
      END $$;
    `);
    console.log('Hybrid search schema (tsvector + GIN index) is ready.');
  } finally {
    await client.end();
  }
}

enableVectorExtension().catch((error) => {
  console.error('Failed to enable pgvector:', error);
  process.exit(1);
});
