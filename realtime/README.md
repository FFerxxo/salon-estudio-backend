# Salón de Estudio Colaborativo en Tiempo Real — Servidor de tiempo real (`realtime/`)

Servidor de WebSockets en **Node.js + TypeScript + Socket.IO**. Vive en la carpeta `realtime/` del repositorio `salon-estudio-backend`, pero es un **servicio independiente** de la API: tiene su propio `package.json`, su propio `Dockerfile` y su propio Web Service en **Render con Docker**. No comparte código con la API; solo usan la misma base de datos (Firestore).

- Solo acepta conexiones con el **ID token de Firebase** (handshake autenticado).
- Cada sala es un *room* de Socket.IO: los mensajes y la presencia de una sala **solo llegan a esa sala**.
- Los mensajes del chat se guardan en **Firestore** (`rooms/{salaId}/messages`).
- La lista de eventos está en [`docs/EVENTOS.md`](docs/EVENTOS.md).

## Estructura

```text
src/
  config/firebase.ts         # Firebase Admin (Auth y Firestore) con variables de entorno
  middleware/socketAuth.ts   # Handshake: verifica el ID token y carga el perfil
  repositories/              # Única capa que usa Firestore (perfiles, salas y mensajes)
  sockets/eventos.ts         # Eventos de salas, chat y presencia
  sockets/presencia.ts       # Quién está conectado en cada sala (en memoria)
  app.ts                     # Servidor HTTP (/health) + Socket.IO
  server.ts                  # Punto de entrada
```

## Variables de entorno

Desde la carpeta `realtime/`, copia `.env.example` a `.env` y completa los valores. **Nunca subas `.env` al repositorio.**

| Variable | Para qué |
|---|---|
| `PORT` | Puerto (por defecto `4000`; Render lo pone solo) |
| `FRONTEND_URL` | Origen permitido por CORS (la URL de Vercel en producción) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | La misma cuenta de servicio que usa la API |

## Ejecutar

```bash
cd realtime
npm install
npm run lint
npm test        # 20 pruebas con un servidor y clientes Socket.IO reales
npm run build
npm start       # o: npm run dev
```

Con Docker:

```bash
docker build -t salon-estudio-realtime .
docker run -p 4000:4000 --env-file .env salon-estudio-realtime
```

Para levantar **todo el sistema** (frontend, API y tiempo real) usa el `docker-compose.yml` de la raíz del repositorio (servicio `realtime`).

## Despliegue en Render

1. **New → Web Service**, conectar el repositorio `salon-estudio-backend`, **Language: Docker**, rama `main`, plan gratuito.
   - **Root Directory:** `realtime` (así Render usa este `Dockerfile` y no el de la API).
2. **Health Check Path:** `/health`.
   - Opcional: en *Build Filters* incluir solo `realtime/**`, para no redesplegar cuando solo cambia la API.
3. Variables de entorno: `FRONTEND_URL` y las tres `FIREBASE_*` (mismos valores que la API).
4. La URL pública (`https://...onrender.com`) va en Vercel como `VITE_REALTIME_URL`.

## Conectarse desde el frontend

```ts
import { io } from 'socket.io-client';

const token = await auth.currentUser!.getIdToken();
const socket = io(import.meta.env.VITE_REALTIME_URL, { auth: { token } });

socket.on('connect_error', (err) => {
  // err.message: NO_AUTENTICADO | SESION_INVALIDA | PERFIL_INCOMPLETO | ERROR_SERVIDOR
  // err.data.mensaje: texto listo para mostrar
});

const r = await socket.emitWithAck('sala:unirse', { salaId: 'K7PQ2XMB' });
```
