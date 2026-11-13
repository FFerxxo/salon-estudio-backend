import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { appInfoRepository } from '../repositories/appInfoRepository';
import { swaggerDocument } from '../swagger';

describe('API Base Técnica (TS-00)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/health returns 200 OK', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/app-info returns 200 with data from repository', async () => {
    vi.spyOn(appInfoRepository, 'getAppInfo').mockResolvedValueOnce({
      nombre: 'Salón de Estudio',
      mensaje: 'Bienvenido',
    });

    const res = await request(app).get('/api/app-info');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      nombre: 'Salón de Estudio',
      mensaje: 'Bienvenido',
    });
  });

  it('GET /api/app-info returns 503 when repository throws an error', async () => {
    vi.spyOn(appInfoRepository, 'getAppInfo').mockRejectedValueOnce(
      new Error('Firestore connection error')
    );

    const res = await request(app).get('/api/app-info');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'No se pudo leer la base de datos. Intenta de nuevo.',
    });
  });

  it('GET /docs serves Swagger UI and documents both endpoints', async () => {
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
    expect(Object.keys(swaggerDocument.paths)).toEqual(
      expect.arrayContaining(['/api/health', '/api/app-info'])
    );
  });
});
