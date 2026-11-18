import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Server } from 'socket.io';
import { autenticarSocket } from './middleware/socketAuth';

/** Responde GET /health (Render lo usa para saber que el servicio está vivo). */
function manejarHttp(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', servicio: 'salon-estudio-realtime' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Ruta no encontrada.' }));
}

export function crearServidor() {
  const httpServer = createServer(manejarHttp);

  const io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
  });

  io.use(autenticarSocket);

  return { httpServer, io };
}
