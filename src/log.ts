/**
 * Registro mínimo de errores para los logs de Render.
 * Solo se guarda dónde pasó y el código del error: nunca correos, nombres de usuario,
 * contraseñas ni tokens.
 */
export function registrarError(contexto: string, error: unknown) {
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    code?: unknown;
    name?: unknown;
  };
  console.error(
    JSON.stringify({
      nivel: 'error',
      servicio: 'api',
      contexto,
      codigo: e.code !== undefined ? String(e.code) : undefined,
      tipo: typeof e.name === 'string' ? e.name : typeof error,
      fecha: new Date().toISOString(),
    })
  );
}
