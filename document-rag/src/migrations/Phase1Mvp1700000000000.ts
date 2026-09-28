import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase1Mvp1700000000000 implements MigrationInterface {
  name = 'Phase1Mvp1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar NOT NULL UNIQUE, "passwordHash" varchar NOT NULL, "passwordSalt" varchar NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), filename varchar NOT NULL, hash varchar NOT NULL, status varchar NOT NULL DEFAULT 'PENDING', "pageCount" integer NOT NULL DEFAULT 0, "ownerId" uuid NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS "ownerId" uuid NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS "pageCount" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`DO $$ DECLARE c record; BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'documents'::regclass AND contype = 'u' LOOP IF pg_get_constraintdef(c.oid) LIKE '%(hash)%' THEN EXECUTE 'ALTER TABLE documents DROP CONSTRAINT ' || quote_ident(c.conname); END IF; END LOOP; END $$`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS documents_owner_hash_unique ON documents ("ownerId", hash) WHERE "ownerId" IS NOT NULL`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content text NOT NULL, "chunkIndex" integer NOT NULL, metadata jsonb NULL, embedding vector(384) NULL, "documentId" uuid NULL REFERENCES documents(id) ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS chat_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "ownerId" uuid NOT NULL, title varchar NOT NULL DEFAULT 'New conversation', "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role varchar NOT NULL, content text NOT NULL, sources jsonb NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "sessionId" uuid NULL REFERENCES chat_sessions(id) ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS chat_sessions_owner_idx ON chat_sessions ("ownerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks ("documentId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS chat_messages');
    await queryRunner.query('DROP TABLE IF EXISTS chat_sessions');
    await queryRunner.query('DROP TABLE IF EXISTS users');
    await queryRunner.query('DROP INDEX IF EXISTS documents_owner_hash_unique');
    await queryRunner.query('ALTER TABLE documents DROP COLUMN IF EXISTS "ownerId"');
    await queryRunner.query('ALTER TABLE documents DROP COLUMN IF EXISTS "pageCount"');
  }
}
