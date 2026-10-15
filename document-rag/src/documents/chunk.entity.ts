import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { DocumentEntity } from './document.entity';

@Entity('chunks')
export class ChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The actual text paragraph
  @Column('text')
  content: string;

  // Crucial for understanding the order of paragraphs in the original document
  @Column({ type: 'int' })
  chunkIndex: number;

  // Flexible metadata for EXPLAINABILITY (e.g. { "pageNumber": 12, "section": "Cafeteria" })
  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  // The AI embedding. 384 dimensions for MiniLM.
  @Column({ type: 'vector', length: 384, nullable: true })
  embedding: number[];

  /**
   * PostgreSQL tsvector column for Full-Text Search (BM25-style keyword retrieval).
   *
   * WHY THIS EXISTS — Hybrid Search:
   * Vector search is great at finding semantically similar content ("meaning search"),
   * but it fails on exact terms with no semantic neighbours — things like:
   *   - Error codes:     "ERR_TIMEOUT_503"
   *   - Section numbers: "Section 4.2.1 clause C"
   *   - Proper names:    "John Smith's employee ID"
   *   - Rare acronyms:   "GDPR Article 17 RTBF"
   *
   * PostgreSQL's built-in Full-Text Search (tsvector + tsquery) handles these perfectly.
   * Combining both search modes (Hybrid Search) covers each other's blind spots.
   *
   * HOW IT WORKS:
   * - `tsvector` is a pre-processed, tokenized, stemmed representation of text
   *   that PostgreSQL uses for fast keyword ranking via its GIN index.
   * - Example: "The quick brown foxes" → 'brown':3 'fox':4 'quick':2
   * - PostgreSQL computes a ts_rank() relevance score when a tsquery matches.
   *
   * HOW IT IS POPULATED:
   * After chunk bulk-insert, DocumentsService runs:
   *   UPDATE chunks SET "searchVector" = to_tsvector('english', content)
   *   WHERE "documentId" = $1
   * This is done in a separate SQL call — TypeORM's synchronize will create
   * the column as a raw 'tsvector' type; populating it is handled in application code.
   *
   * NOTE: synchronize:true will add this column on next server restart.
   * Existing chunks will have NULL searchVector until their document is re-uploaded.
   */
  @Column({
    type: 'tsvector',
    nullable: true,
    select: false, // exclude from default SELECT * — it's large and not needed in responses
  })
  searchVector: any;

  // The Many-to-One relationship.
  // onDelete: 'CASCADE' means if the parent document is deleted, these chunks die with it automatically.
  @ManyToOne(() => DocumentEntity, (document) => document.chunks, {
    onDelete: 'CASCADE',
  })
  document: DocumentEntity;

  // Virtual FK helper — TypeORM populates this from the JOIN; not a separate DB column.
  @Column({ nullable: true })
  documentId: string;
}
