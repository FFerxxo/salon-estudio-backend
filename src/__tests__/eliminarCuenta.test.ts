import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { tokenVerifier, UsuarioAutenticado } from '../middleware/auth';
import { authRepository } from '../repositories/authRepository';
import { userRepository } from '../repositories/userRepository';

const ana: UsuarioAutenticado = {
  uid: 'uid-ana',
  email: 'ana@correo.com',
  nombre: null,
  foto: null,
  proveedor: 'password',
};

describe('US-05 · DELETE /api/usuarios/me (eliminar cuenta)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('exige sesión (401)', async () => {
    const res = await request(app).delete('/api/usuarios/me');
    expect(res.status).toBe(401);
  });

  it('borra los datos de Firestore y luego la cuenta de Firebase Authentication (200)', async () => {
    vi.spyOn(tokenVerifier, 'verify').mockResolvedValue(ana);
    const orden: string[] = [];
    vi.spyOn(userRepository, 'eliminarDatos').mockImplementation(async () => {
      orden.push('firestore');
      return { salasEliminadas: 2 };
    });
    vi.spyOn(authRepository, 'eliminarCuenta').mockImplementation(async () => {
      orden.push('auth');
    });

    const res = await request(app).delete('/api/usuarios/me').set('Authorization', 'Bearer ok');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensaje: 'Tu cuenta fue eliminada.', salasEliminadas: 2 });
    expect(orden).toEqual(['firestore', 'auth']);
    expect(userRepository.eliminarDatos).toHaveBeenCalledWith('uid-ana');
    expect(authRepository.eliminarCuenta).toHaveBeenCalledWith('uid-ana');
  });

  it('si Firestore falla no borra la cuenta de Authentication (503)', async () => {
    vi.spyOn(tokenVerifier, 'verify').mockResolvedValue(ana);
    vi.spyOn(userRepository, 'eliminarDatos').mockRejectedValue(new Error('down'));
    const borrarAuth = vi.spyOn(authRepository, 'eliminarCuenta');

    const res = await request(app).delete('/api/usuarios/me').set('Authorization', 'Bearer ok');

    expect(res.status).toBe(503);
    expect(borrarAuth).not.toHaveBeenCalled();
  });
});
