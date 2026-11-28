import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { applySecurityHeaders } from './common/security/security-headers';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Registered first so every response, including errors, carries them.
  applySecurityHeaders(app);

  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (
    !Number.isInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 10
  ) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10.');
  }
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.use(cookieParser());

  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
