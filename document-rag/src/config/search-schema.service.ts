import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SearchSchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SearchSchemaService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    // TypeORM must create the tables before we initialize search on a fresh DB.
    // Let failures stop startup so Render never marks a partial schema healthy.
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`
        UPDATE chunks
        SET "searchVector" = to_tsvector('english', content)
        WHERE "searchVector" IS NULL
      `);
      await manager.query(`
        CREATE INDEX IF NOT EXISTS "idx_chunks_search_vector"
        ON chunks USING gin("searchVector")
      `);
    });
    this.logger.log('Hybrid search backfill and GIN index are ready.');
  }
}
