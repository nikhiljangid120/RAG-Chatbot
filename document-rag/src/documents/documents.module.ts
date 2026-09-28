import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { ChunkingService } from './chunking.service';
import { DocumentEntity } from './document.entity';
import { ChunkEntity } from './chunk.entity';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity, ChunkEntity]), EmbeddingsModule, AuthModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, ChunkingService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
