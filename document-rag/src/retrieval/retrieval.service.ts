import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface RetrievedChunk {
  chunkId: string;
  content: string;
  chunkIndex: number;
  metadata: { pageNumber?: number; [key: string]: unknown } | null;
  documentId: string;
  documentFilename: string;
  similarityScore: number;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  constructor(private readonly dataSource: DataSource) {}

  async findSimilarChunks(
    queryEmbedding: number[],
    ownerId: string,
    documentIds: string[] = [],
    topK = 5,
  ): Promise<RetrievedChunk[]> {
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;
    const selectedIds = documentIds.length > 0 ? documentIds : null;
    const results = await this.dataSource.query(
      `SELECT c.id AS "chunkId", c.content, c."chunkIndex", c.metadata,
              c."documentId", d.filename AS "documentFilename",
              1 - (c.embedding <=> $1::vector) AS "similarityScore"
       FROM chunks c
       INNER JOIN documents d ON c."documentId" = d.id
       WHERE c.embedding IS NOT NULL
         AND d."ownerId" = $2::uuid
         AND ($3::uuid[] IS NULL OR d.id = ANY($3::uuid[]))
       ORDER BY c.embedding <=> $1::vector ASC
       LIMIT $4`,
      [vectorLiteral, ownerId, selectedIds, topK],
    );
    this.logger.log(`Retrieved ${results.length} chunks for user ${ownerId}.`);
    return results as RetrievedChunk[];
  }
}
