import { Router, Request, Response } from 'express';
import { registrarError } from '../log';
import { LimiteIntentos } from '../middleware/limiteIntentos';
import { FirebaseBloqueoError, IngresoNoDisponibleError } from '../repositories/credencialesRepository';
import { ingresoService } from '../services/ingresoService';
import { validarUsername } from '../validation/usuario';

export const authRouter = Router();

export const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos.';
export const limiteIngreso = new LimiteIntentos();
setInterval(() => limiteIngreso.limpiar(), 10 * 60 * 1000).unref();

function demasiadosIntentos(res: Response, minutos: number) {
  res.status(429).json({
    error: `Hiciste demasiados intentos. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} e intenta de nuevo.`,
    codigo: 'DEMASIADOS_INTENTOS',
  });
}

/**
 * Público: ingresar con @usuario y contraseña (issue #9).
 * Responde un token personalizado de Firebase; el frontend inicia sesión con
 * signInWithCustomToken(auth, token). Nunca devuelve el correo de nadie.
 */
authRouter.post('/ingresar', async (req: Request, res: Response) => {
  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const usuario = typeof body.usuario === 'string' ? body.usuario.trim().replace(/^@/, '') : '';
  const contrasena = typeof body.contrasena === 'string' ? body.contrasena : '';

  if (usuario === '' || contrasena === '') {
    res.status(400).json({
      error: 'Escribe tu usuario y tu contraseña.',
      errores: {
        ...(usuario === '' ? { usuario: 'Escribe tu @usuario.' } : {}),
        ...(contrasena === '' ? { contrasena: 'Escribe tu contraseña.' } : {}),
      },
    });
    return;
  }

  const ip = req.ip ?? 'desconocida';
  const minutos = limiteIngreso.minutosBloqueado(ip, usuario);
  if (minutos > 0) {
    demasiadosIntentos(res, minutos);
    return;
  }

  // Un @usuario con formato inválido no puede existir: mismo error que uno inexistente.
  if (validarUsername(usuario)) {
    limiteIngreso.registrarFallo(ip, usuario);
    res.status(401).json({ error: MENSAJE_CREDENCIALES, codigo: 'CREDENCIALES_INVALIDAS' });
    return;
  }

  try {
    const resultado = await ingresoService.ingresarConUsuario(usuario, contrasena);
    if (!resultado) {
      limiteIngreso.registrarFallo(ip, usuario);
      res.status(401).json({ error: MENSAJE_CREDENCIALES, codigo: 'CREDENCIALES_INVALIDAS' });
      return;
    }
    limiteIngreso.registrarExito(ip, usuario);
    res.status(200).json(resultado);
  } catch (error) {
    if (error instanceof FirebaseBloqueoError) {
      demasiadosIntentos(res, 15);
      return;
    }
    registrarError('ingresar-usuario', error);
    if (error instanceof IngresoNoDisponibleError) {
      res.status(503).json({ error: 'Por ahora solo puedes ingresar con tu correo. Intenta más tarde con tu @usuario.' });
      return;
    }
    res.status(503).json({ error: 'No pudimos iniciar tu sesión. Intenta de nuevo.' });
  }
});
