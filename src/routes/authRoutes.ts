import { Router, Request, Response } from 'express';
import { rateLimitIngresoUsuario } from '../middleware/rateLimit';
import { CredencialesInvalidasError } from '../repositories/authRepository';
import { authService } from '../services/authService';
import { validarIngresoUsuario } from '../validation/auth';

export const authRouter = Router();

export const MENSAJE_CREDENCIALES_INVALIDAS = 'Usuario o contraseña incorrectos.';
const MENSAJE_AUTH_NO_DISPONIBLE = 'No se pudo iniciar sesión en este momento. Intenta de nuevo.';

/**
 * Público (US-02): inicia sesión con nombre de usuario (con o sin `@`) y contraseña.
 * Nunca expone el correo electrónico de la cuenta en ninguna respuesta.
 */
authRouter.post('/ingresar-usuario', rateLimitIngresoUsuario, async (req: Request, res: Response) => {
  const resultado = validarIngresoUsuario(req.body);
  if (!resultado.ok) {
    res.status(400).json({ error: 'Revisa los campos marcados.', errores: resultado.errores });
    return;
  }

  try {
    const { customToken } = await authService.ingresarConUsuario(
      resultado.datos.username,
      resultado.datos.password
    );
    res.status(200).json({ customToken });
  } catch (error) {
    if (error instanceof CredencialesInvalidasError) {
      res.status(401).json({ error: MENSAJE_CREDENCIALES_INVALIDAS });
      return;
    }
    res.status(503).json({ error: MENSAJE_AUTH_NO_DISPONIBLE });
  }
});
