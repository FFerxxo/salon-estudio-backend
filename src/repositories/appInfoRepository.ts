import * as admin from 'firebase-admin';

export interface AppInfo {
  nombre: string;
  mensaje: string;
}

function getFirestoreDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Firebase Admin environment variables');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return admin.firestore();
}

export const appInfoRepository = {
  async getAppInfo(): Promise<AppInfo> {
    const db = getFirestoreDb();
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
