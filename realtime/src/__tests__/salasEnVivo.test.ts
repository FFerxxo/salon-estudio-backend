import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as conectar, Socket as ClienteSocket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { crearServidor } from '../app';
import * as firebase from '../config/firebase';
import { tokenVerifier } from '../middleware/socketAuth';
import { perfilRepository } from '../repositories/perfilRepository';
import { salaRepository, type TipoCambioSala } from '../repositories/salaRepository';
import { Presencia } from '../sockets/presencia';

type Respuesta = Record<string, unknown> & { ok: boolean; codigo?: string; error?: string };

interface CambioSimulado {
  tipo: TipoCambioSala;
  id: string;
  nombre?: string;
}

const USUARIOS: Record<string, { uid: string; username: string }> = {
  'token-ana': { uid: 'uid-ana', username: 'ana_perez' },
  'token-luis': { uid: 'uid-luis', username: 'luis_g' },
  'token-sofi': { uid: 'uid-sofi', username: 'sofi' },
};

const pausa = (ms = 120) => new Promise((ok) => setTimeout(ok, ms));

describe('US-07 y US-10 · Salas en vivo con onSnapshot', () => {
  let url = '';
  let ioServer: Server;
  let presencia: Presencia;
  let detenerServidor: () => void;
  let cerrarServidor: () => Promise<void>;
  let clientes: ClienteSocket[] = [];
  let emitirSnapshot: (cambios: CambioSimulado[]) => void;
  let unsubscribeMock: ReturnType<typeof vi.fn>;
  let collectionSpy: ReturnType<typeof vi.fn>;
  let obtenerSalaSpy: ReturnType<typeof vi.spyOn>;
  let guardarMensajeSpy: ReturnType<typeof vi.spyOn>;
  let historialSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    unsubscribeMock = vi.fn();
    let onNext: ((snap: unknown) => void) | null = null;

    collectionSpy = vi.fn((nombre: string) => {
      if (nombre === 'rooms') {
        return {
          onSnapshot: vi.fn((cb: (snap: unknown) => void) => {
            onNext = cb;
            return unsubscribeMock;
          }),
        };
      }
      return {};
    });

    vi.spyOn(firebase, 'getDb').mockReturnValue({
      collection: collectionSpy,
    } as unknown as ReturnType<typeof firebase.getDb>);

    emitirSnapshot = (cambios) => {
      onNext?.({
        docChanges: () =>
          cambios.map((c) => ({
            type: c.tipo,
            doc: {
              id: c.id,
              data: () => (c.nombre === undefined ? {} : { nombre: c.nombre }),
            },
          })),
      });
    };

    vi.spyOn(tokenVerifier, 'verify').mockImplementation(async (token) => {
      const u = USUARIOS[token];
      if (!u) throw new Error('auth/argument-error');
      return { uid: u.uid };
    });

    vi.spyOn(perfilRepository, 'obtener').mockImplementation(async (uid) => {
      const u = Object.values(USUARIOS).find((x) => x.uid === uid);
      return u ? { username: u.username, avatarUrl: null } : null;
    });

    obtenerSalaSpy = vi.spyOn(salaRepository, 'obtener').mockImplementation(async (id) => {
      if (id === 'SALAAAA2') {
        return { id, nombre: 'Sala Cálculo', ambiente: 'ninguno', anfitrionUid: 'uid-ana' };
      }
      if (id === 'SALABBB3') {
        return { id, nombre: 'Sala Física', ambiente: 'blue', anfitrionUid: 'uid-sofi' };
      }
      return null;
    });

    guardarMensajeSpy = vi.spyOn(salaRepository, 'guardarMensaje').mockImplementation(async (datos) => ({
      id: 'm-1',
      ...datos,
    }));

    historialSpy = vi.spyOn(salaRepository, 'historial').mockResolvedValue({
      mensajes: [],
      hayMas: false,
    });

    presencia = new Presencia();
    const { httpServer, io, detener } = crearServidor(presencia);
    ioServer = io;
    detenerServidor = detener;
    await new Promise<void>((ok) => httpServer.listen(0, ok));
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    cerrarServidor = () => new Promise((ok) => io.close(() => ok()));
  });

  afterEach(async () => {
    clientes.forEach((c) => c.disconnect());
    clientes = [];
    await cerrarServidor();
    vi.restoreAllMocks();
  });

  async function conectarYUnirse(token: string, salaId: string): Promise<ClienteSocket> {
    const c = conectar(url, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clientes.push(c);

    await new Promise<void>((ok, mal) => {
      c.once('connect', () => ok());
      c.once('connect_error', mal);
    });

    const resp = (await c.timeout(2000).emitWithAck('sala:unirse', { salaId })) as Respuesta;
    expect(resp.ok).toBe(true);
    return c;
  }

  function recolectar(c: ClienteSocket, evento: string) {
    const eventos: unknown[] = [];
    c.on(evento, (payload) => eventos.push(payload));
    return eventos;
  }

  it('renombrar una sala emite sala:actualizada a las 2 conexiones sin recargar y no en carga inicial', async () => {
    const ana = await conectarYUnirse('token-ana', 'SALAAAA2');
    const luis = await conectarYUnirse('token-luis', 'SALAAAA2');
    const sofi = await conectarYUnirse('token-sofi', 'SALABBB3');

    const actualizacionesAna = recolectar(ana, 'sala:actualizada');
    const actualizacionesLuis = recolectar(luis, 'sala:actualizada');
    const actualizacionesSofi = recolectar(sofi, 'sala:actualizada');

    // Carga inicial y modificación sin cambio de nombre no deben emitir sala:actualizada.
    emitirSnapshot([
      { tipo: 'added', id: 'SALAAAA2', nombre: 'Sala Cálculo' },
      { tipo: 'added', id: 'SALABBB3', nombre: 'Sala Física' },
    ]);
    emitirSnapshot([{ tipo: 'modified', id: 'SALAAAA2', nombre: 'Sala Cálculo' }]);
    await pausa();

    expect(actualizacionesAna).toEqual([]);
    expect(actualizacionesLuis).toEqual([]);

    // Cambio real de nombre en Firestore.
    emitirSnapshot([{ tipo: 'modified', id: 'SALAAAA2', nombre: 'Cálculo II' }]);
    await pausa();

    expect(actualizacionesAna).toEqual([{ salaId: 'SALAAAA2', nombre: 'Cálculo II' }]);
    expect(actualizacionesLuis).toEqual([{ salaId: 'SALAAAA2', nombre: 'Cálculo II' }]);
    expect(actualizacionesSofi).toEqual([]);
  });

  it('eliminar una sala emite sala:eliminada a las 2 conexiones, saca los sockets y limpia la presencia', async () => {
    const ana = await conectarYUnirse('token-ana', 'SALAAAA2');
    const luis = await conectarYUnirse('token-luis', 'SALAAAA2');
    const sofi = await conectarYUnirse('token-sofi', 'SALABBB3');

    expect(presencia.listar('SALAAAA2')).toHaveLength(2);
    expect(ioServer.sockets.adapter.rooms.get('SALAAAA2')?.size).toBe(2);

    const eliminadasAna = recolectar(ana, 'sala:eliminada');
    const eliminadasLuis = recolectar(luis, 'sala:eliminada');
    const eliminadasSofi = recolectar(sofi, 'sala:eliminada');

    emitirSnapshot([
      { tipo: 'added', id: 'SALAAAA2', nombre: 'Sala Cálculo' },
      { tipo: 'added', id: 'SALABBB3', nombre: 'Sala Física' },
    ]);
    emitirSnapshot([{ tipo: 'removed', id: 'SALAAAA2' }]);
    await pausa();

    expect(eliminadasAna).toEqual([{ salaId: 'SALAAAA2' }]);
    expect(eliminadasLuis).toEqual([{ salaId: 'SALAAAA2' }]);
    expect(eliminadasSofi).toEqual([]);
    expect(ioServer.sockets.adapter.rooms.get('SALAAAA2')).toBeUndefined();
    expect(presencia.listar('SALAAAA2')).toEqual([]);
    expect(presencia.listar('SALABBB3')).toHaveLength(1);
  });

  it('rechaza chat:enviar y chat:historial con SALA_NO_ENCONTRADA tras eliminar la sala sin leer Firestore ni guardar', async () => {
    const ana = await conectarYUnirse('token-ana', 'SALAAAA2');
    const luis = await conectarYUnirse('token-luis', 'SALAAAA2');

    emitirSnapshot([{ tipo: 'added', id: 'SALAAAA2', nombre: 'Sala Cálculo' }]);
    emitirSnapshot([{ tipo: 'removed', id: 'SALAAAA2' }]);
    await pausa();

    obtenerSalaSpy.mockClear();
    collectionSpy.mockClear();

    const respEnviarAna = (await ana
      .timeout(2000)
      .emitWithAck('chat:enviar', { salaId: 'SALAAAA2', texto: 'Hola?' })) as Respuesta;
    const respEnviarLuis = (await luis
      .timeout(2000)
      .emitWithAck('chat:enviar', { salaId: 'SALAAAA2', texto: '¿Siguen aquí?' })) as Respuesta;
    const respHistorial = (await ana
      .timeout(2000)
      .emitWithAck('chat:historial', { salaId: 'SALAAAA2' })) as Respuesta;

    expect(respEnviarAna).toMatchObject({ ok: false, codigo: 'SALA_NO_ENCONTRADA' });
    expect(respEnviarAna.error).toBeTruthy();
    expect(respEnviarLuis).toMatchObject({ ok: false, codigo: 'SALA_NO_ENCONTRADA' });
    expect(respHistorial).toMatchObject({ ok: false, codigo: 'SALA_NO_ENCONTRADA' });

    expect(guardarMensajeSpy).not.toHaveBeenCalled();
    expect(historialSpy).not.toHaveBeenCalled();
    expect(obtenerSalaSpy).not.toHaveBeenCalled();
    expect(collectionSpy).not.toHaveBeenCalled();
  });

  it('desuscribe el listener de Firestore al cerrar el servidor o llamar detener()', async () => {
    expect(unsubscribeMock).not.toHaveBeenCalled();

    await cerrarServidor();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);

    // Llamar detener() de nuevo es idempotente.
    detenerServidor();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('arranca sin fallar si el mock de getDb no define onSnapshot', async () => {
    vi.spyOn(firebase, 'getDb').mockReturnValue({
      collection: () => ({}),
    } as unknown as ReturnType<typeof firebase.getDb>);

    const { httpServer, io, detener } = crearServidor();
    await new Promise<void>((ok) => httpServer.listen(0, ok));
    detener();
    await new Promise<void>((ok) => io.close(() => ok()));
  });
});
