/**
 * Registro mínimo de errores para los logs de Render.
 * Solo se guarda dónde pasó y el código del error: nunca correos, nombres, textos
 * de mensajes ni tokens.
 */
export function registrarError(contexto: string, error: unknown) {
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    code?: unknown;
    name?: unknown;
  };
  console.error(
    JSON.stringify({
      nivel: 'error',
      servicio: 'realtime',
      contexto,
      codigo: e.code !== undefined ? String(e.code) : undefined,
      tipo: typeof e.name === 'string' ? e.name : typeof error,
      fecha: new Date().toISOString(),
    })
  );
}
