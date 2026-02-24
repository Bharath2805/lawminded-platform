import { createConfiguredNestApp } from './app.factory';

async function bootstrap() {
  const app = await createConfiguredNestApp();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
