import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import { PromptBuilderService } from './prompt-builder.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { RetrievalModule } from '../retrieval/retrieval.module';

/**
 * QaModule
 *
 * Orchestrates the complete question-answering pipeline.
 * Depends on EmbeddingsModule (to embed the user's question)
 * and RetrievalModule (to find relevant chunks from pgvector).
 *
 * Phase 5: QaService will be fully implemented here.
 */
@Module({
  imports: [
    ConfigModule,      // Provides ConfigService → reads OPENROUTER_API_KEY from .env
    EmbeddingsModule,  // Provides EmbeddingsService → embed the user's question
    RetrievalModule,   // Provides RetrievalService → find relevant chunks
  ],
  controllers: [QaController],
  providers: [QaService, PromptBuilderService],
})
export class QaModule {}
