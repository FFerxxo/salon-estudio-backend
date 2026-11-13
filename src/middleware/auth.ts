import { NextFunction, Request, Response } from 'express';
import { getAuth } from '../config/firebase';

export interface UsuarioAutenticado {
  uid: string;
  email: string | null;
  nombre: string | null;
  foto: string | null;
  /** 'password' (correo y contraseña) o 'google.com' */
  proveedor: string;
}

export const MENSAJE_SIN_SESION = 'Debes iniciar sesión para continuar.';
export const MENSAJE_SESION_INVALIDA =
  'Tu sesión expiró o no es válida. Vuelve a iniciar sesión.';

/** Verifica el ID token de Firebase. Separado para poder simularlo en las pruebas. */
export const tokenVerifier = {
  async verify(token: string): Promise<UsuarioAutenticado> {
    const decoded = await getAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      nombre: typeof decoded.name === 'string' ? decoded.name : null,
      foto: decoded.picture ?? null,
      proveedor: decoded.firebase.sign_in_provider,
    };
  },
};

/**
 * Protege una ruta privada: exige el encabezado
 * `Authorization: Bearer <ID token de Firebase>`.
 * Sin token o con un token inválido responde 401.
 * Si es válido, deja el usuario en `res.locals.usuario`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const [tipo, token] = (req.headers.authorization ?? '').split(' ');

  if (tipo !== 'Bearer' || !token) {
    res.status(401).json({ error: MENSAJE_SIN_SESION });
    return;
  }

  try {
    res.locals.usuario = await tokenVerifier.verify(token);
    next();
  } catch {
    res.status(401).json({ error: MENSAJE_SESION_INVALIDA });
  }
}
