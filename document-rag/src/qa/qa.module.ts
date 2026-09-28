import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import { PromptBuilderService } from './prompt-builder.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { AuthModule } from '../auth/auth.module';
import { ChatsModule } from '../chats/chats.module';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  imports: [ConfigModule, EmbeddingsModule, RetrievalModule, AuthModule, ChatsModule],
  controllers: [QaController],
  providers: [QaService, PromptBuilderService, RateLimitGuard],
})
export class QaModule {}
