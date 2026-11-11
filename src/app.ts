import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { apiRouter } from './routes/apiRoutes';
import { userRouter } from './routes/userRoutes';
import { swaggerDocument } from './swagger';

export function createApp() {
  const app = express();

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.use(
    cors({
      origin: frontendUrl,
    })
  );

  app.use(express.json());

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.use('/api/usuarios', userRouter);
  app.use('/api', apiRouter);

  // JSON mal formado en el cuerpo de la petición → 400 con mensaje claro
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
      return;
    }
    res.status(500).json({ error: 'Ocurrió un error inesperado. Intenta de nuevo.' });
  });

  return app;
}

export const app = createApp();
