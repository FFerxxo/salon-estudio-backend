import 'dotenv/config';
import { crearServidor } from './app';
import { registrarError } from './log';

const port = Number(process.env.PORT) || 4000;
const { httpServer } = crearServidor();

httpServer.listen(port, () => {
  console.log(`Realtime server listening on port ${port}`);
});

process.on('unhandledRejection', (error) => registrarError('unhandledRejection', error));
