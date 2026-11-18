import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenVerifier, UsuarioAutenticado } from '../middleware/auth';
import { authRepository, CorreoOcupadoError } from '../repositories/authRepository';
import {
  PerfilUsuario,
  UsernameOcupadoError,
  userRepository,
} from '../repositories/userRepository';

const manual: UsuarioAutenticado = {
  uid: 'uid-ana',
  email: 'ana@correo.com',
  nombre: null,
  foto: null,
  proveedor: 'password',
};

const google: UsuarioAutenticado = { ...manual, uid: 'uid-luis', proveedor: 'google.com' };

const perfilAna: PerfilUsuario = {
  uid: 'uid-ana',
  nombres: 'Ana',
  apellidos: 'Pérez',
  username: 'ana_perez',
  email: 'ana@correo.com',
  avatarUrl: null,
  proveedor: 'password',
  creadoEn: '2026-11-01T00:00:00.000Z',
};

function conSesion(usuario: UsuarioAutenticado = manual) {
  vi.spyOn(tokenVerifier, 'verify').mockResolvedValue(usuario);
}

function patch(body: unknown) {
  return request(app).patch('/api/usuarios/me').set('Authorization', 'Bearer ok').send(body as object);
}

describe('US-04 · PATCH /api/usuarios/me (editar perfil)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('exige sesión (401)', async () => {
    const res = await request(app).patch('/api/usuarios/me').send({ nombres: 'Ana' });
    expect(res.status).toBe(401);
  });

  it('edita solo los campos enviados y responde el perfil actualizado (200)', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    const actualizar = vi
      .spyOn(userRepository, 'actualizarPerfil')
      .mockImplementation(async (_uid, cambios) => ({ ...perfilAna, ...cambios }));

    const res = await patch({ nombres: '  Ana María ' });

    expect(res.status).toBe(200);
    expect(res.body.nombres).toBe('Ana María');
    expect(actualizar).toHaveBeenCalledWith('uid-ana', { nombres: 'Ana María' });
  });

  it('siempre edita el perfil del token, aunque el cuerpo traiga otro uid', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    const actualizar = vi
      .spyOn(userRepository, 'actualizarPerfil')
      .mockImplementation(async (_uid, cambios) => ({ ...perfilAna, ...cambios }));

    await patch({ uid: 'uid-de-otra-persona', apellidos: 'Gómez' });

    expect(actualizar).toHaveBeenCalledWith('uid-ana', { apellidos: 'Gómez' });
  });

  it('sin cambios responde 400', async () => {
    conSesion();
    const res = await patch({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No enviaste ningún cambio.');
  });

  it('valida en el servidor y devuelve un error por campo (400)', async () => {
    conSesion();
    const actualizar = vi.spyOn(userRepository, 'actualizarPerfil');

    const res = await patch({ nombres: '', username: 'a b', email: 'no-es-correo' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errores).sort()).toEqual(['email', 'nombres', 'username']);
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('nombre de usuario repetido devuelve 409 en el campo username', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    vi.spyOn(userRepository, 'actualizarPerfil').mockRejectedValue(new UsernameOcupadoError());

    const res = await patch({ username: 'luis_g' });

    expect(res.status).toBe(409);
    expect(res.body.errores.username).toMatch(/ya está en uso/);
  });

  it('cambia el correo también en Firebase Authentication (cuenta manual)', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    vi.spyOn(userRepository, 'actualizarPerfil').mockImplementation(async (_u, c) => ({
      ...perfilAna,
      ...c,
    }));
    const cambiarCorreo = vi.spyOn(authRepository, 'actualizarCorreo').mockResolvedValue();

    const res = await patch({ email: 'Ana.Nueva@Correo.com' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('ana.nueva@correo.com');
    expect(cambiarCorreo).toHaveBeenCalledWith('uid-ana', 'ana.nueva@correo.com');
  });

  it('correo repetido devuelve 409 en el campo email y no toca Firestore', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    vi.spyOn(authRepository, 'actualizarCorreo').mockRejectedValue(new CorreoOcupadoError());
    const actualizar = vi.spyOn(userRepository, 'actualizarPerfil');

    const res = await patch({ email: 'luis@correo.com' });

    expect(res.status).toBe(409);
    expect(res.body.errores.email).toBe('Ese correo ya está registrado en otra cuenta.');
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('si Firestore falla después de cambiar el correo, devuelve el correo anterior (503)', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    vi.spyOn(userRepository, 'actualizarPerfil').mockRejectedValue(new Error('down'));
    const cambiarCorreo = vi.spyOn(authRepository, 'actualizarCorreo').mockResolvedValue();

    const res = await patch({ email: 'nuevo@correo.com' });

    expect(res.status).toBe(503);
    expect(cambiarCorreo).toHaveBeenLastCalledWith('uid-ana', 'ana@correo.com');
  });

  it('si el correo no cambia, no llama a Firebase Authentication', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(perfilAna);
    vi.spyOn(userRepository, 'actualizarPerfil').mockResolvedValue(perfilAna);
    const cambiarCorreo = vi.spyOn(authRepository, 'actualizarCorreo');

    const res = await patch({ email: 'ANA@correo.com' });

    expect(res.status).toBe(200);
    expect(cambiarCorreo).not.toHaveBeenCalled();
  });

  it('una cuenta de Google no puede cambiar el correo (400)', async () => {
    conSesion(google);
    const res = await patch({ email: 'otro@correo.com' });
    expect(res.status).toBe(400);
    expect(res.body.errores.email).toMatch(/Google/);
  });

  it('sin perfil creado responde 404 PERFIL_INCOMPLETO', async () => {
    conSesion();
    vi.spyOn(userRepository, 'getPerfil').mockResolvedValue(null);
    const res = await patch({ nombres: 'Ana' });
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('PERFIL_INCOMPLETO');
  });
});
