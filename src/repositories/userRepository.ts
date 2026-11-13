import { getDb } from '../config/firebase';

export interface PerfilUsuario {
  uid: string;
  nombres: string;
  apellidos: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  proveedor: string;
  creadoEn: string;
}

export class UsernameOcupadoError extends Error {
  constructor() {
    super('Username already taken');
  }
}

export class PerfilExistenteError extends Error {
  constructor() {
    super('Profile already exists');
  }
}

/**
 * Colecciones en Firestore:
 * - users/{uid}            perfil completo del estudiante
 * - usernames/{username}   reserva del nombre de usuario (en minúsculas) → { uid }
 *
 * La reserva en `usernames` dentro de una transacción garantiza que dos
 * personas no puedan quedarse con el mismo nombre de usuario al mismo tiempo.
 */
export const userRepository = {
  async getPerfil(uid: string): Promise<PerfilUsuario | null> {
    const snap = await getDb().collection('users').doc(uid).get();
    return snap.exists ? (snap.data() as PerfilUsuario) : null;
  },

  async usernameDisponible(username: string): Promise<boolean> {
    const snap = await getDb().collection('usernames').doc(username.toLowerCase()).get();
    return !snap.exists;
  },

  async crearPerfil(perfil: PerfilUsuario): Promise<PerfilUsuario> {
    const db = getDb();
    const userRef = db.collection('users').doc(perfil.uid);
    const usernameRef = db.collection('usernames').doc(perfil.username.toLowerCase());

    await db.runTransaction(async (tx) => {
      const [userSnap, usernameSnap] = await Promise.all([tx.get(userRef), tx.get(usernameRef)]);

      if (userSnap.exists) throw new PerfilExistenteError();
      if (usernameSnap.exists) throw new UsernameOcupadoError();

      tx.set(usernameRef, { uid: perfil.uid });
      tx.set(userRef, perfil);
    });

    return perfil;
  },
};
