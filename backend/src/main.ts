import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { appConfig, AppConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const cfg = app.get<AppConfig>(appConfig.KEY);
  const logger = new Logger('Bootstrap');

  // Nginx ortida haqiqiy mijoz IP'sini olish (rate limit uchun muhim)
  app.set('trust proxy', cfg.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Swagger UI inline skriptlari uchun CSP faqat swagger yoqilmaganda qat'iy
      contentSecurityPolicy: cfg.swaggerEnabled ? false : undefined,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  app.enableCors({
    origin: cfg.corsOrigins.length ? cfg.corsOrigins : !cfg.isProd,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86_400,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  if (cfg.swaggerEnabled) {
    const doc = new DocumentBuilder()
      .setTitle('Kids TV API')
      .setDescription(
        "Bolalar uchun virtual linear TV. Barcha vaqtlar UTC'da saqlanadi; public endpointlarga ?tz=Asia/Tashkent yuboring.",
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('access_token')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
    logger.log(`Swagger: http://localhost:${cfg.port}/docs`);
  }

  await app.listen(cfg.port, '0.0.0.0');
  logger.log(`API ishga tushdi: http://localhost:${cfg.port}/api/v1 (${cfg.nodeEnv})`);
}

bootstrap().catch((err: Error) => {
  // eslint-disable-next-line no-console
  console.error('Ishga tushirishda xato:', err.message);
  process.exit(1);
});
