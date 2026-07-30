import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// ── 4 Feature Modules ────────────────────────────────────────────
import { DocumentsModule } from './documents/documents.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { QaModule } from './qa/qa.module';

// ── Centralized DB Config ─────────────────────────────────────────
import { getDatabaseConfig } from './config/database.config';

@Module({
  imports: [
    // Load .env globally — no need to import ConfigModule in child modules
    ConfigModule.forRoot({ isGlobal: true }),

    // TypeORM — reads DB credentials from ConfigService via getDatabaseConfig()
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getDatabaseConfig(configService),
    }),

    // Feature Modules
    DocumentsModule,
    EmbeddingsModule,
    RetrievalModule,
    QaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

