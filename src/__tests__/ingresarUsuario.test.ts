import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import { app } from '../app';
import { FakeFirestore } from './fakeFirestore';
import {
  crearRateLimit,
  reiniciarRateLimitIngresoUsuario,
} from '../middleware/rateLimit';
import {
  authRepository,
  CredencialesInvalidasError,
  DemasiadosIntentosError,
  ServicioAuthNoDisponibleError,
} from '../repositories/authRepository';
import { swaggerDocument } from '../swagger';

const fake = vi.hoisted(() => ({
  db: null as unknown as FakeFirestore,
  createCustomToken: vi.fn(),
}));

vi.mock('../config/firebase', () => ({
  getDb: () => fake.db,
  getAuth: () => ({ createCustomToken: fake.createCustomToken }),
}));

const EMAIL_ANA = 'ana.secreto@correounivalle.edu.co';
const EMAIL_FICTICIO = 'usuario-no-registrado@salon-estudio.invalid';

function sembrarUsuario(opciones?: { proveedor?: string }) {
  fake.db.datos.set('usernames/ana_perez', { uid: 'uid-ana' });
  fake.db.datos.set('users/uid-ana', {
    uid: 'uid-ana',
    nombres: 'Ana',
    apellidos: 'Pérez',
    username: 'Ana_Perez',
    email: EMAIL_ANA,
    avatarUrl: null,
    proveedor: opciones?.proveedor ?? 'password',
    creadoEn: '2026-11-01T00:00:00.000Z',
  });
}

function mockFetchErrorFirebase(mensaje: string, status = 400) {
  const fetchMock = vi.fn().mockImplementation(
    async () => new Response(JSON.stringify({ error: { message: mensaje } }), { status })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('US-02 · POST /api/auth/ingresar-usuario', () => {
  const apiKeyOriginal = process.env.FIREBASE_WEB_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fake.db = new FakeFirestore();
    fake.createCustomToken.mockReset();
    reiniciarRateLimitIngresoUsuario();
    process.env.FIREBASE_WEB_API_KEY = 'fake-web-api-key';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (apiKeyOriginal === undefined) {
      delete process.env.FIREBASE_WEB_API_KEY;
    } else {
      process.env.FIREBASE_WEB_API_KEY = apiKeyOriginal;
    }
  });

  it.each(['ana_perez', '@ana_perez', '  @Ana_Perez  '])(
    'inicia sesión con "%s", devuelve customToken y nunca expone el correo (200)',
    async (entradaUsername) => {
      sembrarUsuario();
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ registered: true }), { status: 200 })
      );
      vi.stubGlobal('fetch', fetchMock);
      fake.createCustomToken.mockResolvedValue('custom-token-ana');

      const res = await request(app)
        .post('/api/auth/ingresar-usuario')
        .send({ username: entradaUsername, password: 'MiClaveSegura123' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ customToken: 'custom-token-ana' });
      expect(JSON.stringify(res.body)).not.toContain(EMAIL_ANA);
      expect(fake.createCustomToken).toHaveBeenCalledWith('uid-ana');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-web-api-key',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: EMAIL_ANA,
            password: 'MiClaveSegura123',
            returnSecureToken: false,
          }),
        })
      );
    }
  );

  it('devuelve el mismo 401 y llama a verificarPassword en usuario inexistente, cuenta Google, patrón inválido y clave incorrecta', async () => {
    mockFetchErrorFirebase('INVALID_LOGIN_CREDENTIALS');
    const spyVerificar = vi.spyOn(authRepository, 'verificarPassword');

    const resDesconocido = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: '@no_existe', password: 'MiClaveSegura123' });

    expect(spyVerificar).toHaveBeenLastCalledWith(EMAIL_FICTICIO, 'MiClaveSegura123');

    sembrarUsuario({ proveedor: 'google.com' });
    const resGoogle = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana_perez', password: 'MiClaveSegura123' });

    expect(spyVerificar).toHaveBeenLastCalledWith(EMAIL_FICTICIO, 'MiClaveSegura123');

    const resPatronInvalido = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana/perez', password: 'MiClaveSegura123' });

    expect(spyVerificar).toHaveBeenLastCalledWith(EMAIL_FICTICIO, 'MiClaveSegura123');

    sembrarUsuario({ proveedor: 'password' });
    const resClaveMala = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana_perez', password: 'incorrecta' });

    expect(spyVerificar).toHaveBeenLastCalledWith(EMAIL_ANA, 'incorrecta');
    expect(spyVerificar).toHaveBeenCalledTimes(4);

    expect(resDesconocido.status).toBe(401);
    expect(resGoogle.status).toBe(401);
    expect(resPatronInvalido.status).toBe(401);
    expect(resClaveMala.status).toBe(401);

    expect(resDesconocido.body).toEqual({ error: 'Usuario o contraseña incorrectos.' });
    expect(resGoogle.body).toEqual(resDesconocido.body);
    expect(resPatronInvalido.body).toEqual(resDesconocido.body);
    expect(resClaveMala.body).toEqual(resDesconocido.body);

    expect(JSON.stringify(resDesconocido.body)).not.toContain(EMAIL_ANA);
    expect(JSON.stringify(resGoogle.body)).not.toContain(EMAIL_ANA);
    expect(JSON.stringify(resPatronInvalido.body)).not.toContain(EMAIL_ANA);
    expect(JSON.stringify(resClaveMala.body)).not.toContain(EMAIL_ANA);
  });

  it.each([
    'INVALID_LOGIN_CREDENTIALS',
    'INVALID_PASSWORD',
    'EMAIL_NOT_FOUND',
    'USER_DISABLED',
  ])('mapea el error %s de Firebase Auth a 401 único', async (codigoFirebase) => {
    sembrarUsuario();
    mockFetchErrorFirebase(codigoFirebase);

    const res = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana_perez', password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Usuario o contraseña incorrectos.' });
    expect(JSON.stringify(res.body)).not.toContain(EMAIL_ANA);
  });

  it.each([
    'TOO_MANY_ATTEMPTS_TRY_LATER',
    'TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled due to many failed login attempts.',
  ])('mapea %s de Firebase Auth a 429 con mensaje claro', async (mensajeFirebase) => {
    sembrarUsuario();
    mockFetchErrorFirebase(mensajeFirebase);

    const res = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana_perez', password: 'incorrecta' });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
    });
    expect(JSON.stringify(res.body)).not.toContain(EMAIL_ANA);
  });

  it.each([
    'ana/perez',
    'ab',
    'a'.repeat(21),
    'ana.perez',
    'ana perez',
    '@@ana',
  ])('responde 401 y ejecuta verificación ficticia cuando "%s" no cumple el patrón de registro', async (usuarioInvalido) => {
    mockFetchErrorFirebase('EMAIL_NOT_FOUND');
    const spyVerificar = vi.spyOn(authRepository, 'verificarPassword');

    const res = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: usuarioInvalido, password: 'MiClaveSegura123' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Usuario o contraseña incorrectos.' });
    expect(spyVerificar).toHaveBeenCalledWith(EMAIL_FICTICIO, 'MiClaveSegura123');
  });

  it.each([
    {},
    { username: '', password: '123' },
    { username: '   ', password: '123' },
    { username: '@', password: '123' },
    { username: 'ana_perez', password: '' },
    { username: 'ana_perez', password: '   ' },
    { username: 123, password: '123' },
  ])('rechaza payload vacío o sin tipos válidos con 400 sin exponer correos: %j', async (payload) => {
    const res = await request(app).post('/api/auth/ingresar-usuario').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Revisa los campos marcados.');
    expect(res.body.errores).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain(EMAIL_ANA);
  });

  it('no permite evadir el límite por IP falsificando la cabecera X-Forwarded-For detrás del proxy', async () => {
    mockFetchErrorFirebase('INVALID_PASSWORD');

    for (let i = 0; i < 10; i++) {
      const intento = await request(app)
        .post('/api/auth/ingresar-usuario')
        .set('X-Forwarded-For', `fake-${i}, 203.0.113.5`)
        .send({ username: `usuario_${i}`, password: 'mal' });
      expect(intento.status).toBe(401);
    }

    const bloqueado = await request(app)
      .post('/api/auth/ingresar-usuario')
      .set('X-Forwarded-For', 'fake-10, 203.0.113.5')
      .send({ username: 'usuario_10', password: 'mal' });

    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);
    expect(bloqueado.body.error).toMatch(/Demasiados intentos/);

    // Otra IP real con otro usuario no queda bloqueada
    const otraIp = await request(app)
      .post('/api/auth/ingresar-usuario')
      .set('X-Forwarded-For', '198.51.100.20')
      .send({ username: 'otro_usuario', password: 'mal' });
    expect(otraIp.status).toBe(401);
  });

  it('limita a 10 intentos por usuario normalizado aunque cambie la IP en cada intento', async () => {
    sembrarUsuario();
    mockFetchErrorFirebase('INVALID_PASSWORD');

    const variantes = [
      'ana_perez',
      '@ana_perez',
      '  @Ana_Perez  ',
      'ANA_PEREZ',
      'Ana_Perez',
      '@ANA_PEREZ',
      'ana_perez ',
      ' @ana_perez',
      'Ana_perez',
      '@Ana_perez',
    ];

    for (let i = 0; i < 10; i++) {
      const intento = await request(app)
        .post('/api/auth/ingresar-usuario')
        .set('X-Forwarded-For', `198.51.100.${i + 1}`)
        .send({ username: variantes[i], password: 'mal' });
      expect(intento.status).toBe(401);
    }

    const bloqueado = await request(app)
      .post('/api/auth/ingresar-usuario')
      .set('X-Forwarded-For', '198.51.100.99')
      .send({ username: '@ana_perez', password: 'mal' });

    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);
    expect(bloqueado.body.error).toMatch(/Demasiados intentos/);
    expect(JSON.stringify(bloqueado.body)).not.toContain(EMAIL_ANA);
  });

  it('limpia entradas vencidas y acota la memoria frente a usuarios enormes o masivos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T10:00:00.000Z'));

    const limitador = crearRateLimit({ ventanaMs: 60_000, maxIntentos: 2, maxEntradas: 3 });
    const crearRes = () => {
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      return res as unknown as Response;
    };
    const next: NextFunction = vi.fn();

    for (let i = 0; i < 5; i++) {
      const req = {
        ip: `10.0.0.${i}`,
        socket: { remoteAddress: `10.0.0.${i}` },
        body: { username: `${'x'.repeat(2000)}_${i}` },
      } as unknown as Request;
      limitador.middleware(req, crearRes(), next);
    }

    expect(limitador.conteoRegistros()).toEqual({ ips: 3, usuarios: 3 });

    vi.advanceTimersByTime(60_001);

    const reqNuevo = {
      ip: '10.0.0.99',
      socket: { remoteAddress: '10.0.0.99' },
      body: { username: 'ana_perez' },
    } as unknown as Request;
    limitador.middleware(reqNuevo, crearRes(), next);

    expect(limitador.conteoRegistros()).toEqual({ ips: 1, usuarios: 1 });
  });

  it('devuelve 503 si falta FIREBASE_WEB_API_KEY incluso con usuario inexistente', async () => {
    delete process.env.FIREBASE_WEB_API_KEY;

    const res = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'no_existe', password: 'MiClaveSegura123' });

    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain(EMAIL_ANA);
  });

  it('devuelve 503 si Firebase Auth REST no responde', async () => {
    sembrarUsuario();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const res = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana_perez', password: 'MiClaveSegura123' });

    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain(EMAIL_ANA);
  });

  it('authRepository distingue credenciales inválidas, demasiados intentos y error de servicio', async () => {
    mockFetchErrorFirebase('EMAIL_NOT_FOUND');
    await expect(authRepository.verificarPassword(EMAIL_ANA, 'x')).rejects.toBeInstanceOf(
      CredencialesInvalidasError
    );

    mockFetchErrorFirebase('TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled');
    await expect(authRepository.verificarPassword(EMAIL_ANA, 'x')).rejects.toBeInstanceOf(
      DemasiadosIntentosError
    );

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })));
    await expect(authRepository.verificarPassword(EMAIL_ANA, 'x')).rejects.toBeInstanceOf(
      ServicioAuthNoDisponibleError
    );
  });

  it('documenta POST /api/auth/ingresar-usuario en Swagger con 200, 400, 401, 429 y 503', () => {
    const ruta = swaggerDocument.paths['/api/auth/ingresar-usuario'];
    expect(ruta).toBeDefined();
    expect(Object.keys(ruta.post.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '429', '503'])
    );
  });
});
