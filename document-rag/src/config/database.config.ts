import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');
  const ssl =
    configService.get<string>('DB_SSL') === 'true'
      ? { rejectUnauthorized: false }
      : false;

  if (databaseUrl) {
    return {
      type: 'postgres',
      url: databaseUrl,
      ssl,
      autoLoadEntities: true,
      synchronize: true,
    };
  }

  return {
    type: 'postgres',
    host: configService.get<string>('DB_HOST'),
    port: configService.get<number>('DB_PORT'),
    username: configService.get<string>('DB_USER'),
    password: configService.get<string>('DB_PASSWORD'),
    database: configService.get<string>('DB_NAME'),
    ssl,
    autoLoadEntities: true,
    synchronize: true,
  };
};
