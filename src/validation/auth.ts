export interface DatosIngresoUsuario {
  username: string;
  password: string;
}

export type ErroresIngresoUsuario = Partial<Record<keyof DatosIngresoUsuario, string>>;

export type ResultadoValidacionIngreso =
  | { ok: true; datos: DatosIngresoUsuario }
  | { ok: false; errores: ErroresIngresoUsuario };

/**
 * Normaliza el nombre de usuario al ingresar: recorta espacios, retira el `@` inicial
 * opcional y pasa a minúsculas.
 */
export function normalizarUsernameIngreso(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor.trim().replace(/^@/, '').toLowerCase();
}

/**
 * Valida las credenciales mínimas para iniciar sesión con nombre de usuario (US-02).
 * Acepta un `@` opcional al inicio del usuario y lo retira antes de buscarlo.
 */
export function validarIngresoUsuario(body: unknown): ResultadoValidacionIngreso {
  const entrada = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const errores: ErroresIngresoUsuario = {};

  const usernameLimpio = normalizarUsernameIngreso(entrada.username);
  if (!usernameLimpio) {
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
