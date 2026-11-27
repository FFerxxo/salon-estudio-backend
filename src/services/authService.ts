import { authRepository, CredencialesInvalidasError } from '../repositories/authRepository';
import { normalizarUsernameIngreso } from '../validation/auth';
import { USERNAME_REGEX } from '../validation/usuario';

const EMAIL_FICTICIO = 'usuario-no-registrado@salon-estudio.invalid';

async function verificarPasswordFicticio(password: string): Promise<never> {
  await authRepository.verificarPassword(EMAIL_FICTICIO, password);
  throw new CredencialesInvalidasError();
}

/**
 * Autenticación con nombre de usuario (US-02).
 * Resuelve el correo únicamente en el servidor y nunca lo devuelve al cliente.
 */
export const authService = {
  async ingresarConUsuario(username: string, password: string): Promise<{ customToken: string }> {
    const limpio = normalizarUsernameIngreso(username);
    if (!USERNAME_REGEX.test(limpio)) {
      return verificarPasswordFicticio(password);
    }

    const cuenta = await authRepository.buscarCuentaPorUsername(limpio);
    if (!cuenta || cuenta.proveedor !== 'password' || !cuenta.email) {
      return verificarPasswordFicticio(password);
    }

    await authRepository.verificarPassword(cuenta.email, password);
    const customToken = await authRepository.crearCustomToken(cuenta.uid);
    return { customToken };
  },
};
