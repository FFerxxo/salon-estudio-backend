# Salón de Estudio Colaborativo en Tiempo Real — API (`salon-estudio-backend`)

API REST en **Node.js + TypeScript + Express** conectada a **Cloud Firestore** (Firebase Admin SDK) y documentada con **Swagger** (`/docs`).

## Arquitectura por capas

```text
src/
  repositories/   # Acceso a datos (única capa que usa Firebase Admin / Firestore)
  services/       # Lógica de negocio
  routes/         # Definición de endpoints Express
  swagger.ts      # Especificación OpenAPI 3.0 servida en /docs
  app.ts          # Configuración de Express, CORS y rutas
  server.ts       # Punto de entrada HTTP
```

## Variables de entorno y despliegue

Copia `.env.example` a `.env` y completa los valores (nunca subas `.env` ni llaves privadas al repositorio):

```bash
cp .env.example .env
```

Variables requeridas:
- `PORT`: Puerto del servidor (ej. `3000`).
- `FRONTEND_URL`: Origen permitido por CORS (ej. `http://localhost:5173` o dominio de producción en Vercel).
- `FIREBASE_PROJECT_ID`: ID del proyecto en Firebase.
- `FIREBASE_CLIENT_EMAIL`: Correo de la cuenta de servicio de Firebase Admin.
- `FIREBASE_PRIVATE_KEY`: Llave privada de la cuenta de servicio de Firebase Admin.

### Variables por plataforma de despliegue en producción

- **En Render (Web Service Docker):**
  - Configurar en el panel de variables de entorno: `PORT`, `FRONTEND_URL` (con la URL de Vercel), `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
- **En Vercel (Frontend):**
  - Configurar en el panel de variables de entorno: `VITE_API_URL` (con la URL pública del Web Service en Render).

## Requisitos y ejecución local directa

```bash
npm install
npm run lint
npm run build
npm test
npm start
```

## Ejecución con Docker y Docker Compose

### Estructura lado a lado

El proyecto requiere que ambos repositorios estén clonados lado a lado:

```text
Mini Proyecto 2/
  salon-estudio-backend/
  salon-estudio-frontend/
```

### 1. Construcción individual de la API con Docker

```bash
docker build -t salon-estudio-backend .
docker run -p 3000:3000 --env-file .env salon-estudio-backend
```

### 2. Levantar API y Frontend con Docker Compose

Desde la carpeta `salon-estudio-backend`, ejecuta:

```bash
docker compose up --build
```

Esto compilará y levantará:
- **`api`:** disponible en `http://localhost:3000` (`/api/health`, `/api/app-info`, `/docs`).
- **`frontend`:** disponible en `http://localhost:5173` servido a través de Nginx.

## Endpoints iniciales (Sprint 0 — TS-00)

- `GET /api/health` — Estado del servicio (`200 OK`).
- `GET /api/app-info` — Lee el documento `config/app` desde Firestore (`200 OK` o `503 Service Unavailable` si Firestore falla o no hay credenciales).
- `GET /docs` — Documentación interactiva Swagger UI (incluye los endpoints de usuarios del Sprint 1).

## Usuarios y autenticación (Sprint 1 — TS-01)

La autenticación la hace **Firebase Authentication** (correo y contraseña, y Google) en el frontend. El frontend envía el **ID token** de Firebase en cada petición privada:

```
Authorization: Bearer <ID token>
```

La API lo verifica con Firebase Admin SDK (`src/middleware/auth.ts`). Sin token, o con un token inválido o vencido, responde **401**.

| Método | Ruta | Sesión | Qué hace |
|---|---|---|---|
| `GET` | `/api/usuarios/disponible?username=ana_perez` | No | `{ "disponible": true }` mientras la persona escribe |
| `GET` | `/api/usuarios/me` | Sí | Perfil del usuario. **404** con `codigo: "PERFIL_INCOMPLETO"` si aún no eligió nombre de usuario (flujo de Google) |
| `POST` | `/api/usuarios` | Sí | Crea el perfil: `{ nombres, apellidos, username, avatarUrl? }`. **400** con un error por campo, **409** si el nombre de usuario está ocupado |

**Firestore:**
- `users/{uid}`: perfil (`nombres`, `apellidos`, `username`, `email`, `avatarUrl`, `proveedor`, `creadoEn`).
- `usernames/{username en minúsculas}`: `{ uid }`. Se escribe en la **misma transacción** que el perfil, así que dos personas nunca se quedan con el mismo nombre de usuario.
- El correo y el proveedor se toman del token, no del formulario.

**Reglas de seguridad:** `firestore.rules` niega todo acceso directo desde el navegador; solo la API (Admin SDK) lee y escribe. Se publican en Firebase Console → Firestore → Reglas.

**Flujo esperado del frontend:**
1. Registro manual: `createUserWithEmailAndPassword` → `POST /api/usuarios` con el token.
2. Google: `signInWithPopup` → `GET /api/usuarios/me`. Si responde 404 `PERFIL_INCOMPLETO`, ir a **Elegir nombre de usuario** y luego `POST /api/usuarios`.
3. Rutas privadas: si `GET /api/usuarios/me` responde 401, llevar a **Ingresar**.
