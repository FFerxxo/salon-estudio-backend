import { Router, Request, Response } from 'express';
import { appInfoService } from '../services/appInfoService';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

apiRouter.get('/app-info', async (_req: Request, res: Response) => {
  try {
    const data = await appInfoService.fetchAppInfo();
    res.status(200).json(data);
  } catch {
    res.status(503).json({
      error: 'No se pudo leer la base de datos. Intenta de nuevo.',
    });
  }
});
