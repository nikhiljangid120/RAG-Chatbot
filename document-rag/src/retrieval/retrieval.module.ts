import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';

/**
 * RetrievalModule
 *
 * Encapsulates the pgvector similarity search logic.
 *
 * DataSource (used by RetrievalService) is provided globally by
 * TypeOrmModule.forRootAsync in AppModule — no extra import needed here.
 *
 * Exports RetrievalService so QaModule can inject it for
 * the question-answering pipeline in Phase 5.
 */
@Module({
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
