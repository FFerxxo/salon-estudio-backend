import * as admin from 'firebase-admin';

/**
 * Inicializa Firebase Admin una sola vez con las variables de entorno
 * y la reutiliza en toda la API (Firestore y Authentication).
 */
export function getFirebaseApp(): admin.app.App {
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

  return admin.app();
}

export function getDb(): admin.firestore.Firestore {
  return getFirebaseApp().firestore();
}

export function getAuth(): admin.auth.Auth {
  return getFirebaseApp().auth();
}
