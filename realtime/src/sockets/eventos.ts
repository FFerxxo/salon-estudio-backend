import type { Server, Socket } from 'socket.io';
import type { DatosSocket } from '../middleware/socketAuth';
import { type CambioSala, salaRepository } from '../repositories/salaRepository';
import { Presencia } from './presencia';

export const LARGO_MAXIMO_MENSAJE = 1000;
export const MENSAJES_POR_PAGINA = 30;
const ID_SALA_REGEX = /^[A-Z0-9]{8}$/;

type Ack = (respuesta: Record<string, unknown>) => void;

const ERRORES = {
  DATOS_INVALIDOS: 'La solicitud no es válida.',
  SALA_NO_ENCONTRADA: 'No encontramos una sala con ese ID. Revisa que esté bien escrito.',
  NO_ESTAS_EN_SALA: 'Primero debes entrar a la sala.',
  MENSAJE_VACIO: 'Escribe un mensaje antes de enviarlo.',
  MENSAJE_LARGO: `El mensaje puede tener máximo ${LARGO_MAXIMO_MENSAJE} caracteres.`,
  ERROR_SERVIDOR: 'No se pudo completar la acción. Intenta de nuevo.',
} as const;

function fallo(ack: Ack | undefined, codigo: keyof typeof ERRORES) {
  ack?.({ ok: false, codigo, error: ERRORES[codigo] });
}

function leerSalaId(datos: unknown): string | null {
  const id = (datos as { salaId?: unknown } | undefined)?.salaId;
  if (typeof id !== 'string') return null;
  const normalizado = id.trim().toUpperCase();
  return ID_SALA_REGEX.test(normalizado) ? normalizado : null;
}

/** Si el cliente no manda callback, se usa uno vacío para no fallar. */
function comoAck(valor: unknown): Ack | undefined {
  return typeof valor === 'function' ? (valor as Ack) : undefined;
}

/**
 * Eventos de tiempo real (TS-02). Todos los envíos usan `io.to(salaId)`,
 * así que un evento de una sala solo llega a los sockets que entraron a esa sala.
 * La lista completa de eventos está en docs/EVENTOS.md.
 */
export function registrarEventos(io: Server, presencia = new Presencia()): () => void {
  const salasActivas = new Map<string, { nombre: string }>();
  const salasEliminadas = new Set<string>();
  let snapshotInicialRecibido = false;

  const salaNoExisteEnMemoria = (salaId: string) =>
    salasEliminadas.has(salaId) || (snapshotInicialRecibido && !salasActivas.has(salaId));

  const validarSalaParaChat = (
    socket: Socket,
    datos: unknown,
    ack: Ack | undefined
  ): string | null => {
    const salaId = leerSalaId(datos);
    if (!salaId) {
      fallo(ack, 'NO_ESTAS_EN_SALA');
      return null;
    }
    if (salaNoExisteEnMemoria(salaId)) {
      fallo(ack, 'SALA_NO_ENCONTRADA');
      return null;
    }
    if (!socket.rooms.has(salaId)) {
      fallo(ack, 'NO_ESTAS_EN_SALA');
      return null;
    }
    return salaId;
  };

  const aplicarCambiosSalas = (cambios: CambioSala[]) => {
    snapshotInicialRecibido = true;
    for (const cambio of cambios) {
      if (cambio.tipo === 'added') {
        salasActivas.set(cambio.salaId, { nombre: cambio.nombre ?? '' });
        salasEliminadas.delete(cambio.salaId);
      } else if (cambio.tipo === 'modified') {
        const anterior = salasActivas.get(cambio.salaId);
        if (cambio.nombre !== undefined) {
          salasActivas.set(cambio.salaId, { nombre: cambio.nombre });
          if (anterior && anterior.nombre !== cambio.nombre) {
            io.to(cambio.salaId).emit('sala:actualizada', {
              salaId: cambio.salaId,
              nombre: cambio.nombre,
            });
          }
        }
      } else if (cambio.tipo === 'removed') {
        salasActivas.delete(cambio.salaId);
        salasEliminadas.add(cambio.salaId);
        io.to(cambio.salaId).emit('sala:eliminada', { salaId: cambio.salaId });
        io.in(cambio.salaId).socketsLeave(cambio.salaId);
        presencia.vaciarSala(cambio.salaId);
      }
    }
  };

  const detenerEscucha = salaRepository.escucharCambios(aplicarCambiosSalas, (err) => {
    console.error('Error al escuchar cambios de salas en Firestore:', err);
  });

  io.on('connection', (socket: Socket) => {
    const { usuario } = socket.data as DatosSocket;

    const emitirParticipantes = (salaId: string) => {
      io.to(salaId).emit('sala:participantes', { salaId, participantes: presencia.listar(salaId) });
    };

    const salirDe = (salaId: string) => {
      const participante = presencia.quitar(salaId, socket.id);
      void socket.leave(salaId);
      if (participante) {
        io.to(salaId).emit('sala:participante-salio', {
          salaId,
          socketId: socket.id,
          uid: participante.uid,
          username: participante.username,
        });
        emitirParticipantes(salaId);
      }
    };

    socket.on('sala:unirse', async (datos: unknown, callback: unknown) => {
      const ack = comoAck(callback);
      const salaId = leerSalaId(datos);
      if (!salaId) return fallo(ack, 'SALA_NO_ENCONTRADA');

      try {
        const sala = await salaRepository.obtener(salaId);
        if (!sala) return fallo(ack, 'SALA_NO_ENCONTRADA');

        if (!salasActivas.has(salaId)) {
          salasActivas.set(salaId, { nombre: sala.nombre });
        }
        salasEliminadas.delete(salaId);

        if (!socket.rooms.has(salaId)) {
          await socket.join(salaId);
          const participante = {
            socketId: socket.id,
            uid: usuario.uid,
            username: usuario.username,
            avatarUrl: usuario.avatarUrl,
            microfono: false,
            camara: false,
          };
          presencia.agregar(salaId, participante);
          socket.to(salaId).emit('sala:participante-entro', { salaId, participante });
          emitirParticipantes(salaId);
        }

        ack?.({
          ok: true,
          sala,
          esAnfitrion: sala.anfitrionUid === usuario.uid,
          participantes: presencia.listar(salaId),
        });
      } catch {
        fallo(ack, 'ERROR_SERVIDOR');
      }
    });

    socket.on('sala:salir', (datos: unknown, callback: unknown) => {
      const ack = comoAck(callback);
      const salaId = leerSalaId(datos);
      if (!salaId || !socket.rooms.has(salaId)) return fallo(ack, 'NO_ESTAS_EN_SALA');
      salirDe(salaId);
      ack?.({ ok: true });
    });

    socket.on('chat:enviar', async (datos: unknown, callback: unknown) => {
      const ack = comoAck(callback);
      const salaId = validarSalaParaChat(socket, datos, ack);
      if (!salaId) return;

      const texto = (datos as { texto?: unknown }).texto;
      if (typeof texto !== 'string' || texto.trim() === '') return fallo(ack, 'MENSAJE_VACIO');
      if (texto.trim().length > LARGO_MAXIMO_MENSAJE) return fallo(ack, 'MENSAJE_LARGO');

      try {
        const mensaje = await salaRepository.guardarMensaje({
          salaId,
          autorUid: usuario.uid,
          autorUsername: usuario.username,
          texto: texto.trim(),
          creadoEn: new Date().toISOString(),
        });
        io.to(salaId).emit('chat:mensaje', mensaje);
        ack?.({ ok: true, mensaje });
      } catch {
        fallo(ack, 'ERROR_SERVIDOR');
      }
    });

    socket.on('chat:historial', async (datos: unknown, callback: unknown) => {
      const ack = comoAck(callback);
      const salaId = validarSalaParaChat(socket, datos, ack);
      if (!salaId) return;

      const antesDe = (datos as { antesDe?: unknown }).antesDe;
      if (antesDe !== undefined && (typeof antesDe !== 'string' || isNaN(Date.parse(antesDe)))) {
        return fallo(ack, 'DATOS_INVALIDOS');
      }

      try {
        const pagina = await salaRepository.historial(salaId, MENSAJES_POR_PAGINA, antesDe);
        ack?.({ ok: true, ...pagina });
      } catch {
        fallo(ack, 'ERROR_SERVIDOR');
      }
    });

    socket.on('presencia:estado', (datos: unknown, callback: unknown) => {
      const ack = comoAck(callback);
      const salaId = leerSalaId(datos);
      if (!salaId || !socket.rooms.has(salaId)) return fallo(ack, 'NO_ESTAS_EN_SALA');

      const { microfono, camara } = datos as { microfono?: unknown; camara?: unknown };
      if (typeof microfono !== 'boolean' || typeof camara !== 'boolean') {
        return fallo(ack, 'DATOS_INVALIDOS');
      }

      presencia.actualizar(salaId, socket.id, { microfono, camara });
      io.to(salaId).emit('presencia:actualizada', {
        salaId,
        socketId: socket.id,
        uid: usuario.uid,
        microfono,
        camara,
      });
      ack?.({ ok: true });
    });

    socket.on('disconnecting', () => {
      for (const salaId of presencia.salasDe(socket.id)) salirDe(salaId);
    });
  });

  let detenido = false;
  return () => {
    if (detenido) return;
    detenido = true;
    detenerEscucha();
  };
}
