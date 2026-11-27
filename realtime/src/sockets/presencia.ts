export interface Participante {
  socketId: string;
  uid: string;
  username: string;
  avatarUrl: string | null;
  microfono: boolean;
  camara: boolean;
}

/**
 * Quién está conectado en cada sala, en memoria (se reconstruye sola cuando
 * los clientes se vuelven a conectar). Una persona con dos pestañas cuenta como
 * dos participantes porque cada pestaña tendrá su propia conexión de video.
 */
export class Presencia {
  private salas = new Map<string, Map<string, Participante>>();

  agregar(salaId: string, participante: Participante) {
    if (!this.salas.has(salaId)) this.salas.set(salaId, new Map());
    this.salas.get(salaId)?.set(participante.socketId, participante);
  }

  quitar(salaId: string, socketId: string): Participante | undefined {
    const sala = this.salas.get(salaId);
    const participante = sala?.get(socketId);
    sala?.delete(socketId);
    if (sala && sala.size === 0) this.salas.delete(salaId);
    return participante;
  }

  actualizar(
    salaId: string,
    socketId: string,
    estado: Pick<Participante, 'microfono' | 'camara'>
  ): Participante | undefined {
    const participante = this.salas.get(salaId)?.get(socketId);
    if (participante) Object.assign(participante, estado);
    return participante;
  }

  listar(salaId: string): Participante[] {
    return [...(this.salas.get(salaId)?.values() ?? [])];
  }

  /** Salas en las que está un socket (para limpiarlo al desconectarse). */
  salasDe(socketId: string): string[] {
    return [...this.salas.entries()].filter(([, s]) => s.has(socketId)).map(([id]) => id);
  }

  /** Limpia toda la presencia de una sala cuando se elimina en Firestore. */
  vaciarSala(salaId: string) {
    this.salas.delete(salaId);
  }
}
