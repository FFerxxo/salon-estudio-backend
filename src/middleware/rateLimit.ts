import { NextFunction, Request, Response } from 'express';

const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 10;

export const MENSAJE_DEMASIADOS_INTENTOS =
  'Demasiados intentos. Espera unos minutos antes de volver a intentar.';

interface RegistroIp {
  intentos: number;
  expiraEn: number;
}

function obtenerIp(req: Request): string {
  const reenviado = req.headers['x-forwarded-for'];
  if (typeof reenviado === 'string' && reenviado.trim() !== '') {
    return reenviado.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'desconocida';
}

/**
 * Límite en memoria por IP para evitar fuerza bruta sobre credenciales.
 * Limpia entradas vencidas bajo demanda para no dejar temporizadores activos.
 */
export function crearRateLimit(opciones?: { ventanaMs?: number; maxIntentos?: number }) {
  const ventanaMs = opciones?.ventanaMs ?? VENTANA_MS;
  const maxIntentos = opciones?.maxIntentos ?? MAX_INTENTOS;
  const registros = new Map<string, RegistroIp>();

  function middleware(req: Request, res: Response, next: NextFunction) {
    const ahora = Date.now();
    const ip = obtenerIp(req);
    const actual = registros.get(ip);

    if (!actual || ahora >= actual.expiraEn) {
      registros.set(ip, { intentos: 1, expiraEn: ahora + ventanaMs });
      next();
      return;
    }

    if (actual.intentos >= maxIntentos) {
      const esperaSegundos = Math.max(1, Math.ceil((actual.expiraEn - ahora) / 1000));
      res.setHeader('Retry-After', String(esperaSegundos));
      res.status(429).json({ error: MENSAJE_DEMASIADOS_INTENTOS });
      return;
    }

    actual.intentos += 1;
    next();
  }

  function reiniciar() {
    registros.clear();
  }

  return { middleware, reiniciar };
}

const limitadorIngresoUsuario = crearRateLimit();

export const rateLimitIngresoUsuario = limitadorIngresoUsuario.middleware;
export const reiniciarRateLimitIngresoUsuario = limitadorIngresoUsuario.reiniciar;
