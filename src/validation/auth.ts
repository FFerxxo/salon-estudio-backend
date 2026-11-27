export interface DatosIngresoUsuario {
  username: string;
  password: string;
}

export type ErroresIngresoUsuario = Partial<Record<keyof DatosIngresoUsuario, string>>;

export type ResultadoValidacionIngreso =
  | { ok: true; datos: DatosIngresoUsuario }
  | { ok: false; errores: ErroresIngresoUsuario };

/**
 * Valida las credenciales mínimas para iniciar sesión con nombre de usuario (US-02).
 * Acepta un `@` opcional al inicio del usuario y lo retira antes de buscarlo.
 */
export function validarIngresoUsuario(body: unknown): ResultadoValidacionIngreso {
  const entrada = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const errores: ErroresIngresoUsuario = {};

  const usernameLimpio =
    typeof entrada.username === 'string' ? entrada.username.trim().replace(/^@/, '') : '';
  if (!usernameLimpio || usernameLimpio.includes('/')) {
    errores.username = 'Escribe tu nombre de usuario.';
  }

  if (typeof entrada.password !== 'string' || entrada.password.trim() === '') {
    errores.password = 'Escribe tu contraseña.';
  }

  if (Object.keys(errores).length > 0) {
    return { ok: false, errores };
  }

  return {
    ok: true,
    datos: {
      username: usernameLimpio,
      password: entrada.password as string,
    },
  };
}
