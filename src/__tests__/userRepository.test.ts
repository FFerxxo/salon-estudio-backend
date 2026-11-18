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
