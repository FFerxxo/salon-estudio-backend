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

  it('anonimiza los mensajes de A en salas de B sin tocar los mensajes de B ni la sala de B', async () => {
    fake.db.datos.set('rooms/SALA0001/messages/m-propio', {
      texto: 'mi sala',
      autorUid: 'uid-ana',
      autorUsername: 'ana_perez',
      creadoEn: '2026-11-20T10:00:00.000Z',
    });
    fake.db.datos.set('rooms/SALA0002/messages/m-ana', {
      texto: 'hola Luis',
      autorUid: 'uid-ana',
      autorUsername: 'ana_perez',
      creadoEn: '2026-11-20T10:05:00.000Z',
    });
    fake.db.datos.set('rooms/SALA0002/messages/m-luis', {
      texto: 'hola Ana',
      autorUid: 'uid-luis',
      autorUsername: 'luis_g',
      creadoEn: '2026-11-20T10:06:00.000Z',
    });

    await userRepository.eliminarDatos('uid-ana');

    expect(fake.db.datos.has('rooms/SALA0001')).toBe(false);
    expect(fake.db.datos.has('rooms/SALA0001/messages/m-propio')).toBe(false);

    const msgAnaEnB = fake.db.datos.get('rooms/SALA0002/messages/m-ana');
    expect(msgAnaEnB).toBeDefined();
    expect(msgAnaEnB).toEqual({
      texto: 'hola Luis',
      autorUsername: 'Cuenta eliminada',
      autorEliminado: true,
      creadoEn: '2026-11-20T10:05:00.000Z',
    });
    expect('autorUid' in (msgAnaEnB as Record<string, unknown>)).toBe(false);

    expect(fake.db.datos.get('rooms/SALA0002/messages/m-luis')).toEqual({
      texto: 'hola Ana',
      autorUid: 'uid-luis',
      autorUsername: 'luis_g',
      creadoEn: '2026-11-20T10:06:00.000Z',
    });
  });

  it('anonimiza más de 500 mensajes en lotes de hasta 500 y tolera reintento', async () => {
    for (let i = 0; i < 505; i++) {
      fake.db.datos.set(`rooms/SALA0002/messages/m-${i}`, {
        texto: `msg ${i}`,
        autorUid: 'uid-ana',
        autorUsername: 'ana_perez',
        creadoEn: '2026-11-20T10:00:00.000Z',
      });
    }
    const batchSpy = vi.spyOn(fake.db, 'batch');

    await userRepository.eliminarDatos('uid-ana');

    expect(batchSpy).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 505; i++) {
      const msg = fake.db.datos.get(`rooms/SALA0002/messages/m-${i}`) as Record<string, unknown>;
      expect(msg.autorUsername).toBe('Cuenta eliminada');
      expect(msg.autorEliminado).toBe(true);
      expect('autorUid' in msg).toBe(false);
    }

    // Reintento idempotente
    await expect(userRepository.eliminarDatos('uid-ana')).resolves.toEqual({
      salasEliminadas: 0,
    });
  });

  it('si falla la anonimización no libera todavía el username ni borra el perfil', async () => {
    vi.spyOn(fake.db, 'collectionGroup').mockImplementationOnce(() => {
      throw new Error('index missing');
    });

    await expect(userRepository.eliminarDatos('uid-ana')).rejects.toThrow('index missing');
    expect(fake.db.datos.has('users/uid-ana')).toBe(true);
    expect(fake.db.datos.has('usernames/ana_perez')).toBe(true);
  });
});
