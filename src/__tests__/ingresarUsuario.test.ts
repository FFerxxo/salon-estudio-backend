import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { FakeFirestore } from './fakeFirestore';
import { reiniciarRateLimitIngresoUsuario } from '../middleware/rateLimit';
import {
  authRepository,
  CredencialesInvalidasError,
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

  it('devuelve exactamente el mismo 401 si el usuario no existe, si es cuenta Google o si falla la contraseña', async () => {
    const resDesconocido = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: '@no_existe', password: 'MiClaveSegura123' });

    sembrarUsuario({ proveedor: 'google.com' });
    const resGoogle = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana_perez', password: 'MiClaveSegura123' });

    sembrarUsuario({ proveedor: 'password' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }), {
          status: 400,
        })
      )
    );
    const resClaveMala = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana_perez', password: 'incorrecta' });

    expect(resDesconocido.status).toBe(401);
    expect(resGoogle.status).toBe(401);
    expect(resClaveMala.status).toBe(401);

    expect(resDesconocido.body).toEqual({ error: 'Usuario o contraseña incorrectos.' });
    expect(resGoogle.body).toEqual(resDesconocido.body);
    expect(resClaveMala.body).toEqual(resDesconocido.body);

    expect(JSON.stringify(resDesconocido.body)).not.toContain(EMAIL_ANA);
    expect(JSON.stringify(resGoogle.body)).not.toContain(EMAIL_ANA);
    expect(JSON.stringify(resClaveMala.body)).not.toContain(EMAIL_ANA);
  });

  it.each([
    'INVALID_LOGIN_CREDENTIALS',
    'INVALID_PASSWORD',
    'EMAIL_NOT_FOUND',
    'USER_DISABLED',
  ])('mapea el error %s de Firebase Auth a 401 único', async (codigoFirebase) => {
    sembrarUsuario();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: codigoFirebase } }), { status: 400 })
      )
    );

    const res = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana_perez', password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Usuario o contraseña incorrectos.' });
    expect(JSON.stringify(res.body)).not.toContain(EMAIL_ANA);
  });

  it.each([
    {},
    { username: '', password: '123' },
    { username: '   ', password: '123' },
    { username: '@', password: '123' },
    { username: 'ana/perez', password: '123' },
    { username: 'ana_perez', password: '' },
    { username: 'ana_perez', password: '   ' },
    { username: 123, password: '123' },
  ])('rechaza payload inválido con 400 sin exponer correos: %j', async (payload) => {
    const res = await request(app).post('/api/auth/ingresar-usuario').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Revisa los campos marcados.');
    expect(res.body.errores).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain(EMAIL_ANA);
  });

  it('limita a 10 intentos por IP en 15 minutos devolviendo 429 y Retry-After', async () => {
    sembrarUsuario();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ error: { message: 'INVALID_PASSWORD' } }), { status: 400 })
      )
    );

    for (let i = 0; i < 10; i++) {
      const intento = await request(app)
        .post('/api/auth/ingresar-usuario')
        .set('X-Forwarded-For', '198.51.100.10')
        .send({ username: 'ana_perez', password: 'mal' });
      expect(intento.status).toBe(401);
    }

    const bloqueado = await request(app)
      .post('/api/auth/ingresar-usuario')
      .set('X-Forwarded-For', '198.51.100.10')
      .send({ username: 'ana_perez', password: 'mal' });

    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);
    expect(bloqueado.body.error).toMatch(/Demasiados intentos/);
    expect(JSON.stringify(bloqueado.body)).not.toContain(EMAIL_ANA);

    // Otra IP no queda bloqueada
    const otraIp = await request(app)
      .post('/api/auth/ingresar-usuario')
      .set('X-Forwarded-For', '198.51.100.20')
      .send({ username: 'ana_perez', password: 'mal' });
    expect(otraIp.status).toBe(401);
  });

  it('devuelve 503 si falta FIREBASE_WEB_API_KEY', async () => {
    sembrarUsuario();
    delete process.env.FIREBASE_WEB_API_KEY;

    const res = await request(app)
      .post('/api/auth/ingresar-usuario')
      .send({ username: 'ana_perez', password: 'MiClaveSegura123' });

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

  it('authRepository distingue credenciales inválidas de error de servicio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'EMAIL_NOT_FOUND' } }), { status: 400 })
      )
    );
    await expect(authRepository.verificarPassword(EMAIL_ANA, 'x')).rejects.toBeInstanceOf(
      CredencialesInvalidasError
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
