import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Server } from 'socket.io';
import { autenticarSocket } from './middleware/socketAuth';
import { registrarEventos } from './sockets/eventos';
import { Presencia } from './sockets/presencia';

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

export function crearServidor(presencia = new Presencia()) {
  const httpServer = createServer(manejarHttp);

  const io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
  });

  io.use(autenticarSocket);
  const detener = registrarEventos(io, presencia);
  httpServer.on('close', detener);

  return { httpServer, io, detener };
}
