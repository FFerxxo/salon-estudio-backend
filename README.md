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
- **En Render, servicio de tiempo real (otro Web Service Docker del mismo repositorio, Root Directory `realtime`):**
  - `FRONTEND_URL` y las mismas tres `FIREBASE_*`. Health Check Path: `/health`.
- **En Vercel (Frontend):**
  - Configurar en el panel de variables de entorno: `VITE_API_URL` (con la URL pública del Web Service en Render) y `VITE_REALTIME_URL` (URL del servidor de tiempo real).

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

El sistema tiene tres servicios independientes, cada uno con su Dockerfile y su despliegue:

- **API:** raíz de este repositorio.
- **Tiempo real (Socket.IO):** carpeta `realtime/` de este repositorio (Sprint 2, TS-02). Tiene su propio `package.json` y `Dockerfile`; ver `realtime/README.md`.
- **Frontend:** repositorio `salon-estudio-frontend`.

Para levantarlos juntos, clona el frontend al lado de este repositorio:

```text
Mini Proyecto 2/
  salon-estudio-backend/    # API + realtime/ (tiene el docker-compose.yml)
  salon-estudio-frontend/   # React + Vite, servido con Nginx
```

### 1. Construcción individual de la API con Docker

```bash
docker build -t salon-estudio-backend .
docker run -p 3000:3000 --env-file .env salon-estudio-backend
```

### 2. Levantar todo el sistema con Docker Compose

Desde la carpeta `salon-estudio-backend`, ejecuta:

```bash
docker compose up --build
```

Esto compilará y levantará:
- **`api`:** disponible en `http://localhost:3000` (`/api/health`, `/api/app-info`, `/docs`).
- **`realtime`:** disponible en `http://localhost:4000` (`/health` y Socket.IO).
- **`frontend`:** disponible en `http://localhost:5173` servido a través de Nginx.

Las claves se leen del archivo `.env` (copiado de `.env.example`), que nunca se sube al repositorio.

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

## Perfil y salas (Sprint 2 — US-04, US-05, US-06)

Todas estas rutas piden `Authorization: Bearer <ID token>`. El usuario siempre sale del token: nadie puede editar el perfil ni las salas de otra persona.

| Método | Ruta | Qué hace |
|---|---|---|
| `PATCH` | `/api/usuarios/me` | Edita el perfil propio (solo los campos enviados). **409** si el nombre de usuario o el correo ya existen. El correo solo se cambia en cuentas de correo y contraseña, y se actualiza también en Firebase Authentication |
| `DELETE` | `/api/usuarios/me` | Elimina la cuenta: salas propias con sus mensajes, perfil, nombre de usuario (queda libre) y cuenta de Firebase Authentication |
| `POST` | `/api/salas` | Crea una sala: `{ nombre (3 a 50), ambiente?: "ninguno" \| "blue" \| "green" }`. Devuelve un **ID único de 8 caracteres** |
| `GET` | `/api/salas/mias` | `{ salas: [...] }` del usuario, la más reciente primero (lista vacía si no tiene) |
| `GET` | `/api/salas/:id` | Datos de la sala. **404** `SALA_NO_ENCONTRADA` si no existe |
| `PATCH` | `/api/salas/:id` | Edita nombre o ambiente. **403** si no es el anfitrión |
| `DELETE` | `/api/salas/:id` | Elimina la sala y sus mensajes. **403** si no es el anfitrión |

**Firestore:** `rooms/{id}` (`nombre`, `ambiente`, `anfitrionUid`, `anfitrionUsername`, `creadaEn`) y `rooms/{id}/messages/{id}` (los escribe el servidor de tiempo real). Detalle en `realtime/docs/EVENTOS.md`.

**Política de eliminación de cuenta:** se borra todo lo de la persona menos los mensajes que escribió en salas de otras personas, para no romper esas conversaciones. Primero se borra Firestore y al final la cuenta de Firebase Authentication; si algo falla a mitad, se puede repetir sin error.

**Pruebas:** `npm test` corre 77 pruebas (perfil, eliminar cuenta, salas, permisos y Swagger), incluidas pruebas de las transacciones de Firestore con una base en memoria.
