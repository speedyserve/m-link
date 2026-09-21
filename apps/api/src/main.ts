import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ extended: true, limit: '256kb' }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-RM-ID'],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  const config = new DocumentBuilder()
    .setTitle('M-Link API').setDescription('Banking and Agent integration APIs').setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-RM-ID' }, 'rm-id')
    .addBearerAuth(undefined, 'internal-agent-token').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('API startup failed', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});

