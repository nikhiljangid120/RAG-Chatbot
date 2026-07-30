import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable CORS for local frontend development
  app.enableCors();

  // GlobalValidationPipe activates class-validator decorators on all DTOs.
  // whitelist: true strips any extra fields the client sends that aren't in the DTO.
  // forbidNonWhitelisted: true throws a 400 if unexpected fields are sent.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application running on: http://localhost:${port}`);
}
bootstrap();

