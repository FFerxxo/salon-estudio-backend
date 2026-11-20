import { getDb } from '../config/firebase';

export interface SalaBasica {
  id: string;
  nombre: string;
  ambiente: string;
  anfitrionUid: string;
}

export interface Mensaje {
  id: string;
  salaId: string;
  autorUid: string;
  autorUsername: string;
  texto: string;
  creadoEn: string;
}

/**
 * Modelo en Firestore (lo comparte con la API):
 * - rooms/{salaId}                  la sala (la crea la API con POST /api/salas)
 * - rooms/{salaId}/messages/{id}    cada mensaje del chat (lo escribe este servidor)
 */
export const salaRepository = {
  async obtener(salaId: string): Promise<SalaBasica | null> {
    const snap = await getDb().collection('rooms').doc(salaId).get();
    if (!snap.exists) return null;
    const d = snap.data() ?? {};
    return {
      id: snap.id,
      nombre: String(d.nombre),
      ambiente: String(d.ambiente ?? 'ninguno'),
      anfitrionUid: String(d.anfitrionUid),
    };
  },

  async guardarMensaje(datos: Omit<Mensaje, 'id'>): Promise<Mensaje> {
    const { salaId, ...resto } = datos;
    const ref = getDb().collection('rooms').doc(salaId).collection('messages').doc();
    await ref.set({ ...resto });
    return { id: ref.id, ...datos };
  },

  /**
   * Últimos `limite` mensajes en orden cronológico (del más viejo al más nuevo).
   * Con `antesDe` (fecha ISO del mensaje más viejo que ya tiene el cliente) trae la página anterior.
   */
  async historial(
    salaId: string,
    limite: number,
    antesDe?: string
  ): Promise<{ mensajes: Mensaje[]; hayMas: boolean }> {
    let consulta = getDb()
      .collection('rooms')
      .doc(salaId)
      .collection('messages')
      .orderBy('creadoEn', 'desc');
    if (antesDe) consulta = consulta.where('creadoEn', '<', antesDe);

    const snap = await consulta.limit(limite + 1).get();
    const docs = snap.docs.slice(0, limite);
    const mensajes = docs
      .map((d) => ({ id: d.id, salaId, ...d.data() }) as Mensaje)
      .reverse();
    return { mensajes, hayMas: snap.docs.length > limite };
  },
};
