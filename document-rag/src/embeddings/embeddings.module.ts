import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';

/**
 * EmbeddingsModule
 *
 * Encapsulates all vector embedding logic.
 * Exports EmbeddingsService so DocumentsModule and RetrievalModule
 * can inject it without knowing its internal implementation.
 *
 * Phase 3: Will configure the local MiniLM HTTP client here.
 */
@Module({
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
