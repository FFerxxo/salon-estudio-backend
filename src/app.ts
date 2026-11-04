import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { apiRouter } from './routes/apiRoutes';
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
  app.use('/api', apiRouter);

  return app;
}

export const app = createApp();
