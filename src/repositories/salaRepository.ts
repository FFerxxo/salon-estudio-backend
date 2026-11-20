import { randomInt } from 'node:crypto';
import { getDb } from '../config/firebase';
import { ALFABETO_ID_SALA, Ambiente, LARGO_ID_SALA } from '../validation/sala';

export interface Sala {
  id: string;
  nombre: string;
  ambiente: Ambiente;
  anfitrionUid: string;
  anfitrionUsername: string;
  creadaEn: string;
  actualizadaEn?: string;
}

export class IdSalaAgotadoError extends Error {
  constructor() {
    super('Could not generate a unique room id');
  }
}

/** Código de Firestore cuando el documento ya existe (ALREADY_EXISTS). */
const YA_EXISTE = 6;
const INTENTOS_ID = 5;

export function generarIdSala(): string {
  let id = '';
  for (let i = 0; i < LARGO_ID_SALA; i++) id += ALFABETO_ID_SALA[randomInt(ALFABETO_ID_SALA.length)];
  return id;
}

/**
 * Colección rooms/{id} en Firestore. Los mensajes del chat van en la
 * subcolección rooms/{id}/messages (los escribe el servidor de tiempo real).
 */
export const salaRepository = {
  /**
   * Crea la sala con un ID único. `create` falla si el ID ya existe,
   * así que dos salas nunca comparten ID; en ese caso se prueba con otro.
   */
  async crear(datos: Omit<Sala, 'id'>, generarId: () => string = generarIdSala): Promise<Sala> {
    const rooms = getDb().collection('rooms');

    for (let intento = 0; intento < INTENTOS_ID; intento++) {
      const id = generarId();
      try {
        await rooms.doc(id).create({ ...datos });
        return { id, ...datos };
      } catch (error) {
        if ((error as { code?: unknown }).code !== YA_EXISTE) throw error;
      }
    }
    throw new IdSalaAgotadoError();
  },

  async obtener(id: string): Promise<Sala | null> {
    const snap = await getDb().collection('rooms').doc(id).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() } as Sala) : null;
  },

  /** Salas donde el usuario es anfitrión, de la más reciente a la más antigua. */
  async listarDeAnfitrion(uid: string): Promise<Sala[]> {
    const snap = await getDb().collection('rooms').where('anfitrionUid', '==', uid).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Sala)
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  },

  async actualizar(id: string, cambios: Partial<Pick<Sala, 'nombre' | 'ambiente'>>): Promise<void> {
    await getDb()
      .collection('rooms')
      .doc(id)
      .update({ ...cambios, actualizadaEn: new Date().toISOString() });
  },

  /** Borra la sala y todos sus mensajes. */
  async eliminar(id: string): Promise<void> {
    const db = getDb();
    await db.recursiveDelete(db.collection('rooms').doc(id));
  },
};
