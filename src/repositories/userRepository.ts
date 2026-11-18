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
  actualizadoEn?: string;
}

/** Campos que el usuario puede cambiar con PATCH /api/usuarios/me. */
export type CambiosPerfil = Partial<
  Pick<PerfilUsuario, 'nombres' | 'apellidos' | 'username' | 'email' | 'avatarUrl'>
>;

export class PerfilNoEncontradoError extends Error {
  constructor() {
    super('Profile not found');
  }
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

  /**
   * Actualiza el perfil. Si cambia el nombre de usuario, en la MISMA transacción
   * reserva el nuevo y libera el anterior, así nunca quedan dos personas con el mismo.
   */
  async actualizarPerfil(uid: string, cambios: CambiosPerfil): Promise<PerfilUsuario> {
    const db = getDb();
    const userRef = db.collection('users').doc(uid);

    return db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new PerfilNoEncontradoError();
      const actual = userSnap.data() as PerfilUsuario;

      const nuevoUsername = cambios.username;
      const cambiaReserva =
        nuevoUsername !== undefined && nuevoUsername.toLowerCase() !== actual.username.toLowerCase();

      if (cambiaReserva) {
        const nuevoRef = db.collection('usernames').doc(nuevoUsername.toLowerCase());
        const nuevoSnap = await tx.get(nuevoRef);
        if (nuevoSnap.exists && nuevoSnap.data()?.uid !== uid) throw new UsernameOcupadoError();

        tx.delete(db.collection('usernames').doc(actual.username.toLowerCase()));
        tx.set(nuevoRef, { uid });
      }

      const actualizado: PerfilUsuario = {
        ...actual,
        ...cambios,
        actualizadoEn: new Date().toISOString(),
      };
      tx.set(userRef, actualizado);
      return actualizado;
    });
  },
};
