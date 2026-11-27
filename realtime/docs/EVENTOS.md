# Eventos de tiempo real (Socket.IO) — TS-02

Servidor: carpeta `realtime/` del repositorio `salon-estudio-backend` (servicio propio en Render). Todos los nombres de eventos y campos están en español.

## 1. Conexión (handshake autenticado)

```ts
io(VITE_REALTIME_URL, { auth: { token: await user.getIdToken() } })
```

El servidor verifica el ID token con Firebase Admin y lee el perfil (`users/{uid}`). El nombre de usuario que se muestra en el chat sale de ahí, **nunca del cliente**.

Si rechaza la conexión, el cliente recibe `connect_error` con:

| `err.message` | `err.data.mensaje` | Qué hacer en el frontend |
|---|---|---|
| `NO_AUTENTICADO` | Debes iniciar sesión para continuar. | Llevar a **Ingresar** |
| `SESION_INVALIDA` | Tu sesión expiró o no es válida. Vuelve a iniciar sesión. | Renovar el token (`getIdToken(true)`) y reconectar; si falla, **Ingresar** |
| `PERFIL_INCOMPLETO` | Aún no has elegido tu nombre de usuario. | Llevar a **Elegir nombre de usuario** |
| `ERROR_SERVIDOR` | No pudimos conectarte. Intenta de nuevo. | Mostrar el mensaje y botón «Reintentar» |

## 2. Del cliente al servidor

Todos responden con *acknowledgement* (`socket.emitWithAck(evento, datos)`):
- Éxito: `{ ok: true, ... }`
- Error: `{ ok: false, codigo, error }` (`error` es un texto listo para mostrar)

| Evento | Datos | Respuesta si `ok` |
|---|---|---|
| `sala:unirse` | `{ salaId }` | `{ sala: { id, nombre, ambiente, anfitrionUid }, esAnfitrion, participantes }` |
| `sala:salir` | `{ salaId }` | `{}` |
| `chat:enviar` | `{ salaId, texto }` (1 a 1000 caracteres) | `{ mensaje }` |
| `chat:historial` | `{ salaId, antesDe? }` | `{ mensajes, hayMas }` — 30 por página, del más viejo al más nuevo. Para cargar los anteriores, enviar `antesDe` = `creadoEn` del mensaje más viejo que ya se muestra |
| `presencia:estado` | `{ salaId, microfono: boolean, camara: boolean }` | `{}` |

Códigos de error: `SALA_NO_ENCONTRADA` (la sala no existe o fue eliminada mientras estaban conectados; en `chat:enviar` y `chat:historial` se valida en memoria desde el listener de `rooms`, sin leer Firestore en cada mensaje ni guardar mensajes en salas eliminadas), `NO_ESTAS_EN_SALA` (intenta usar una sala a la que no entró), `MENSAJE_VACIO`, `MENSAJE_LARGO`, `DATOS_INVALIDOS`, `ERROR_SERVIDOR`.

## 3. Del servidor al cliente

Se envían con `io.to(salaId)`: **solo los reciben los sockets que entraron a esa sala**.

| Evento | Datos | Cuándo |
|---|---|---|
| `sala:participantes` | `{ salaId, participantes }` | Cada vez que alguien entra, sale o se desconecta |
| `sala:participante-entro` | `{ salaId, participante }` | Entró alguien (no le llega al que entró). Útil para el anuncio accesible «Ana entró a la sala» |
| `sala:participante-salio` | `{ salaId, socketId, uid, username }` | Salió o se desconectó alguien |
| `sala:actualizada` | `{ salaId, nombre }` | Cambió el nombre de la sala en Firestore |
| `sala:eliminada` | `{ salaId }` | La sala fue eliminada (desde «Mis salones» o al borrar la cuenta del anfitrión); luego se sacan los sockets de la sala y se limpia la presencia |
| `chat:mensaje` | `mensaje` | Nuevo mensaje (también le llega al que lo envió) |
| `presencia:actualizada` | `{ salaId, socketId, uid, microfono, camara }` | Alguien prendió o apagó micrófono o cámara |

Tipos:

```ts
interface Participante {
  socketId: string;   // una conexión por pestaña (se usará para WebRTC en el Sprint 4)
  uid: string;
  username: string;
  avatarUrl: string | null;
  microfono: boolean;
  camara: boolean;
}

interface Mensaje {
  id: string;
  salaId: string;
  autorUid: string;
  autorUsername: string;
  texto: string;
  creadoEn: string;   // ISO 8601
}
```

## 4. Modelo de datos en Firestore

| Ruta | Quién escribe | Campos |
|---|---|---|
| `rooms/{salaId}` | API (`POST /api/salas`) | `nombre`, `ambiente` (`ninguno`/`blue`/`green`), `anfitrionUid`, `anfitrionUsername`, `creadaEn`, `actualizadaEn?` |
| `rooms/{salaId}/messages/{id}` | Servidor de tiempo real (`chat:enviar`) | `autorUid`, `autorUsername`, `texto`, `creadoEn` |
| `users/{uid}`, `usernames/{username}` | API | Perfiles (Sprint 1) |

Al eliminar una sala o una cuenta, la API borra también los mensajes de esas salas.

## 5. Próximos sprints

- Sprint 3 (US-07, US-10, US-11): avisos en vivo `sala:actualizada` y `sala:eliminada`, y rechazo de `chat:enviar` / `chat:historial` con `SALA_NO_ENCONTRADA` cuando la sala ya no existe.
- Sprint 4 (TS-03): se agregan los eventos de señalización WebRTC (`webrtc:oferta`, `webrtc:respuesta`, `webrtc:candidato`) usando el `socketId` de cada participante.
