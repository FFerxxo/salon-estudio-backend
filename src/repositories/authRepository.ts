import { getAuth, getDb } from '../config/firebase';
import { normalizarUsernameIngreso } from '../validation/auth';
import { USERNAME_REGEX } from '../validation/usuario';

export class CorreoOcupadoError extends Error {
  constructor() {
    super('Email already in use');
  }
}

export class CredencialesInvalidasError extends Error {
  constructor() {
    super('Invalid credentials');
  }
}

export class ServicioAuthNoDisponibleError extends Error {
  constructor() {
    super('Authentication service unavailable');
  }
}

export class DemasiadosIntentosError extends Error {
  constructor() {
    super('Too many attempts');
  }
}

export interface CuentaIngreso {
  uid: string;
  email: string;
  proveedor: string;
}

const CODIGOS_CREDENCIALES_INVALIDAS = new Set([
  'INVALID_LOGIN_CREDENTIALS',
  'INVALID_PASSWORD',
  'EMAIL_NOT_FOUND',
  'USER_DISABLED',
]);

function codigoFirebase(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function codigoErrorRest(cuerpo: unknown): string {
  if (typeof cuerpo !== 'object' || cuerpo === null || !('error' in cuerpo)) return '';
  const err = (cuerpo as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null || !('message' in err)) return '';
  return String((err as { message?: unknown }).message ?? '')
    .split(':')[0]
    .trim();
}

/**
 * Operaciones sobre las cuentas de Firebase Authentication (Admin SDK y REST).
 * Separado para poder simularlo en las pruebas.
 */
export const authRepository = {
  /** Busca el correo y proveedor en el servidor a partir del nombre de usuario (US-02). */
  async buscarCuentaPorUsername(username: string): Promise<CuentaIngreso | null> {
    const limpio = normalizarUsernameIngreso(username);
    if (!USERNAME_REGEX.test(limpio)) return null;

    const db = getDb();
    const usernameSnap = await db.collection('usernames').doc(limpio).get();
    if (!usernameSnap.exists) return null;

    const uid = usernameSnap.data()?.uid;
    if (typeof uid !== 'string' || !uid) return null;

    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return null;

    const datos = userSnap.data() as { email?: unknown; proveedor?: unknown } | undefined;
    if (typeof datos?.email !== 'string' || !datos.email) return null;

    return {
      uid,
      email: datos.email,
      proveedor: typeof datos.proveedor === 'string' ? datos.proveedor : '',
    };
  },

  /** Valida la contraseña mediante la API REST de Firebase Auth sin exponer datos al cliente. */
  async verificarPassword(email: string, password: string): Promise<void> {
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) throw new ServicioAuthNoDisponibleError();

    let respuesta: Response;
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`;
      respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      });
    } catch {
      throw new ServicioAuthNoDisponibleError();
    }

    if (respuesta.ok) return;

    const cuerpo = await respuesta.json().catch(() => null);
    const codigo = codigoErrorRest(cuerpo);
    if (codigo.startsWith('TOO_MANY_ATTEMPTS_TRY_LATER')) {
      throw new DemasiadosIntentosError();
    }
    if (CODIGOS_CREDENCIALES_INVALIDAS.has(codigo)) {
      throw new CredencialesInvalidasError();
    }
    throw new ServicioAuthNoDisponibleError();
  },

  /** Emite un custom token para que el frontend inicie sesión con signInWithCustomToken. */
  async crearCustomToken(uid: string): Promise<string> {
    return getAuth().createCustomToken(uid);
  },

  /** Cambia el correo de la cuenta. Firebase rechaza correos que ya usa otra cuenta. */
  async actualizarCorreo(uid: string, email: string): Promise<void> {
    try {
      await getAuth().updateUser(uid, { email });
    } catch (error) {
      if (codigoFirebase(error) === 'auth/email-already-exists') throw new CorreoOcupadoError();
      throw error;
    }
  },

  /** Borra la cuenta. Si ya no existe, no es un error (permite reintentar). */
  async eliminarCuenta(uid: string): Promise<void> {
    try {
      await getAuth().deleteUser(uid);
    } catch (error) {
      if (codigoFirebase(error) === 'auth/user-not-found') return;
      throw error;
    }
  },
};
