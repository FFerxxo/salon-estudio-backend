import { authRepository, CredencialesInvalidasError } from '../repositories/authRepository';

/**
 * Autenticación con nombre de usuario (US-02).
 * Resuelve el correo únicamente en el servidor y nunca lo devuelve al cliente.
 */
export const authService = {
  async ingresarConUsuario(username: string, password: string): Promise<{ customToken: string }> {
    const cuenta = await authRepository.buscarCuentaPorUsername(username);
    if (!cuenta || cuenta.proveedor !== 'password') {
      throw new CredencialesInvalidasError();
    }

    await authRepository.verificarPassword(cuenta.email, password);
    const customToken = await authRepository.crearCustomToken(cuenta.uid);
    return { customToken };
  },
};
