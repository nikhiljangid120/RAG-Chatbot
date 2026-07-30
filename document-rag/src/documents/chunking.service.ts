/**
 * ChunkingService
 *
 * Single Responsibility: Convert a large text string into an array of
 * overlapping text chunks.
 *
 * This service is intentionally kept pure and stateless.
 * It has zero dependencies on TypeORM, HTTP, or PDF parsing.
 * This makes it trivially unit-testable with just string inputs.
 */
import { Injectable, Logger } from '@nestjs/common';

export interface TextChunk {
  content: string;
  chunkIndex: number;
  metadata: {
    startChar: number;
    endChar: number;
    charCount: number;
  };
}

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  // Default values tuned for MiniLM (256 token limit ≈ ~500 chars)
  private readonly DEFAULT_CHUNK_SIZE = 500;
  private readonly DEFAULT_OVERLAP = 100;

  /**
   * Split a large text string into overlapping chunks using a sliding window.
   *
   * Algorithm:
   * 1. Start at position 0
   * 2. Take chars [pos, pos + chunkSize]
   * 3. Move forward by (chunkSize - overlap) characters
   * 4. Repeat until end of text
   *
   * Example with chunkSize=500, overlap=100:
   *   Chunk 0: chars [0,    500]
   *   Chunk 1: chars [400,  900]   ← 100 char overlap with Chunk 0
   *   Chunk 2: chars [800, 1300]   ← 100 char overlap with Chunk 1
   */
  chunkText(  
    text: string,
    chunkSize: number = this.DEFAULT_CHUNK_SIZE,
    overlap: number = this.DEFAULT_OVERLAP,
  ): TextChunk[] {
    const chunks: TextChunk[] = [];

    // Normalize whitespace: collapse multiple spaces, tabs, and newlines
    // into single spaces for cleaner chunk content
    const normalizedText = text.replace(/\s+/g, ' ').trim();

    if (!normalizedText) {
      this.logger.warn('chunkText received empty or whitespace-only text');
      return [];
    }

    const step = chunkSize - overlap;
    let chunkIndex = 0;
    let startPos = 0;

    while (startPos < normalizedText.length) {
      const endPos = Math.min(startPos + chunkSize, normalizedText.length);
      const content = normalizedText.slice(startPos, endPos).trim();

      // Skip chunks that are only whitespace after trimming
      if (content.length > 0) {
        chunks.push({
          content,
          chunkIndex,
          metadata: {
            startChar: startPos,
            endChar: endPos,
            charCount: content.length,
          },
        });
        chunkIndex++;
      }

      // If we've reached the end, stop
      if (endPos >= normalizedText.length) break;

      startPos += step;
    }

    this.logger.log(
      `Chunked text into ${chunks.length} chunks ` +
        `(chunkSize=${chunkSize}, overlap=${overlap})`,
    );

    return chunks;
  }
}
