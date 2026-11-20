import { Router, Request, Response } from 'express';
import { requireAuth, UsuarioAutenticado } from '../middleware/auth';
import { PerfilNoEncontradoError } from '../repositories/userRepository';
import { NoEsAnfitrionError, SalaNoEncontradaError, salaService } from '../services/salaService';
import { normalizarIdSala, validarEdicionSala, validarNuevaSala } from '../validation/sala';

export const salaRouter = Router();

const ERROR_BD = 'No se pudo conectar con la base de datos. Intenta de nuevo.';
export const MENSAJE_SALA_NO_EXISTE = 'No encontramos una sala con ese ID. Revisa que esté bien escrito.';
export const MENSAJE_NO_ANFITRION = 'Solo quien creó la sala puede cambiarla o eliminarla.';

// Todas las rutas de salas son privadas.
salaRouter.use(requireAuth);

function usuarioDe(res: Response) {
  return res.locals.usuario as UsuarioAutenticado;
}

/** Responde los errores conocidos del servicio; si no es uno de ellos, 503. */
function responderError(res: Response, error: unknown) {
  if (error instanceof SalaNoEncontradaError) {
    res.status(404).json({ error: MENSAJE_SALA_NO_EXISTE, codigo: 'SALA_NO_ENCONTRADA' });
    return;
  }
  if (error instanceof NoEsAnfitrionError) {
    res.status(403).json({ error: MENSAJE_NO_ANFITRION });
    return;
  }
  if (error instanceof PerfilNoEncontradoError) {
    res.status(404).json({
      error: 'Aún no has elegido tu nombre de usuario.',
      codigo: 'PERFIL_INCOMPLETO',
    });
    return;
  }
  res.status(503).json({ error: ERROR_BD });
}

/** US-06: crear sala. El anfitrión es el usuario del token. */
salaRouter.post('/', async (req: Request, res: Response) => {
  const resultado = validarNuevaSala(req.body);
  if (!resultado.ok) {
    res.status(400).json({ error: 'Revisa los campos marcados.', errores: resultado.errores });
    return;
  }

  try {
    const sala = await salaService.crear(usuarioDe(res), resultado.datos);
    res.status(201).json(sala);
  } catch (error) {
    responderError(res, error);
  }
});

/** US-06: salas propias para el panel (lista vacía si no tiene). */
salaRouter.get('/mias', async (_req: Request, res: Response) => {
  try {
    const salas = await salaService.listarMias(usuarioDe(res));
    res.status(200).json({ salas });
  } catch (error) {
    responderError(res, error);
  }
});

/** Datos de una sala por su ID (para entrar a ella). 404 si no existe. */
salaRouter.get('/:id', async (req: Request, res: Response) => {
  const id = normalizarIdSala(req.params.id);
  if (!id) {
    responderError(res, new SalaNoEncontradaError());
    return;
  }

  try {
    res.status(200).json(await salaService.obtener(id));
  } catch (error) {
    responderError(res, error);
  }
});

/** Editar sala: solo el anfitrión (403 si es otra persona). */
salaRouter.patch('/:id', async (req: Request, res: Response) => {
  const id = normalizarIdSala(req.params.id);
  if (!id) {
    responderError(res, new SalaNoEncontradaError());
    return;
  }

  const resultado = validarEdicionSala(req.body);
  if (!resultado.ok) {
    res.status(400).json({
      error: resultado.error ?? 'Revisa los campos marcados.',
      errores: resultado.errores,
    });
    return;
  }

  try {
    res.status(200).json(await salaService.actualizar(usuarioDe(res), id, resultado.datos));
  } catch (error) {
    responderError(res, error);
  }
});

/** Eliminar sala y sus mensajes: solo el anfitrión (403 si es otra persona). */
salaRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = normalizarIdSala(req.params.id);
  if (!id) {
    responderError(res, new SalaNoEncontradaError());
    return;
  }

  try {
    await salaService.eliminar(usuarioDe(res), id);
    res.status(200).json({ mensaje: 'La sala fue eliminada.' });
  } catch (error) {
    responderError(res, error);
  }
});
