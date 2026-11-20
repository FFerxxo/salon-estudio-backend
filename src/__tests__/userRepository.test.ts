import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeFirestore } from './fakeFirestore';
import { userRepository, UsernameOcupadoError } from '../repositories/userRepository';

const fake = vi.hoisted(() => ({ db: null as unknown as FakeFirestore }));
vi.mock('../config/firebase', () => ({ getDb: () => fake.db }));

const base = {
  nombres: 'Ana',
  apellidos: 'Pérez',
  email: 'ana@correo.com',
  avatarUrl: null,
  proveedor: 'password',
  creadoEn: '2026-11-01T00:00:00.000Z',
};

describe('US-04 · userRepository.actualizarPerfil (transacción en Firestore)', () => {
  beforeEach(async () => {
    fake.db = new FakeFirestore();
    await userRepository.crearPerfil({ ...base, uid: 'uid-ana', username: 'ana_perez' });
    await userRepository.crearPerfil({ ...base, uid: 'uid-luis', username: 'luis_g' });
  });

  it('al cambiar el nombre de usuario reserva el nuevo y libera el anterior', async () => {
    await userRepository.actualizarPerfil('uid-ana', { username: 'Ana_Nueva' });

    expect(fake.db.datos.get('usernames/ana_nueva')).toEqual({ uid: 'uid-ana' });
    expect(fake.db.datos.has('usernames/ana_perez')).toBe(false);
    expect(fake.db.datos.get('users/uid-ana')?.username).toBe('Ana_Nueva');
  });

  it('no deja tomar el nombre de usuario de otra persona y no cambia nada', async () => {
    await expect(
      userRepository.actualizarPerfil('uid-ana', { username: 'LUIS_G', nombres: 'X' })
    ).rejects.toBeInstanceOf(UsernameOcupadoError);

    expect(fake.db.datos.get('usernames/luis_g')).toEqual({ uid: 'uid-luis' });
    expect(fake.db.datos.get('usernames/ana_perez')).toEqual({ uid: 'uid-ana' });
    expect(fake.db.datos.get('users/uid-ana')?.nombres).toBe('Ana');
  });

  it('cambiar solo mayúsculas del propio usuario no toca la reserva', async () => {
    await userRepository.actualizarPerfil('uid-ana', { username: 'Ana_Perez' });
    expect(fake.db.datos.get('usernames/ana_perez')).toEqual({ uid: 'uid-ana' });
    expect(fake.db.datos.get('users/uid-ana')?.username).toBe('Ana_Perez');
  });
});

describe('US-05 · userRepository.eliminarDatos', () => {
  beforeEach(async () => {
    fake.db = new FakeFirestore();
    await userRepository.crearPerfil({ ...base, uid: 'uid-ana', username: 'ana_perez' });
    await userRepository.crearPerfil({ ...base, uid: 'uid-luis', username: 'luis_g' });
    fake.db.datos.set('rooms/SALA0001', { nombre: 'Cálculo', anfitrionUid: 'uid-ana' });
    fake.db.datos.set('rooms/SALA0001/messages/m1', { texto: 'hola', autorUid: 'uid-luis' });
    fake.db.datos.set('rooms/SALA0002', { nombre: 'Física', anfitrionUid: 'uid-luis' });
  });

  it('borra perfil, nombre de usuario y salas propias con sus mensajes', async () => {
    const r = await userRepository.eliminarDatos('uid-ana');

    expect(r.salasEliminadas).toBe(1);
    expect(fake.db.datos.has('users/uid-ana')).toBe(false);
    expect(fake.db.datos.has('usernames/ana_perez')).toBe(false);
    expect(fake.db.datos.has('rooms/SALA0001')).toBe(false);
    expect(fake.db.datos.has('rooms/SALA0001/messages/m1')).toBe(false);
  });

  it('no toca los datos ni las salas de otras personas', async () => {
    await userRepository.eliminarDatos('uid-ana');

    expect(fake.db.datos.has('users/uid-luis')).toBe(true);
    expect(fake.db.datos.get('usernames/luis_g')).toEqual({ uid: 'uid-luis' });
    expect(fake.db.datos.has('rooms/SALA0002')).toBe(true);
  });

  it('el nombre de usuario queda libre para otra persona', async () => {
    await userRepository.eliminarDatos('uid-ana');
    expect(await userRepository.usernameDisponible('ana_perez')).toBe(true);
  });

  it('funciona aunque la cuenta no tenga perfil (entró con Google y no terminó)', async () => {
    await expect(userRepository.eliminarDatos('uid-sin-perfil')).resolves.toEqual({
      salasEliminadas: 0,
    });
  });
});
