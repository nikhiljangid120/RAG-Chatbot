import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Phase1Mvp1700000000000 } from '../migrations/Phase1Mvp1700000000000';

export const getDatabaseConfig = (config: ConfigService): TypeOrmModuleOptions => {
  const shared = {
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: true,
    migrations: [Phase1Mvp1700000000000],
    ssl: config.get<string>('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
  };
  const url = config.get<string>('DATABASE_URL');
  return url ? { type: 'postgres', url, ...shared } : {
    type: 'postgres',
    host: config.get<string>('DB_HOST'),
    port: config.get<number>('DB_PORT'),
    username: config.get<string>('DB_USER'),
    password: config.get<string>('DB_PASSWORD'),
    database: config.get<string>('DB_NAME'),
    ...shared,
  };
};
