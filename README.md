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

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores (nunca subas `.env` ni llaves privadas al repositorio):

```bash
cp .env.example .env
```

Variables requeridas:
- `PORT`: Puerto del servidor (ej. `3000`).
- `FRONTEND_URL`: Origen permitido por CORS (ej. `http://localhost:5173` o dominio de Vercel).
- `FIREBASE_PROJECT_ID`: ID del proyecto en Firebase.
- `FIREBASE_CLIENT_EMAIL`: Correo de la cuenta de servicio de Firebase Admin.
- `FIREBASE_PRIVATE_KEY`: Llave privada de la cuenta de servicio de Firebase Admin.

## Requisitos y ejecución local

```bash
npm install
npm run lint
npm run build
npm test
npm start
```

## Endpoints iniciales (Sprint 0 — TS-00)

- `GET /api/health` — Estado del servicio (`200 OK`).
- `GET /api/app-info` — Lee el documento `config/app` desde Firestore (`200 OK` o `503 Service Unavailable` si Firestore falla).
- `GET /docs` — Documentación interactiva Swagger UI.
