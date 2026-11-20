import { UsuarioAutenticado } from '../middleware/auth';
import { authRepository } from '../repositories/authRepository';
import {
  PerfilNoEncontradoError,
  PerfilUsuario,
  userRepository,
} from '../repositories/userRepository';
import { DatosEdicion, DatosPerfil } from '../validation/usuario';

export const userService = {
  obtenerPerfil(uid: string): Promise<PerfilUsuario | null> {
    return userRepository.getPerfil(uid);
  },

  usernameDisponible(username: string): Promise<boolean> {
    return userRepository.usernameDisponible(username.trim());
  },

  /**
   * Crea el perfil del usuario que inició sesión.
   * El correo y el proveedor salen del token de Firebase, no del formulario.
   * Si viene de Google y no envía avatar, se usa la foto de Google.
   */
  crearPerfil(usuario: UsuarioAutenticado, datos: DatosPerfil): Promise<PerfilUsuario> {
    return userRepository.crearPerfil({
      uid: usuario.uid,
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      username: datos.username,
      email: usuario.email ?? '',
      avatarUrl: datos.avatarUrl ?? usuario.foto,
      proveedor: usuario.proveedor,
      creadoEn: new Date().toISOString(),
    });
  },

  /**
   * Edita el perfil del usuario que inició sesión (nunca el de otra persona: el uid sale del token).
   * Si cambia el correo, primero se cambia en Firebase Authentication (rechaza correos repetidos)
   * y luego en Firestore; si Firestore falla, se devuelve el correo anterior.
   */
  async actualizarPerfil(usuario: UsuarioAutenticado, datos: DatosEdicion): Promise<PerfilUsuario> {
    const actual = await userRepository.getPerfil(usuario.uid);
    if (!actual) throw new PerfilNoEncontradoError();

    const cambios = { ...datos };
    const cambiaCorreo = cambios.email !== undefined && cambios.email !== actual.email.toLowerCase();
    if (!cambiaCorreo) delete cambios.email;

    if (cambiaCorreo) await authRepository.actualizarCorreo(usuario.uid, cambios.email as string);

    try {
      return await userRepository.actualizarPerfil(usuario.uid, cambios);
    } catch (error) {
      if (cambiaCorreo) {
        await authRepository.actualizarCorreo(usuario.uid, actual.email).catch(() => undefined);
      }
      throw error;
    }
  },

  /**
   * Elimina la cuenta del usuario que inició sesión (US-05).
   * Primero Firestore (salas, perfil y nombre de usuario) y al final Firebase Authentication.
   * Si algo falla a mitad, se puede volver a llamar: cada paso tolera que ya esté hecho.
   */
  async eliminarCuenta(usuario: UsuarioAutenticado): Promise<{ salasEliminadas: number }> {
    const resultado = await userRepository.eliminarDatos(usuario.uid);
    await authRepository.eliminarCuenta(usuario.uid);
    return resultado;
  },
};
