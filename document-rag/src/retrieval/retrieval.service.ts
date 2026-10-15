import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Represents a single chunk returned by a similarity search.
 * This is what gets passed to QaService as "context" for the LLM.
 */
export interface RetrievedChunk {
  chunkId: string;
  content: string; // The actual text — fed into the LLM prompt
  chunkIndex: number; // Position in the original document
  metadata: any; // { startChar, endChar, charCount }
  documentId: string;
  documentFilename: string; // Source citation shown to the user
  similarityScore: number; // 0 to 1 — higher means more relevant
  rrfScore?: number; // Hybrid ranking only; never displayed as a percentage.
}

type RawRetrievedChunk = Omit<
  RetrievedChunk,
  'similarityScore' | 'rrfScore'
> & {
  similarityScore: number | string;
  rrfScore?: number | string;
};

function normalizeScores(rows: RawRetrievedChunk[]): RetrievedChunk[] {
  return rows.map((row) => {
    const similarityScore = Number(row.similarityScore);
    const rrfScore =
      row.rrfScore === undefined ? undefined : Number(row.rrfScore);
    if (
      !Number.isFinite(similarityScore) ||
      (rrfScore !== undefined && !Number.isFinite(rrfScore))
    ) {
      throw new Error('Database returned an invalid retrieval score.');
    }
    return { ...row, similarityScore, rrfScore };
  });
}

/**
 * RetrievalService
 *
 * Responsibility: Given a query, find the most relevant chunks using one
 * of two search strategies:
 *
 *   1. VECTOR SEARCH (default):
 *      Cosine similarity search via pgvector. Finds chunks that are
 *      semantically similar to the question — great for meaning-based queries.
 *
 *   2. HYBRID SEARCH (recommended):
 *      Runs BOTH vector search AND PostgreSQL Full-Text Search (BM25-style)
 *      in parallel, then merges results using Reciprocal Rank Fusion (RRF).
 *      Catches what pure vector search misses: exact codes, names, section refs.
 *
 * WHY RAW SQL:
 * TypeORM's query builder does not understand the pgvector <=> operator
 * or the tsvector/tsquery FTS operators. We use DataSource.query() for
 * full control over the SQL.
 *
 * RAG Role: This is the "R" in RAG — Retrieval.
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  // DataSource is registered globally by TypeOrmModule.forRootAsync in AppModule.
  constructor(private readonly dataSource: DataSource) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // METHOD 1: VECTOR-ONLY SEARCH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find the top-K chunks most semantically similar to the query embedding,
   * filtered by a minimum similarity score threshold.
   *
   * Uses pgvector's <=> cosine distance operator exclusively.
   * Best for: semantic/conceptual questions where meaning matters more than exact words.
   *
   * @param queryEmbedding  384-dim vector of the user's question
   * @param topK            Number of chunks to return (default: 5)
   * @param minScore        Minimum cosine similarity required (default: 0.50)
   */
  async findSimilarChunks(
    queryEmbedding: number[],
    topK: number = 5,
    minScore: number = 0.5,
  ): Promise<RetrievedChunk[]> {
    this.logger.log(
      `[VECTOR] Searching top-${topK} chunks (minScore=${minScore})...`,
    );

    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    // Sub-query pattern: compute alias in inner query, filter alias in outer query.
    // Avoids evaluating the cosine expression twice.
    const rows: RawRetrievedChunk[] = await this.dataSource.query(
      `
      SELECT *
      FROM (
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
      ) ranked
      WHERE "similarityScore" >= $3
      `,
      [vectorLiteral, topK, minScore],
    );
    const results = normalizeScores(rows);

    this.logger.log(
      `[VECTOR] ${results.length} chunks above threshold. ` +
        `Top similarity: ${results[0]?.similarityScore?.toFixed(4) ?? 'N/A'}`,
    );

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METHOD 2: HYBRID SEARCH (BM25 + VECTOR + RRF)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Hybrid search: run vector search and BM25 keyword search IN PARALLEL,
   * then merge both ranked lists using Reciprocal Rank Fusion (RRF).
   *
   * WHY HYBRID SEARCH:
   * ┌─────────────────────────────────────────────────────────────────┐
   * │ Query type               │ Vector │ BM25  │ Hybrid             │
   * ├─────────────────────────────────────────────────────────────────┤
   * │ "What is refund policy?" │  ✅     │  ✅   │  ✅  best of both │
   * │ "Section 4.2.1 clause C" │  ❌     │  ✅   │  ✅  BM25 saves   │
   * │ "ERR_TIMEOUT_503 error"  │  ❌     │  ✅   │  ✅  BM25 saves   │
   * │ "John Smith employee ID" │  ❌     │  ✅   │  ✅  BM25 saves   │
   * │ "What does AI mean here" │  ✅     │  ❌   │  ✅  vector saves │
   * └─────────────────────────────────────────────────────────────────┘
   *
   * HOW RECIPROCAL RANK FUSION (RRF) WORKS:
   *
   *   RRF formula:  score = Σ  1 / (k + rank_in_list)
   *                         each list
   *
   *   Where k=60 (Cormack et al. 2009 recommended constant).
   *
   *   Example with k=60:
   *     Chunk A — vector rank #1, BM25 rank #3:
   *       RRF = 1/(60+1) + 1/(60+3) = 0.01639 + 0.01587 = 0.03226
   *
   *     Chunk B — vector rank #2, BM25 rank #1:
   *       RRF = 1/(60+2) + 1/(60+1) = 0.01613 + 0.01639 = 0.03252  ← wins
   *
   *     Chunk C — only in vector rank #5, not in BM25:
   *       RRF = 1/(60+5) = 0.01538  ← lower — didn't appear in keyword search
   *
   * HOW THE SQL WORKS:
   *   CTE vector_ranked: top-$2 chunks by cosine distance (pgvector)
   *   CTE bm25_ranked:   top-$2 chunks by ts_rank (PostgreSQL FTS)
   *   Final SELECT:      FULL OUTER JOIN both CTEs, apply RRF formula,
   *                      ORDER BY rrf_score DESC, LIMIT $2
   *
   * "similarityScore" is cosine similarity for citations; "rrfScore" is
   * used only for ranking and is not a percentage.
   * A separate minScore filter is NOT applied here because RRF scores are
   * not directly comparable to cosine similarity values — instead we rely
   * on a rank cutoff ($2 LIMIT) plus the BM25 fallback to guarantee quality.
   *
   * @param queryEmbedding  384-dim vector of the user's question
   * @param queryText       Raw question string for BM25 keyword matching
   * @param topK            Number of final chunks to return (default: 5)
   */
  async findHybridChunks(
    queryEmbedding: number[],
    queryText: string,
    topK: number = 5,
  ): Promise<RetrievedChunk[]> {
    this.logger.log(
      `[HYBRID] Running vector + BM25 search, merging top-${topK} via RRF...`,
    );

    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    // Sanitize the query string for PostgreSQL tsquery:
    //   - Split into words, strip non-alphanumeric characters
    //   - Join with ' & ' (AND operator) so all words must be present for a match
    //   - plainto_tsquery() is used instead — it handles arbitrary user input safely
    //   - We pass the raw text as $2 and let PostgreSQL parse it
    const candidateLimit = topK * 2;
    const rows: RawRetrievedChunk[] = await this.dataSource.query(
      `
      -- ─── CTE 1: VECTOR SEARCH ───────────────────────────────────────────────
      -- Find the top candidate chunks via cosine similarity.
      -- RANK() assigns 1 to the most similar chunk (smallest distance).
      WITH vector_ranked AS (
        SELECT
          c.id                                            AS "chunkId",
          c.content,
          c."chunkIndex",
          c.metadata,
          c."documentId",
          d.filename                                      AS "documentFilename",
          1 - (c.embedding <=> $1::vector)                AS vector_score,
          RANK() OVER (ORDER BY c.embedding <=> $1::vector ASC) AS vector_rank
        FROM   chunks c
        INNER JOIN documents d ON c."documentId" = d.id
        WHERE  c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector ASC, c.id
        LIMIT  $3
      ),

      -- ─── CTE 2: BM25 KEYWORD SEARCH (PostgreSQL FTS) ────────────────────────
      -- plainto_tsquery() safely converts raw user text into a tsquery.
      -- RANK() assigns 1 to the highest ts_rank chunk.
      bm25_ranked AS (
        SELECT
          c.id                                            AS "chunkId",
          c.content,
          c."chunkIndex",
          c.metadata,
          c."documentId",
          d.filename                                      AS "documentFilename",
          1 - (c.embedding <=> $1::vector)                AS vector_score,
          ts_rank("searchVector", plainto_tsquery('english', $2))   AS bm25_score,
          RANK() OVER (
            ORDER BY ts_rank("searchVector", plainto_tsquery('english', $2)) DESC
          )                                               AS bm25_rank
        FROM   chunks c
        INNER JOIN documents d ON c."documentId" = d.id
        WHERE  "searchVector" @@ plainto_tsquery('english', $2)
        ORDER BY ts_rank("searchVector", plainto_tsquery('english', $2)) DESC, c.id
        LIMIT  $3
      ),

      -- ─── CTE 3: RECIPROCAL RANK FUSION ──────────────────────────────────────
      -- FULL OUTER JOIN so a chunk appearing in only one list still gets a score.
      -- RRF formula: score = 1/(k + vector_rank) + 1/(k + bm25_rank) (k = 60)
      rrf AS (
        SELECT
          COALESCE(v."chunkId",         b."chunkId")         AS "chunkId",
          COALESCE(v.content,           b.content)           AS content,
          COALESCE(v."chunkIndex",      b."chunkIndex")      AS "chunkIndex",
          COALESCE(v.metadata,          b.metadata)          AS metadata,
          COALESCE(v."documentId",      b."documentId")      AS "documentId",
          COALESCE(v."documentFilename",b."documentFilename") AS "documentFilename",
          COALESCE(v.vector_score, b.vector_score, 0)::double precision AS "similarityScore",
          -- RRF score — higher is better
          (
            COALESCE(1.0 / (60 + v.vector_rank), 0)
          + COALESCE(1.0 / (60 + b.bm25_rank), 0)
          )::double precision                               AS "rrfScore"
        FROM       vector_ranked v
        FULL OUTER JOIN bm25_ranked b ON v."chunkId" = b."chunkId"
      )

      -- ─── FINAL: SORT BY RRF SCORE, RETURN TOP-K ─────────────────────────────
      SELECT *
      FROM   rrf
      ORDER  BY "rrfScore" DESC, "chunkId"
      LIMIT  $4
      `,
      [vectorLiteral, queryText, candidateLimit, topK],
    );
    const results = normalizeScores(rows);

    this.logger.log(
      `[HYBRID] ${results.length} chunks returned after RRF merge. ` +
        `Top RRF score: ${results[0]?.rrfScore?.toFixed(6) ?? 'N/A'}`,
    );

    return results;
  }
}
