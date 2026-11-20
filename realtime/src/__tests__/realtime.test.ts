import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as conectar, Socket as ClienteSocket } from 'socket.io-client';
import { crearServidor } from '../app';
import { tokenVerifier } from '../middleware/socketAuth';
import { perfilRepository } from '../repositories/perfilRepository';
import { Mensaje, salaRepository } from '../repositories/salaRepository';

type Respuesta = Record<string, unknown> & { ok: boolean; codigo?: string };

// Tokens de prueba: cada uno corresponde a un usuario.
const USUARIOS: Record<string, { uid: string; username: string }> = {
  'token-ana': { uid: 'uid-ana', username: 'ana_perez' },
  'token-luis': { uid: 'uid-luis', username: 'luis_g' },
  'token-sofi': { uid: 'uid-sofi', username: 'sofi' },
};
const SALAS = ['SALAAAA2', 'SALABBB3'];

let url = '';
let cerrar: () => Promise<void>;
let clientes: ClienteSocket[] = [];
const guardados: Mensaje[] = [];

beforeAll(async () => {
  const { httpServer, io } = crearServidor();
  await new Promise<void>((ok) => httpServer.listen(0, ok));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  cerrar = () => new Promise((ok) => io.close(() => ok()));
});

afterAll(async () => {
  await cerrar();
});

beforeEach(() => {
  guardados.length = 0;
  vi.spyOn(tokenVerifier, 'verify').mockImplementation(async (token) => {
    const u = USUARIOS[token];
    if (!u) throw new Error('auth/argument-error');
    return { uid: u.uid };
  });
  vi.spyOn(perfilRepository, 'obtener').mockImplementation(async (uid) => {
    const u = Object.values(USUARIOS).find((x) => x.uid === uid);
    return u ? { username: u.username, avatarUrl: null } : null;
  });
  vi.spyOn(salaRepository, 'obtener').mockImplementation(async (id) =>
    SALAS.includes(id) ? { id, nombre: `Sala ${id}`, ambiente: 'ninguno', anfitrionUid: 'uid-ana' } : null
  );
  vi.spyOn(salaRepository, 'guardarMensaje').mockImplementation(async (datos) => {
    const m = { id: `m${guardados.length + 1}`, ...datos };
    guardados.push(m);
    return m;
  });
});

afterEach(() => {
  clientes.forEach((c) => c.disconnect());
  clientes = [];
  vi.restoreAllMocks();
});

function cliente(token?: string): ClienteSocket {
  const c = conectar(url, {
    auth: token === undefined ? {} : { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  clientes.push(c);
  return c;
}

function conectado(c: ClienteSocket) {
  return new Promise<void>((ok, mal) => {
    c.once('connect', () => ok());
    c.once('connect_error', mal);
  });
}

function rechazo(c: ClienteSocket) {
  return new Promise<Error & { data?: { codigo: string; mensaje: string } }>((ok) =>
    c.once('connect_error', ok)
  );
}

function emitir(c: ClienteSocket, evento: string, datos: unknown) {
  return c.timeout(2000).emitWithAck(evento, datos) as Promise<Respuesta>;
}

async function entrar(token: string, salaId: string) {
  const c = cliente(token);
  await conectado(c);
  const r = await emitir(c, 'sala:unirse', { salaId });
  expect(r.ok).toBe(true);
  return c;
}

/** Espera un poco y devuelve los eventos que llegaron (para comprobar que algo NO llegó). */
function recolectar(c: ClienteSocket, evento: string) {
  const recibidos: unknown[] = [];
  c.on(evento, (d) => recibidos.push(d));
  return recibidos;
}
const pausa = (ms = 150) => new Promise((ok) => setTimeout(ok, ms));

describe('TS-02 · Handshake autenticado', () => {
  it('rechaza la conexión sin token (NO_AUTENTICADO)', async () => {
    const err = await rechazo(cliente());
    expect(err.message).toBe('NO_AUTENTICADO');
    expect(err.data?.mensaje).toBe('Debes iniciar sesión para continuar.');
  });

  it('rechaza un token inválido o vencido (SESION_INVALIDA)', async () => {
    const err = await rechazo(cliente('token-falso'));
    expect(err.message).toBe('SESION_INVALIDA');
  });

  it('rechaza una cuenta sin perfil (PERFIL_INCOMPLETO)', async () => {
    vi.mocked(perfilRepository.obtener).mockResolvedValueOnce(null);
    const err = await rechazo(cliente('token-ana'));
    expect(err.message).toBe('PERFIL_INCOMPLETO');
  });

  it('acepta un token válido', async () => {
    const c = cliente('token-ana');
    await conectado(c);
    expect(c.connected).toBe(true);
  });
});

describe('TS-02 · Entrar a una sala y presencia', () => {
  it('entrar a una sala que no existe responde SALA_NO_ENCONTRADA', async () => {
    const c = cliente('token-ana');
    await conectado(c);
    const r = await emitir(c, 'sala:unirse', { salaId: 'NOEXISTE' });
    expect(r).toMatchObject({ ok: false, codigo: 'SALA_NO_ENCONTRADA' });
  });

  it('al entrar recibe la sala, si es anfitrión y la lista de participantes', async () => {
    const c = cliente('token-ana');
    await conectado(c);
    const r = await emitir(c, 'sala:unirse', { salaId: 'salaaaa2' });
    expect(r.ok).toBe(true);
    expect(r.esAnfitrion).toBe(true);
    expect(r.participantes).toEqual([
      expect.objectContaining({ uid: 'uid-ana', username: 'ana_perez', microfono: false, camara: false }),
    ]);
  });

  it('avisa a los demás de la sala cuando alguien entra y cuando sale', async () => {
    const ana = await entrar('token-ana', 'SALAAAA2');
    const entradas = recolectar(ana, 'sala:participante-entro');
    const salidas = recolectar(ana, 'sala:participante-salio');

    const luis = await entrar('token-luis', 'SALAAAA2');
    await pausa();
    expect(entradas).toEqual([
      expect.objectContaining({ participante: expect.objectContaining({ username: 'luis_g' }) }),
    ]);

    luis.disconnect();
    await pausa();
    expect(salidas).toEqual([expect.objectContaining({ uid: 'uid-luis' })]);
  });

  it('el estado de micrófono y cámara llega a todos los de la sala', async () => {
    const ana = await entrar('token-ana', 'SALAAAA2');
    const luis = await entrar('token-luis', 'SALAAAA2');
    const estados = recolectar(ana, 'presencia:actualizada');

    const r = await emitir(luis, 'presencia:estado', { salaId: 'SALAAAA2', microfono: true, camara: false });
    await pausa();

    expect(r.ok).toBe(true);
    expect(estados).toEqual([expect.objectContaining({ uid: 'uid-luis', microfono: true, camara: false })]);
  });

  it('rechaza un estado de presencia con datos inválidos', async () => {
    const ana = await entrar('token-ana', 'SALAAAA2');
    const r = await emitir(ana, 'presencia:estado', { salaId: 'SALAAAA2', microfono: 'si' });
    expect(r.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('TS-02 · Aislamiento de eventos por sala', () => {
  it('un mensaje solo llega a quienes están en esa sala', async () => {
    const ana = await entrar('token-ana', 'SALAAAA2');
    const luis = await entrar('token-luis', 'SALAAAA2');
    const sofi = await entrar('token-sofi', 'SALABBB3');

    const deLuis = recolectar(luis, 'chat:mensaje');
    const deSofi = recolectar(sofi, 'chat:mensaje');

    const r = await emitir(ana, 'chat:enviar', { salaId: 'SALAAAA2', texto: 'Hola sala A' });
    await pausa();

    expect(r.ok).toBe(true);
    expect(deLuis).toEqual([expect.objectContaining({ texto: 'Hola sala A', autorUsername: 'ana_perez' })]);
    expect(deSofi).toEqual([]);
  });

  it('la presencia de una sala no llega a otra', async () => {
    const sofi = await entrar('token-sofi', 'SALABBB3');
    const entradas = recolectar(sofi, 'sala:participante-entro');
    const lista = recolectar(sofi, 'sala:participantes');

    await entrar('token-ana', 'SALAAAA2');
    await pausa();

    expect(entradas).toEqual([]);
    expect(lista).toEqual([]);
  });

  it('no deja enviar a una sala a la que no entró', async () => {
    const sofi = await entrar('token-sofi', 'SALABBB3');
    const r = await emitir(sofi, 'chat:enviar', { salaId: 'SALAAAA2', texto: 'colado' });
    expect(r.codigo).toBe('NO_ESTAS_EN_SALA');
    expect(guardados).toHaveLength(0);
  });

  it('después de salir de la sala ya no recibe sus mensajes', async () => {
    const ana = await entrar('token-ana', 'SALAAAA2');
    const luis = await entrar('token-luis', 'SALAAAA2');
    const deLuis = recolectar(luis, 'chat:mensaje');

    expect((await emitir(luis, 'sala:salir', { salaId: 'SALAAAA2' })).ok).toBe(true);
    await emitir(ana, 'chat:enviar', { salaId: 'SALAAAA2', texto: 'ya se fue' });
    await pausa();

    expect(deLuis).toEqual([]);
  });
});

describe('TS-02 · Persistencia del chat en Firestore', () => {
  it('guarda el mensaje con el autor tomado del token, no del cliente', async () => {
    const ana = await entrar('token-ana', 'SALAAAA2');
    await emitir(ana, 'chat:enviar', {
      salaId: 'SALAAAA2',
      texto: '  ¿Repasamos derivadas?  ',
      autorUid: 'uid-luis',
    });

    expect(guardados).toEqual([
      expect.objectContaining({
        salaId: 'SALAAAA2',
        autorUid: 'uid-ana',
        autorUsername: 'ana_perez',
        texto: '¿Repasamos derivadas?',
      }),
    ]);
  });

  it.each([
    ['', 'MENSAJE_VACIO'],
    ['   ', 'MENSAJE_VACIO'],
    ['x'.repeat(1001), 'MENSAJE_LARGO'],
  ])('rechaza el mensaje «%s» (%s) sin guardarlo', async (texto, codigo) => {
    const ana = await entrar('token-ana', 'SALAAAA2');
    const r = await emitir(ana, 'chat:enviar', { salaId: 'SALAAAA2', texto });
    expect(r.codigo).toBe(codigo);
    expect(guardados).toHaveLength(0);
  });

  it('si Firestore falla, avisa al que envió y no reparte el mensaje', async () => {
    vi.mocked(salaRepository.guardarMensaje).mockRejectedValueOnce(new Error('down'));
    const ana = await entrar('token-ana', 'SALAAAA2');
    const luis = await entrar('token-luis', 'SALAAAA2');
    const deLuis = recolectar(luis, 'chat:mensaje');

    const r = await emitir(ana, 'chat:enviar', { salaId: 'SALAAAA2', texto: 'hola' });
    await pausa();

    expect(r.codigo).toBe('ERROR_SERVIDOR');
    expect(deLuis).toEqual([]);
  });

  it('chat:historial devuelve los mensajes guardados de esa sala', async () => {
    const historial = vi.spyOn(salaRepository, 'historial').mockResolvedValue({
      mensajes: [],
      hayMas: false,
    });
    const ana = await entrar('token-ana', 'SALAAAA2');

    const r = await emitir(ana, 'chat:historial', { salaId: 'SALAAAA2' });

    expect(r).toMatchObject({ ok: true, mensajes: [], hayMas: false });
    expect(historial).toHaveBeenCalledWith('SALAAAA2', 30, undefined);
  });
});

describe('Salud del servicio', () => {
  it('GET /health responde 200 (Render lo usa para saber que está vivo)', async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });
});
