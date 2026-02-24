import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

function shouldAllowVercelPreviewOrigins(): boolean {
  const raw = process.env.CORS_ALLOW_VERCEL_PREVIEWS ?? '';
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function resolveAllowedOrigins(): string[] {
  const configuredOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const devOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];

  return Array.from(
    new Set(
      process.env.NODE_ENV === 'production'
        ? configuredOrigins
        : [...devOrigins, ...configuredOrigins],
    ),
  );
}

export async function createConfiguredNestApp() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const allowedOrigins = resolveAllowedOrigins();
  const allowVercelPreviews = shouldAllowVercelPreviewOrigins();

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      if (
        allowVercelPreviews &&
        origin.startsWith('https://') &&
        origin.endsWith('.vercel.app')
      ) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  return app;
}
