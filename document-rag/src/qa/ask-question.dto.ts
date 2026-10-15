// ask-question.dto.ts
// Describes the shape of the POST /qa/ask request body.

import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Supported retrieval search modes.
 *
 * 'vector'  — Pure cosine similarity search (pgvector).
 *             Best for conceptual/semantic questions.
 *
 * 'hybrid'  — Vector + BM25 keyword search merged via RRF.
 *             Best for questions containing exact terms, codes,
 *             section numbers, error codes, or proper names.
 *             This is the recommended default for production.
 */
export type SearchMode = 'vector' | 'hybrid';

export class AskQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Question must be at least 3 characters long.' })
  question: string;

  /**
   * Optional minimum cosine similarity score (0.0 – 1.0).
   * Only applicable when searchMode is 'vector'.
   * For 'hybrid' mode the threshold is not used — RRF rank cutoff governs quality.
   *
   * Defaults to 0.50 if not provided.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0, { message: 'minScore must be at least 0.0' })
  @Max(1.0, { message: 'minScore must be at most 1.0' })
  minScore?: number;

  /**
   * Optional search mode.
   *   'vector' — semantic vector search only (default)
   *   'hybrid' — vector + BM25 keyword, merged by RRF (recommended for prod)
   *
   * Defaults to 'hybrid' in QaService if omitted.
   */
  @IsOptional()
  @IsString()
  @IsIn(['vector', 'hybrid'], {
    message: 'searchMode must be either "vector" or "hybrid"',
  })
  searchMode?: SearchMode;
}
