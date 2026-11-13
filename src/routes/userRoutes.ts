import { Router, Request, Response } from 'express';
import { requireAuth, UsuarioAutenticado } from '../middleware/auth';
import { PerfilExistenteError, UsernameOcupadoError } from '../repositories/userRepository';
import { userService } from '../services/userService';
import { validarPerfil, validarUsername } from '../validation/usuario';

export const userRouter = Router();

const ERROR_BD = 'No se pudo conectar con la base de datos. Intenta de nuevo.';
export const MENSAJE_USERNAME_OCUPADO = 'Ese nombre de usuario ya está en uso. Prueba con otro.';

/** Público: el formulario lo usa para avisar mientras la persona escribe. */
userRouter.get('/disponible', async (req: Request, res: Response) => {
  const username = req.query.username;
  const error = validarUsername(username);
  if (error) {
    res.status(400).json({ disponible: false, error });
    return;
  }

  try {
    const disponible = await userService.usernameDisponible(username as string);
    res.status(200).json({ disponible });
  } catch {
    res.status(503).json({ error: ERROR_BD });
  }
});

/** Privado: perfil del usuario que inició sesión. 404 = aún no eligió nombre de usuario. */
userRouter.get('/me', requireAuth, async (_req: Request, res: Response) => {
  const usuario = res.locals.usuario as UsuarioAutenticado;

  try {
    const perfil = await userService.obtenerPerfil(usuario.uid);
    if (!perfil) {
      res.status(404).json({
        error: 'Aún no has elegido tu nombre de usuario.',
        codigo: 'PERFIL_INCOMPLETO',
      });
      return;
    }
    res.status(200).json(perfil);
  } catch {
    res.status(503).json({ error: ERROR_BD });
  }
});

/** Privado: crea el perfil (registro manual o tras «Continuar con Google»). */
userRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const usuario = res.locals.usuario as UsuarioAutenticado;
  const resultado = validarPerfil(req.body);

  if (!resultado.ok) {
    res.status(400).json({ error: 'Revisa los campos marcados.', errores: resultado.errores });
    return;
  }

  try {
    const perfil = await userService.crearPerfil(usuario, resultado.datos);
    res.status(201).json(perfil);
  } catch (error) {
    if (error instanceof UsernameOcupadoError) {
      res.status(409).json({
        error: MENSAJE_USERNAME_OCUPADO,
        errores: { username: MENSAJE_USERNAME_OCUPADO },
      });
      return;
    }
    if (error instanceof PerfilExistenteError) {
      res.status(409).json({ error: 'Tu cuenta ya tiene un perfil creado.' });
      return;
    }
    res.status(503).json({ error: ERROR_BD });
  }
});
