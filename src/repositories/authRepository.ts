import { getAuth } from '../config/firebase';

export class CorreoOcupadoError extends Error {
  constructor() {
    super('Email already in use');
  }
}

function codigoFirebase(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * Operaciones sobre las cuentas de Firebase Authentication (Admin SDK).
 * Separado para poder simularlo en las pruebas.
 */
export const authRepository = {
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
