import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenVerifier, UsuarioAutenticado } from '../middleware/auth';
import {
  PerfilExistenteError,
  PerfilUsuario,
  UsernameOcupadoError,
  userRepository,
} from '../repositories/userRepository';
import { swaggerDocument } from '../swagger';

const usuarioGoogle: UsuarioAutenticado = {
  uid: 'uid-123',
  email: 'ana@correo.com',
  nombre: 'Ana Pérez',
  foto: 'https://foto.google/ana.png',
  proveedor: 'google.com',
};

const datosValidos = { nombres: 'Ana', apellidos: 'Pérez', username: 'ana_qa01' };

function conSesion() {
  vi.spyOn(tokenVerifier, 'verify').mockResolvedValue(usuarioGoogle);
}

describe('TS-01 · Verificación de sesión (401)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('responde 401 si no se envía token', async () => {
    const res = await request(app).get('/api/usuarios/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Debes iniciar sesión para continuar.');
  });

  it('responde 401 si el encabezado no es Bearer', async () => {
    const res = await request(app).get('/api/usuarios/me').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
  });

  it('responde 401 si Firebase rechaza el token', async () => {
    vi.spyOn(tokenVerifier, 'verify').mockRejectedValue(new Error('auth/id-token-expired'));
    const res = await request(app).get('/api/usuarios/me').set('Authorization', 'Bearer vencido');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Vuelve a iniciar sesión/);
  });

  it('POST /api/usuarios también exige sesión', async () => {
    const res = await request(app).post('/api/usuarios').send(datosValidos);
    expect(res.status).toBe(401);
  });
});

describe('TS-01 · GET /api/usuarios/me', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('devuelve 404 PERFIL_INCOMPLETO si aún no eligió nombre de usuario (flujo Google)', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(null);

    const res = await request(app).get('/api/usuarios/me').set('Authorization', 'Bearer ok');
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('PERFIL_INCOMPLETO');
  });

  it('devuelve 200 con el perfil cuando existe', async () => {
    conSesion();
    const perfil = { uid: 'uid-123', username: 'ana_qa01' } as PerfilUsuario;
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfil);

    const res = await request(app).get('/api/usuarios/me').set('Authorization', 'Bearer ok');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('ana_qa01');
  });

  it('devuelve 503 si Firestore falla', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockRejectedValue(new Error('down'));

    const res = await request(app).get('/api/usuarios/me').set('Authorization', 'Bearer ok');
    expect(res.status).toBe(503);
  });
});

describe('TS-01 · POST /api/usuarios (crear perfil)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('crea el perfil con el correo del token y la foto de Google (201)', async () => {
    conSesion();
    const crear = vi
      .spyOn(userRepository, 'crearPerfil')
      .mockImplementation(async (p: PerfilUsuario) => p);

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', 'Bearer ok')
      .send({ ...datosValidos, email: 'intento@cambiar.com' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uid: 'uid-123',
      username: 'ana_qa01',
      email: 'ana@correo.com',
      avatarUrl: 'https://foto.google/ana.png',
      proveedor: 'google.com',
    });
    expect(crear).toHaveBeenCalledOnce();
  });

  it('valida en el servidor: campos vacíos devuelven un error por campo (400)', async () => {
    conSesion();
    const crear = vi.spyOn(userRepository, 'crearPerfil');

    const res = await request(app).post('/api/usuarios').set('Authorization', 'Bearer ok').send({});

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errores).sort()).toEqual(['apellidos', 'nombres', 'username']);
    expect(crear).not.toHaveBeenCalled();
  });

  it.each(['ab', 'ana perez', 'ana!', 'a'.repeat(21)])(
    'rechaza el nombre de usuario con formato inválido: %s',
    async (username) => {
      conSesion();
      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', 'Bearer ok')
        .send({ ...datosValidos, username });

      expect(res.status).toBe(400);
      expect(res.body.errores.username).toMatch(/entre 3 y 20/);
    }
  );

  it('rechaza un avatar que no es un enlace https (400)', async () => {
    conSesion();
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', 'Bearer ok')
      .send({ ...datosValidos, avatarUrl: 'javascript:alert(1)' });

    expect(res.status).toBe(400);
    expect(res.body.errores.avatarUrl).toBeDefined();
  });

  it('nombre de usuario ocupado devuelve 409 con el error en el campo', async () => {
    conSesion();
    vi.spyOn(userRepository, 'crearPerfil').mockRejectedValue(new UsernameOcupadoError());

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', 'Bearer ok')
      .send(datosValidos);

    expect(res.status).toBe(409);
    expect(res.body.errores.username).toBe('Ese nombre de usuario ya está en uso. Prueba con otro.');
  });

  it('si la cuenta ya tiene perfil devuelve 409', async () => {
    conSesion();
    vi.spyOn(userRepository, 'crearPerfil').mockRejectedValue(new PerfilExistenteError());

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', 'Bearer ok')
      .send(datosValidos);

    expect(res.status).toBe(409);
  });

  it('JSON mal formado devuelve 400 con mensaje claro', async () => {
    conSesion();
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', 'Bearer ok')
      .set('Content-Type', 'application/json')
      .send('{"nombres": ');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON/);
  });
});

describe('TS-01 · GET /api/usuarios/disponible', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('dice si el nombre de usuario está libre', async () => {
    vi.spyOn(userRepository, 'usernameDisponible').mockResolvedValue(false);
    const res = await request(app).get('/api/usuarios/disponible?username=Ana_QA01');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ disponible: false });
  });

  it('rechaza un formato inválido sin consultar la base de datos (400)', async () => {
    const consulta = vi.spyOn(userRepository, 'usernameDisponible');
    const res = await request(app).get('/api/usuarios/disponible?username=a b');
    expect(res.status).toBe(400);
    expect(consulta).not.toHaveBeenCalled();
  });
});

describe('TS-01 · Swagger', () => {
  it('documenta los endpoints de usuarios y el esquema bearer', () => {
    expect(Object.keys(swaggerDocument.paths)).toEqual(
      expect.arrayContaining(['/api/usuarios', '/api/usuarios/me', '/api/usuarios/disponible'])
    );
    expect(swaggerDocument.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });
});
