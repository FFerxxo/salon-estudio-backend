import { credencialesRepository } from '../repositories/credencialesRepository';
import { userRepository } from '../repositories/userRepository';

/**
 * Ingresar con @usuario y contraseña (issue #9, US-02/US-03).
 *
 * 1. Busca el perfil por nombre de usuario (sin distinguir mayúsculas).
 * 2. Comprueba la contraseña con Firebase Authentication usando el correo del perfil.
 * 3. Devuelve un token personalizado de Firebase para que el frontend inicie sesión.
 *
 * El correo nunca sale de la API. Si el usuario no existe, no tiene contraseña (entró con
 * Google) o la contraseña es incorrecta, devuelve null: la ruta responde el mismo error
 * en todos los casos, así nadie puede averiguar qué nombres de usuario existen.
 */
export const ingresoService = {
  async ingresarConUsuario(username: string, contrasena: string): Promise<{ token: string } | null> {
    const cuenta = await userRepository.buscarPorUsername(username);
    if (!cuenta || !cuenta.email) return null;

    const uid = await credencialesRepository.verificarContrasena(cuenta.email, contrasena);
    if (!uid || uid !== cuenta.uid) return null;

    return { token: await credencialesRepository.crearToken(uid) };
  },
};
