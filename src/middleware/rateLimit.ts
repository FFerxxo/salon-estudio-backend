import { createHash } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { normalizarUsernameIngreso } from '../validation/auth';

const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 10;
const MAX_ENTRADAS = 10_000;
const MAX_LARGO_CLAVE_USUARIO = 64;

export const MENSAJE_DEMASIADOS_INTENTOS =
  'Demasiados intentos. Espera unos minutos antes de volver a intentar.';

interface RegistroLimite {
  intentos: number;
  expiraEn: number;
}

function obtenerIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'desconocida';
}

function obtenerClaveUsername(req: Request): string | null {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    return null;
  }
  const normalizado = normalizarUsernameIngreso((req.body as Record<string, unknown>).username);
  if (!normalizado) return null;
  if (normalizado.length <= MAX_LARGO_CLAVE_USUARIO) {
    return normalizado;
  }
  return `h:${createHash('sha256').update(normalizado).digest('hex')}`;
}

function limpiarVencidos(registros: Map<string, RegistroLimite>, ahora: number) {
  for (const [clave, registro] of registros) {
    if (ahora >= registro.expiraEn) {
      registros.delete(clave);
    }
  }
}

function incrementarRegistro(
  registros: Map<string, RegistroLimite>,
  clave: string,
  ahora: number,
  ventanaMs: number,
  maxEntradas: number
) {
  const actual = registros.get(clave);
  if (actual) {
    actual.intentos += 1;
    return;
  }
  if (registros.size >= maxEntradas) {
    const masAntigua = registros.keys().next().value;
    if (masAntigua !== undefined) {
      registros.delete(masAntigua);
    }
  }
  registros.set(clave, { intentos: 1, expiraEn: ahora + ventanaMs });
}

/**
 * Límite en memoria por IP y por usuario normalizado para evitar fuerza bruta sobre credenciales.
 * Limpia entradas vencidas bajo demanda para no dejar temporizadores activos y acota el tamaño en memoria.
 */
export function crearRateLimit(opciones?: {
  ventanaMs?: number;
  maxIntentos?: number;
  maxEntradas?: number;
}) {
  const ventanaMs = opciones?.ventanaMs ?? VENTANA_MS;
  const maxIntentos = opciones?.maxIntentos ?? MAX_INTENTOS;
  const maxEntradas = opciones?.maxEntradas ?? MAX_ENTRADAS;
  const registrosIp = new Map<string, RegistroLimite>();
  const registrosUsuario = new Map<string, RegistroLimite>();

  function middleware(req: Request, res: Response, next: NextFunction) {
    const ahora = Date.now();
    limpiarVencidos(registrosIp, ahora);
    limpiarVencidos(registrosUsuario, ahora);

    const ip = obtenerIp(req);
    const claveUsuario = obtenerClaveUsername(req);

    const regIp = registrosIp.get(ip);
    const regUsuario = claveUsuario ? registrosUsuario.get(claveUsuario) : undefined;

    const ipBloqueada = regIp !== undefined && regIp.intentos >= maxIntentos;
    const usuarioBloqueado = regUsuario !== undefined && regUsuario.intentos >= maxIntentos;

    if (ipBloqueada || usuarioBloqueado) {
      const expiraEn = Math.max(
        ipBloqueada ? regIp.expiraEn : 0,
        usuarioBloqueado ? regUsuario.expiraEn : 0
      );
      const esperaSegundos = Math.max(1, Math.ceil((expiraEn - ahora) / 1000));
      res.setHeader('Retry-After', String(esperaSegundos));
      res.status(429).json({ error: MENSAJE_DEMASIADOS_INTENTOS });
      return;
    }

    incrementarRegistro(registrosIp, ip, ahora, ventanaMs, maxEntradas);
    if (claveUsuario) {
      incrementarRegistro(registrosUsuario, claveUsuario, ahora, ventanaMs, maxEntradas);
    }
    next();
  }

  function reiniciar() {
    registrosIp.clear();
    registrosUsuario.clear();
  }

  function conteoRegistros() {
    return {
      ips: registrosIp.size,
      usuarios: registrosUsuario.size,
    };
  }

  return { middleware, reiniciar, conteoRegistros };
}

const limitadorIngresoUsuario = crearRateLimit();

export const rateLimitIngresoUsuario = limitadorIngresoUsuario.middleware;
export const reiniciarRateLimitIngresoUsuario = limitadorIngresoUsuario.reiniciar;
