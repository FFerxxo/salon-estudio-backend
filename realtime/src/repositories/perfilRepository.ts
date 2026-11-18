import { getDb } from '../config/firebase';

export interface PerfilBasico {
  username: string;
  avatarUrl: string | null;
}

/** Lee el perfil (users/{uid}) que crea la API. El servidor de tiempo real solo lo lee. */
export const perfilRepository = {
  async obtener(uid: string): Promise<PerfilBasico | null> {
    const snap = await getDb().collection('users').doc(uid).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    return {
      username: String(data.username),
      avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
    };
  },
};
