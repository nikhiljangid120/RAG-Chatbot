import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve the production frontend and keep all API routes under /api.
  app.setGlobalPrefix('api');
  app.useStaticAssets(join(__dirname, '..', 'public'));

  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors(
    corsOrigin
      ? { origin: corsOrigin.split(',').map((origin) => origin.trim()) }
      : undefined,
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`);
}
bootstrap();
