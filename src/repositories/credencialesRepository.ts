import { getAuth } from '../config/firebase';

/** Falta FIREBASE_WEB_API_KEY: no se puede comprobar la contraseña. */
export class IngresoNoDisponibleError extends Error {
  constructor() {
    super('Password sign-in is not configured');
  }
}

/** Firebase bloqueó temporalmente la cuenta por demasiados intentos. */
export class FirebaseBloqueoError extends Error {
  constructor() {
    super('Too many attempts');
  }
}

const URL_IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

/** Errores de Firebase que significan «correo o contraseña incorrectos» (o cuenta sin contraseña). */
const CREDENCIALES_INVALIDAS = new Set([
  'INVALID_LOGIN_CREDENTIALS',
  'INVALID_PASSWORD',
  'EMAIL_NOT_FOUND',
  'USER_DISABLED',
  'INVALID_EMAIL',
  'MISSING_PASSWORD',
]);

/**
 * Comprobación de contraseña e inicio de sesión con token personalizado.
 * Separado para poder simularlo en las pruebas.
 */
export const credencialesRepository = {
  /**
   * Comprueba la contraseña con Firebase Authentication (API REST de Identity Toolkit).
   * Devuelve el uid de la cuenta si es correcta, o null si no lo es.
   */
  async verificarContrasena(email: string, contrasena: string): Promise<string | null> {
    const clave = process.env.FIREBASE_WEB_API_KEY;
    if (!clave) throw new IngresoNoDisponibleError();

    const respuesta = await fetch(`${URL_IDENTITY}?key=${encodeURIComponent(clave)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: contrasena, returnSecureToken: false }),
    });

    const cuerpo = (await respuesta.json().catch(() => ({}))) as {
      localId?: string;
      error?: { message?: string };
    };
    if (respuesta.ok && cuerpo.localId) return cuerpo.localId;

    // Firebase puede agregar detalles después de « : », por ejemplo «TOO_MANY_ATTEMPTS_TRY_LATER : ...».
    const codigo = (cuerpo.error?.message ?? '').split(' ')[0];
    if (codigo === 'TOO_MANY_ATTEMPTS_TRY_LATER') throw new FirebaseBloqueoError();
    if (CREDENCIALES_INVALIDAS.has(codigo)) return null;
    throw Object.assign(new Error('Identity Toolkit error'), { code: codigo || respuesta.status });
  },

  /** Token personalizado para que el frontend inicie sesión con signInWithCustomToken. */
  crearToken(uid: string): Promise<string> {
    return getAuth().createCustomToken(uid);
  },
};
