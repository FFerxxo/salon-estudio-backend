import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeFirestore } from './fakeFirestore';
import { generarIdSala, IdSalaAgotadoError, salaRepository } from '../repositories/salaRepository';
import { normalizarIdSala } from '../validation/sala';

const fake = vi.hoisted(() => ({ db: null as unknown as FakeFirestore }));
vi.mock('../config/firebase', () => ({ getDb: () => fake.db }));

const datos = {
  nombre: 'Cálculo II',
  ambiente: 'ninguno' as const,
  anfitrionUid: 'uid-ana',
  anfitrionUsername: 'ana_perez',
  creadaEn: '2026-11-10T10:00:00.000Z',
};

describe('US-06 · salaRepository', () => {
  beforeEach(() => {
    fake.db = new FakeFirestore();
  });

  it('genera IDs de 8 caracteres válidos y distintos', () => {
    const ids = new Set(Array.from({ length: 500 }, generarIdSala));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(normalizarIdSala(id)).toBe(id);
  });

  it('guarda la sala en rooms/{id}', async () => {
    const sala = await salaRepository.crear(datos, () => 'AAAA2222');
    expect(sala.id).toBe('AAAA2222');
    expect(fake.db.datos.get('rooms/AAAA2222')).toMatchObject({ nombre: 'Cálculo II' });
  });

  it('si el ID ya existe prueba con otro: nunca sobrescribe otra sala', async () => {
    fake.db.datos.set('rooms/AAAA2222', { ...datos, nombre: 'Sala existente' });
    const ids = ['AAAA2222', 'BBBB3333'];

    const sala = await salaRepository.crear(datos, () => ids.shift() as string);

    expect(sala.id).toBe('BBBB3333');
    expect(fake.db.datos.get('rooms/AAAA2222')?.nombre).toBe('Sala existente');
  });

  it('falla de forma controlada si no logra un ID libre', async () => {
    fake.db.datos.set('rooms/AAAA2222', datos);
    await expect(salaRepository.crear(datos, () => 'AAAA2222')).rejects.toBeInstanceOf(
      IdSalaAgotadoError
    );
  });

  it('lista solo las salas del anfitrión, la más reciente primero', async () => {
    await salaRepository.crear({ ...datos, creadaEn: '2026-11-01T00:00:00Z' }, () => 'AAAA2222');
    await salaRepository.crear({ ...datos, creadaEn: '2026-11-05T00:00:00Z' }, () => 'BBBB3333');
    await salaRepository.crear({ ...datos, anfitrionUid: 'uid-luis' }, () => 'CCCC4444');

    const salas = await salaRepository.listarDeAnfitrion('uid-ana');
    expect(salas.map((s) => s.id)).toEqual(['BBBB3333', 'AAAA2222']);
  });

  it('eliminar borra la sala y sus mensajes', async () => {
    await salaRepository.crear(datos, () => 'AAAA2222');
    fake.db.datos.set('rooms/AAAA2222/messages/m1', { texto: 'hola' });

    await salaRepository.eliminar('AAAA2222');

    expect(fake.db.datos.size).toBe(0);
  });
});
