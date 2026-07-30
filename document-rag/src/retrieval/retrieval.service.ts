import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Represents a single chunk returned by the similarity search.
 * This is what gets passed to QaService as "context" for the LLM.
 */
export interface RetrievedChunk {
  chunkId: string;
  content: string;        // The actual text — fed into the LLM prompt
  chunkIndex: number;     // Position in the original document
  metadata: any;          // { startChar, endChar, charCount }
  documentId: string;
  documentFilename: string; // Source citation shown to the user
  similarityScore: number;  // 0 to 1 — higher means more relevant
}

/**
 * RetrievalService
 *
 * Responsibility: Given a 384-dimensional query vector (the user's question,
 * embedded by EmbeddingsService), find the top-K most semantically similar
 * chunks stored in PostgreSQL using pgvector's cosine similarity.
 *
 * WHY RAW SQL:
 * TypeORM's query builder does not understand the pgvector <=> operator.
 * We use DataSource.query() to write the SQL ourselves, giving us full
 * control over the vector math and JOIN logic.
 *
 * RAG Role: This is the "R" in RAG — Retrieval.
 * Without this step, the LLM would have no context from your documents
 * and would either hallucinate or say "I don't know."
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  // DataSource is registered globally by TypeOrmModule.forRootAsync in AppModule.
  // NestJS injects it automatically — no extra module imports required.
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Find the top-K chunks most semantically similar to the query embedding.
   *
   * Algorithm:
   * 1. Format the 384-number array as a pgvector literal: [0.1, -0.2, ...]
   * 2. Run cosine distance query using <=> operator against all stored embeddings
   * 3. JOIN with documents table to get the source filename
   * 4. Return top-K results ordered by similarity (closest first)
   *
   * The <=> operator returns cosine DISTANCE (0 = identical, 2 = opposite).
   * We convert to similarity score: similarity = 1 - distance
   * So similarity ranges from -1 (opposite) to 1 (identical), just like cosine similarity.
   *
   * @param queryEmbedding  384-dim vector of the user's question
   * @param topK            Number of chunks to return (default: 5)
   */
  async findSimilarChunks(
    queryEmbedding: number[],
    topK: number = 5,
  ): Promise<RetrievedChunk[]> {
    this.logger.log(`Searching top-${topK} chunks via cosine similarity...`);

    // Format the number[] as a pgvector literal string.
    // pgvector expects the format: [0.023, -0.14, 0.88, ...]
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    // ─── THE CORE RAG QUERY ─────────────────────────────────────────────────
    //
    // c.embedding <=> $1::vector
    //   - <=>  is pgvector's cosine DISTANCE operator
    //   - $1   is our query vector (the user's question, embedded)
    //   - ::vector  casts the string literal to pgvector's vector type
    //
    // We reference $1 twice in the query (SELECT and ORDER BY).
    // PostgreSQL allows reusing the same parameter multiple times.
    //
    // ORDER BY ASC because we want LOWEST distance first (closest = most relevant).
    // ────────────────────────────────────────────────────────────────────────
    const results = await this.dataSource.query(
      `
      SELECT
        c.id                                          AS "chunkId",
        c.content,
        c."chunkIndex",
        c.metadata,
        c."documentId",
        d.filename                                    AS "documentFilename",
        1 - (c.embedding <=> $1::vector)              AS "similarityScore"
      FROM   chunks c
      INNER JOIN documents d ON c."documentId" = d.id
      WHERE  c.embedding IS NOT NULL
      ORDER  BY c.embedding <=> $1::vector ASC
      LIMIT  $2
      `,
      [vectorLiteral, topK],
    );

    this.logger.log(
      `Retrieved ${results.length} chunks. ` +
      `Top similarity: ${results[0]?.similarityScore?.toFixed(4) ?? 'N/A'}`,
    );

    return results as RetrievedChunk[];
  }
}
