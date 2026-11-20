import { UsuarioAutenticado } from '../middleware/auth';
import { Sala, salaRepository } from '../repositories/salaRepository';
import { PerfilNoEncontradoError, userRepository } from '../repositories/userRepository';
import { DatosSala } from '../validation/sala';

export class SalaNoEncontradaError extends Error {
  constructor() {
    super('Room not found');
  }
}

export class NoEsAnfitrionError extends Error {
  constructor() {
    super('Only the host can change this room');
  }
}

export const salaService = {
  /** Crea la sala con el usuario del token como anfitrión. Pide tener perfil (nombre de usuario). */
  async crear(usuario: UsuarioAutenticado, datos: DatosSala): Promise<Sala> {
    const perfil = await userRepository.getPerfil(usuario.uid);
    if (!perfil) throw new PerfilNoEncontradoError();

    return salaRepository.crear({
      nombre: datos.nombre,
      ambiente: datos.ambiente,
      anfitrionUid: usuario.uid,
      anfitrionUsername: perfil.username,
      creadaEn: new Date().toISOString(),
    });
  },

  listarMias(usuario: UsuarioAutenticado): Promise<Sala[]> {
    return salaRepository.listarDeAnfitrion(usuario.uid);
  },

  async obtener(id: string): Promise<Sala> {
    const sala = await salaRepository.obtener(id);
    if (!sala) throw new SalaNoEncontradaError();
    return sala;
  },

  /** Solo el anfitrión puede cambiar su sala. */
  async actualizar(
    usuario: UsuarioAutenticado,
    id: string,
    cambios: Partial<DatosSala>
  ): Promise<Sala> {
    const sala = await this.obtener(id);
    if (sala.anfitrionUid !== usuario.uid) throw new NoEsAnfitrionError();
    await salaRepository.actualizar(id, cambios);
    return { ...sala, ...cambios };
  },

  /** Solo el anfitrión puede eliminar su sala (se borran también sus mensajes). */
  async eliminar(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const sala = await this.obtener(id);
    if (sala.anfitrionUid !== usuario.uid) throw new NoEsAnfitrionError();
    await salaRepository.eliminar(id);
  },
};
