import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { LimiteIntentos } from '../middleware/limiteIntentos';
import {
  credencialesRepository,
  FirebaseBloqueoError,
  IngresoNoDisponibleError,
} from '../repositories/credencialesRepository';
import { userRepository } from '../repositories/userRepository';
import { limiteIngreso, MENSAJE_CREDENCIALES } from '../routes/authRoutes';
import { swaggerDocument } from '../swagger';

const CORREO_ANA = 'ana.perez@correounivalle.edu.co';
const CLAVE_ANA = 'Clave-segura-1';

/** Cuentas de prueba: ana tiene contraseña; luis solo entra con Google (sin contraseña). */
function cuentasDePrueba() {
  vi.spyOn(userRepository, 'buscarPorUsername').mockImplementation(async (username) => {
    if (username.toLowerCase() === 'ana_perez') return { uid: 'uid-ana', email: CORREO_ANA };
    if (username.toLowerCase() === 'luis_g') return { uid: 'uid-luis', email: 'luis@gmail.com' };
    return null;
  });
  vi.spyOn(credencialesRepository, 'verificarContrasena').mockImplementation(async (email, clave) =>
    email === CORREO_ANA && clave === CLAVE_ANA ? 'uid-ana' : null
  );
  vi.spyOn(credencialesRepository, 'crearToken').mockImplementation(async (uid) => `token-de-${uid}`);
}

const ingresar = (datos: unknown, ip = '10.0.0.1') =>
  request(app).post('/api/auth/ingresar').set('X-Forwarded-For', ip).send(datos as object);

describe('Issue #9 · POST /api/auth/ingresar (ingresar con @usuario)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cuentasDePrueba();
  });
  afterEach(() => {
    // Cada prueba empieza sin intentos fallidos acumulados.
    for (const ip of ['10.0.0.1', '10.0.0.2']) {
      for (const u of ['ana_perez', 'luis_g', 'nadie_aqui', 'no válido!']) limiteIngreso.registrarExito(ip, u);
    }
  });

  it('con @usuario y la contraseña correcta devuelve un token y nunca el correo (200)', async () => {
    const res = await ingresar({ usuario: '@ana_perez', contrasena: CLAVE_ANA });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'token-de-uid-ana' });
    expect(JSON.stringify(res.body)).not.toContain(CORREO_ANA);
    expect(credencialesRepository.verificarContrasena).toHaveBeenCalledWith(CORREO_ANA, CLAVE_ANA);
  });

  it('acepta el usuario sin @, con espacios y con otras mayúsculas', async () => {
    const res = await ingresar({ usuario: '  Ana_Perez ', contrasena: CLAVE_ANA });
    expect(res.status).toBe(200);
  });

  it('contraseña incorrecta y usuario inexistente dan exactamente el mismo error (401)', async () => {
    const malaClave = await ingresar({ usuario: '@ana_perez', contrasena: 'otra' });
    const noExiste = await ingresar({ usuario: '@nadie_aqui', contrasena: 'otra' });

    expect(malaClave.status).toBe(401);
    expect(noExiste.status).toBe(401);
    expect(malaClave.body).toEqual({ error: MENSAJE_CREDENCIALES, codigo: 'CREDENCIALES_INVALIDAS' });
    expect(noExiste.body).toEqual(malaClave.body);
  });

  it('una cuenta que solo entra con Google responde el mismo 401', async () => {
    const res = await ingresar({ usuario: 'luis_g', contrasena: 'cualquiera' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe(MENSAJE_CREDENCIALES);
  });

  it('un usuario con formato inválido no consulta la base de datos y da el mismo 401', async () => {
    const res = await ingresar({ usuario: 'no válido!', contrasena: 'x' });
    expect(res.status).toBe(401);
    expect(userRepository.buscarPorUsername).not.toHaveBeenCalled();
  });

  it('sin usuario o sin contraseña responde 400 indicando qué falta', async () => {
    const res = await ingresar({ usuario: '@ana_perez' });
    expect(res.status).toBe(400);
    expect(res.body.errores).toEqual({ contrasena: 'Escribe tu contraseña.' });
  });

  it('después de 5 intentos fallidos bloquea ese usuario en esa IP (429), incluso con la clave correcta', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await ingresar({ usuario: '@ana_perez', contrasena: 'mal' })).status).toBe(401);
    }
    const bloqueado = await ingresar({ usuario: '@ana_perez', contrasena: CLAVE_ANA });

    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.codigo).toBe('DEMASIADOS_INTENTOS');
    // Desde otra IP la persona puede seguir entrando.
    expect((await ingresar({ usuario: '@ana_perez', contrasena: CLAVE_ANA }, '10.0.0.2')).status).toBe(200);
  });

  it('si Firebase bloquea la cuenta por intentos responde 429', async () => {
    vi.mocked(credencialesRepository.verificarContrasena).mockRejectedValueOnce(new FirebaseBloqueoError());
    const res = await ingresar({ usuario: '@ana_perez', contrasena: CLAVE_ANA });
    expect(res.status).toBe(429);
  });

  it('sin FIREBASE_WEB_API_KEY responde 503 con un mensaje claro y lo registra en los logs', async () => {
    vi.mocked(credencialesRepository.verificarContrasena).mockRejectedValueOnce(new IngresoNoDisponibleError());
    const res = await ingresar({ usuario: '@ana_perez', contrasena: CLAVE_ANA });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('correo');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"contexto":"ingresar-usuario"'));
  });

  it('el registro de errores no incluye la contraseña ni el usuario', async () => {
    vi.mocked(credencialesRepository.verificarContrasena).mockRejectedValueOnce(
      Object.assign(new Error('network'), { code: 'ECONNRESET' })
    );
    await ingresar({ usuario: '@ana_perez', contrasena: CLAVE_ANA });

    const linea = String(vi.mocked(console.error).mock.calls[0][0]);
    expect(linea).toContain('ECONNRESET');
    expect(linea).not.toContain(CLAVE_ANA);
    expect(linea).not.toContain('ana_perez');
  });

  it('está documentada en Swagger', () => {
    expect(swaggerDocument.paths).toHaveProperty('/api/auth/ingresar');
  });
});

describe('LimiteIntentos', () => {
  it('libera el usuario cuando pasa la ventana de tiempo', () => {
    let ahora = 0;
    const limite = new LimiteIntentos(2, 60_000, () => ahora);
    limite.registrarFallo('ip', 'ana');
    limite.registrarFallo('ip', 'ana');
    expect(limite.minutosBloqueado('ip', 'ana')).toBe(1);

    ahora = 60_000;
    expect(limite.minutosBloqueado('ip', 'ana')).toBe(0);
  });
});

describe('credencialesRepository.verificarContrasena', () => {
  const fetchOriginal = globalThis.fetch;
  // Las pruebas de arriba simulan este repositorio; aquí se prueba el real.
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    delete process.env.FIREBASE_WEB_API_KEY;
  });

  function responder(status: number, cuerpo: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(cuerpo), { status }));
  }

  it('sin la clave web lanza IngresoNoDisponibleError', async () => {
    delete process.env.FIREBASE_WEB_API_KEY;
    await expect(credencialesRepository.verificarContrasena('a@b.co', 'x')).rejects.toBeInstanceOf(
      IngresoNoDisponibleError
    );
  });

  it('devuelve el uid si Firebase acepta la contraseña', async () => {
    process.env.FIREBASE_WEB_API_KEY = 'clave';
    responder(200, { localId: 'uid-ana' });
    await expect(credencialesRepository.verificarContrasena('a@b.co', 'x')).resolves.toBe('uid-ana');
  });

  it.each(['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND'])(
    'devuelve null cuando Firebase responde %s',
    async (codigo) => {
      process.env.FIREBASE_WEB_API_KEY = 'clave';
      responder(400, { error: { message: codigo } });
      await expect(credencialesRepository.verificarContrasena('a@b.co', 'x')).resolves.toBeNull();
    }
  );

  it('lanza FirebaseBloqueoError con TOO_MANY_ATTEMPTS_TRY_LATER', async () => {
    process.env.FIREBASE_WEB_API_KEY = 'clave';
    responder(400, { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER : Access disabled' } });
    await expect(credencialesRepository.verificarContrasena('a@b.co', 'x')).rejects.toBeInstanceOf(
      FirebaseBloqueoError
    );
  });
});
