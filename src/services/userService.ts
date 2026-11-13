import { UsuarioAutenticado } from '../middleware/auth';
import { PerfilUsuario, userRepository } from '../repositories/userRepository';
import { DatosPerfil } from '../validation/usuario';

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
};
