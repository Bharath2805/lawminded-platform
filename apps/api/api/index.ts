import type { Request, Response } from 'express';
import { createConfiguredNestApp } from '../src/app.factory';

let cachedHandler:
  | ((req: Request, res: Response) => void | Promise<void>)
  | null = null;

async function getHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  const app = await createConfiguredNestApp();
  await app.init();

  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance();

  cachedHandler = (req: Request, res: Response): void | Promise<void> =>
    instance(req, res);

  return cachedHandler;
}

export default async function handler(req: Request, res: Response) {
  const nestHandler = await getHandler();
  return nestHandler(req, res);
}
