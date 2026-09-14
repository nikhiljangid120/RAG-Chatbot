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
  } finally {
    await client.end();
  }
}

enableVectorExtension().catch((error) => {
  console.error('Failed to enable pgvector:', error);
  process.exit(1);
});
