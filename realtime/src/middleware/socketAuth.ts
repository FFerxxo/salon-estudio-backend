import type { Socket } from 'socket.io';
import { getAuth } from '../config/firebase';
import { perfilRepository } from '../repositories/perfilRepository';

export interface UsuarioSocket {
  uid: string;
  username: string;
  avatarUrl: string | null;
}

/** Datos que el servidor guarda en cada socket después del handshake. */
export interface DatosSocket {
  usuario: UsuarioSocket;
}

/** Verifica el ID token de Firebase. Separado para poder simularlo en las pruebas. */
export const tokenVerifier = {
  async verify(token: string): Promise<{ uid: string }> {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  },
};

/** Crea un error de conexión que el cliente recibe en `connect_error` (err.message y err.data). */
function errorConexion(codigo: string, mensaje: string): Error {
  return Object.assign(new Error(codigo), { data: { codigo, mensaje } });
}

/**
 * Handshake autenticado (TS-02): el cliente se conecta con
 * `io(URL, { auth: { token: <ID token de Firebase> } })`.
 * Sin token, con token inválido o sin perfil, la conexión se rechaza.
 */
export async function autenticarSocket(socket: Socket, next: (err?: Error) => void) {
  const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;

  if (typeof token !== 'string' || token === '') {
    next(errorConexion('NO_AUTENTICADO', 'Debes iniciar sesión para continuar.'));
    return;
  }

  let uid: string;
  try {
    ({ uid } = await tokenVerifier.verify(token));
  } catch {
    next(
      errorConexion('SESION_INVALIDA', 'Tu sesión expiró o no es válida. Vuelve a iniciar sesión.')
    );
    return;
  }

  try {
    const perfil = await perfilRepository.obtener(uid);
    if (!perfil) {
      next(errorConexion('PERFIL_INCOMPLETO', 'Aún no has elegido tu nombre de usuario.'));
      return;
    }
    (socket.data as DatosSocket).usuario = {
      uid,
      username: perfil.username,
      avatarUrl: perfil.avatarUrl,
    };
    next();
  } catch {
    next(errorConexion('ERROR_SERVIDOR', 'No pudimos conectarte. Intenta de nuevo.'));
  }
}
