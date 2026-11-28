import { describe, it, expect, vi, afterEach } from 'vitest';
import { registrarError } from '../log';

describe('Registro de errores (S3-C07)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('escribe una línea JSON con el contexto y el código, sin el texto del error', () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('ana@correo.com escribió «hola»'), { code: 14 });

    registrarError('chat:enviar', error);

    const linea = String(espia.mock.calls[0][0]);
    expect(JSON.parse(linea)).toMatchObject({
      nivel: 'error',
      servicio: 'realtime',
      contexto: 'chat:enviar',
      codigo: '14',
      tipo: 'Error',
    });
    expect(linea).not.toContain('ana@correo.com');
    expect(linea).not.toContain('hola');
  });
});
