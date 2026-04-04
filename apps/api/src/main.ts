import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: (
        requestOrigin: string | undefined,
        callback: (err: Error | null, allow?: boolean | string) => void,
      ) => {
        if (!requestOrigin) {
          callback(null, true);
          return;
        }
        if (env.CLIENT_ORIGIN.includes(requestOrigin)) {
          callback(null, requestOrigin);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    },
  });

  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (env.APP_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LiLink API')
      .setDescription('Core API for LiLink.')
      .setVersion('0.1.0')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(env.PORT);
}

void bootstrap();
