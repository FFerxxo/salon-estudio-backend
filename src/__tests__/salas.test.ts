import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenVerifier, UsuarioAutenticado } from '../middleware/auth';
import { Sala, salaRepository } from '../repositories/salaRepository';
import { PerfilUsuario, userRepository } from '../repositories/userRepository';

const ana: UsuarioAutenticado = {
  uid: 'uid-ana',
  email: 'ana@correo.com',
  nombre: null,
  foto: null,
  proveedor: 'password',
};
const luis: UsuarioAutenticado = { ...ana, uid: 'uid-luis', email: 'luis@correo.com' };

const perfilAna = { uid: 'uid-ana', username: 'ana_perez' } as PerfilUsuario;

const salaDeAna: Sala = {
  id: 'K7PQ2XMB',
  nombre: 'Cálculo II',
  ambiente: 'blue',
  anfitrionUid: 'uid-ana',
  anfitrionUsername: 'ana_perez',
  creadaEn: '2026-11-10T10:00:00.000Z',
};

function como(usuario: UsuarioAutenticado) {
  vi.spyOn(tokenVerifier, 'verify').mockResolvedValue(usuario);
}

const auth = { Authorization: 'Bearer ok' };

describe('US-06 · Salas: sesión obligatoria', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ['post', '/api/salas'],
    ['get', '/api/salas/mias'],
    ['get', '/api/salas/K7PQ2XMB'],
    ['patch', '/api/salas/K7PQ2XMB'],
    ['delete', '/api/salas/K7PQ2XMB'],
  ] as const)('%s %s sin token responde 401', async (metodo, ruta) => {
    const res = await request(app)[metodo](ruta);
    expect(res.status).toBe(401);
  });
});

describe('US-06 · POST /api/salas (crear sala)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('crea la sala con el usuario del token como anfitrión (201)', async () => {
    como(ana);
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    const crear = vi
      .spyOn(salaRepository, 'crear')
      .mockImplementation(async (datos) => ({ id: 'K7PQ2XMB', ...datos }));

    const res = await request(app)
      .post('/api/salas')
      .set(auth)
      .send({ nombre: '  Cálculo II ', ambiente: 'green', anfitrionUid: 'uid-luis' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'K7PQ2XMB',
      nombre: 'Cálculo II',
      ambiente: 'green',
      anfitrionUid: 'uid-ana',
      anfitrionUsername: 'ana_perez',
    });
    expect(crear).toHaveBeenCalledOnce();
  });

  it('si no se envía ambiente queda «ninguno»', async () => {
    como(ana);
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    vi.spyOn(salaRepository, 'crear').mockImplementation(async (d) => ({ id: 'K7PQ2XMB', ...d }));

    const res = await request(app).post('/api/salas').set(auth).send({ nombre: 'Física' });
    expect(res.body.ambiente).toBe('ninguno');
  });

  it.each(['', 'ab', 'x'.repeat(51), '   '])('rechaza el nombre «%s» (400)', async (nombre) => {
    como(ana);
    const crear = vi.spyOn(salaRepository, 'crear');
    const res = await request(app).post('/api/salas').set(auth).send({ nombre });
    expect(res.status).toBe(400);
    expect(res.body.errores.nombre).toBeDefined();
    expect(crear).not.toHaveBeenCalled();
  });

  it('rechaza un ambiente que no existe (400)', async () => {
    como(ana);
    const res = await request(app)
      .post('/api/salas')
      .set(auth)
      .send({ nombre: 'Física', ambiente: 'red' });
    expect(res.status).toBe(400);
    expect(res.body.errores.ambiente).toMatch(/ninguno, blue o green/);
  });

  it('sin perfil (sin nombre de usuario) responde 404 PERFIL_INCOMPLETO', async () => {
    como(ana);
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(null);
    const res = await request(app).post('/api/salas').set(auth).send({ nombre: 'Física' });
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('PERFIL_INCOMPLETO');
  });

  it('si Firestore falla responde 503', async () => {
    como(ana);
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    vi.spyOn(salaRepository, 'crear').mockRejectedValue(new Error('down'));
    const res = await request(app).post('/api/salas').set(auth).send({ nombre: 'Física' });
    expect(res.status).toBe(503);
  });
});

describe('US-06 · GET /api/salas/mias', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lista solo las salas del usuario del token', async () => {
    como(ana);
    const listar = vi.spyOn(salaRepository, 'listarDeAnfitrion').mockResolvedValue([salaDeAna]);

    const res = await request(app).get('/api/salas/mias').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.salas).toHaveLength(1);
    expect(listar).toHaveBeenCalledWith('uid-ana');
  });

  it('sin salas devuelve una lista vacía (el panel muestra el mensaje amigable)', async () => {
    como(ana);
    vi.spyOn(salaRepository, 'listarDeAnfitrion').mockResolvedValue([]);
    const res = await request(app).get('/api/salas/mias').set(auth);
    expect(res.body).toEqual({ salas: [] });
  });
});

describe('US-06 · GET /api/salas/:id', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('devuelve la sala; acepta el ID en minúsculas o con espacios', async () => {
    como(luis);
    const obtener = vi.spyOn(salaRepository, 'obtener').mockResolvedValue(salaDeAna);

    const res = await request(app).get('/api/salas/k7pq2xmb').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Cálculo II');
    expect(obtener).toHaveBeenCalledWith('K7PQ2XMB');
  });

  it('404 SALA_NO_ENCONTRADA si no existe', async () => {
    como(ana);
    vi.spyOn(salaRepository, 'obtener').mockResolvedValue(null);
    const res = await request(app).get('/api/salas/ZZZZZZZZ').set(auth);
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('SALA_NO_ENCONTRADA');
  });

  it('404 sin consultar Firestore si el ID no tiene el formato', async () => {
    como(ana);
    const obtener = vi.spyOn(salaRepository, 'obtener');
    const res = await request(app).get('/api/salas/abc').set(auth);
    expect(res.status).toBe(404);
    expect(obtener).not.toHaveBeenCalled();
  });
});

describe('Permisos: solo el anfitrión cambia o elimina su sala', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('otra persona no puede editar la sala (403) y no se toca Firestore', async () => {
    como(luis);
    vi.spyOn(salaRepository, 'obtener').mockResolvedValue(salaDeAna);
    const actualizar = vi.spyOn(salaRepository, 'actualizar');

    const res = await request(app).patch('/api/salas/K7PQ2XMB').set(auth).send({ nombre: 'Mía' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Solo quien creó la sala puede cambiarla o eliminarla.');
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('otra persona no puede eliminar la sala (403)', async () => {
    como(luis);
    vi.spyOn(salaRepository, 'obtener').mockResolvedValue(salaDeAna);
    const eliminar = vi.spyOn(salaRepository, 'eliminar');

    const res = await request(app).delete('/api/salas/K7PQ2XMB').set(auth);

    expect(res.status).toBe(403);
    expect(eliminar).not.toHaveBeenCalled();
  });

  it('el anfitrión sí puede editarla (200)', async () => {
    como(ana);
    vi.spyOn(salaRepository, 'obtener').mockResolvedValue(salaDeAna);
    const actualizar = vi.spyOn(salaRepository, 'actualizar').mockResolvedValue();

    const res = await request(app)
      .patch('/api/salas/K7PQ2XMB')
      .set(auth)
      .send({ nombre: 'Cálculo III', ambiente: 'ninguno' });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Cálculo III');
    expect(actualizar).toHaveBeenCalledWith('K7PQ2XMB', { nombre: 'Cálculo III', ambiente: 'ninguno' });
  });

  it('el anfitrión sí puede eliminarla (200)', async () => {
    como(ana);
    vi.spyOn(salaRepository, 'obtener').mockResolvedValue(salaDeAna);
    const eliminar = vi.spyOn(salaRepository, 'eliminar').mockResolvedValue();

    const res = await request(app).delete('/api/salas/K7PQ2XMB').set(auth);

    expect(res.status).toBe(200);
    expect(eliminar).toHaveBeenCalledWith('K7PQ2XMB');
  });

  it('editar sin cambios responde 400', async () => {
    como(ana);
    const res = await request(app).patch('/api/salas/K7PQ2XMB').set(auth).send({});
    expect(res.status).toBe(400);
  });
});

describe('Sprint 2 · Swagger', () => {
  it('documenta los endpoints nuevos de perfil y salas', async () => {
    const { swaggerDocument } = await import('../swagger');
    const paths = swaggerDocument.paths as Record<string, Record<string, unknown>>;
    expect(Object.keys(paths['/api/usuarios/me'])).toEqual(
      expect.arrayContaining(['get', 'patch', 'delete'])
    );
    expect(paths['/api/salas'].post).toBeDefined();
    expect(paths['/api/salas/mias'].get).toBeDefined();
    expect(Object.keys(paths['/api/salas/{id}'])).toEqual(['get', 'patch', 'delete']);
  });
});
