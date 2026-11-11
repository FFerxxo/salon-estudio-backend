import { getDb } from '../config/firebase';

export interface AppInfo {
  nombre: string;
  mensaje: string;
}

export const appInfoRepository = {
  async getAppInfo(): Promise<AppInfo> {
    const db = getDb();
    const docSnap = await db.collection('config').doc('app').get();

    if (!docSnap.exists) {
      throw new Error('Document config/app does not exist in Firestore');
    }

    const data = docSnap.data();
    return {
      nombre: typeof data?.nombre === 'string' ? data.nombre : 'Salón de Estudio',
      mensaje: typeof data?.mensaje === 'string' ? data.mensaje : 'Bienvenido',
    };
  },
};
