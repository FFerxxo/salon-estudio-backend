/** Entre 3 y 20 letras, números o guion bajo, sin espacios. */
export const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

export interface DatosPerfil {
  nombres: string;
  apellidos: string;
  username: string;
  avatarUrl: string | null;
}

export type ErroresCampo = Partial<Record<keyof DatosPerfil, string>>;

export type ResultadoValidacion =
  | { ok: true; datos: DatosPerfil }
  | { ok: false; errores: ErroresCampo };

export function validarUsername(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.trim() === '') {
    return 'Escribe un nombre de usuario.';
  }
  if (!USERNAME_REGEX.test(valor.trim())) {
    return 'Usa entre 3 y 20 letras, números o guion bajo (_), sin espacios.';
  }
  return null;
}

function validarNombre(valor: unknown, campo: string): string | null {
  if (typeof valor !== 'string' || valor.trim() === '') {
    return `Escribe tus ${campo}.`;
  }
  if (valor.trim().length > 50) {
    return `Tus ${campo} pueden tener máximo 50 caracteres.`;
  }
  return null;
}

function validarAvatar(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || valor.length > 500) {
    return 'El avatar debe ser un enlace válido que empiece por https://';
  }
  try {
    const url = new URL(valor);
    return url.protocol === 'https:'
      ? null
      : 'El avatar debe ser un enlace válido que empiece por https://';
  } catch {
    return 'El avatar debe ser un enlace válido que empiece por https://';
  }
}

/** Valida en el servidor los datos para crear un perfil (no basta con validar en la pantalla). */
export function validarPerfil(body: unknown): ResultadoValidacion {
  const datos = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const errores: ErroresCampo = {};

  const errNombres = validarNombre(datos.nombres, 'nombres');
  if (errNombres) errores.nombres = errNombres;

  const errApellidos = validarNombre(datos.apellidos, 'apellidos');
  if (errApellidos) errores.apellidos = errApellidos;

  const errUsername = validarUsername(datos.username);
  if (errUsername) errores.username = errUsername;

  const errAvatar = validarAvatar(datos.avatarUrl);
  if (errAvatar) errores.avatarUrl = errAvatar;

  if (Object.keys(errores).length > 0) {
    return { ok: false, errores };
  }

  return {
    ok: true,
    datos: {
      nombres: (datos.nombres as string).trim(),
      apellidos: (datos.apellidos as string).trim(),
      username: (datos.username as string).trim(),
      avatarUrl: (datos.avatarUrl as string | undefined) || null,
    },
  };
}

/** Formato básico de correo (Firebase hace la validación final). */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DatosEdicion {
  nombres?: string;
  apellidos?: string;
  username?: string;
  email?: string;
  avatarUrl?: string | null;
}

export type ResultadoEdicion =
  | { ok: true; datos: DatosEdicion }
  | { ok: false; errores: Partial<Record<keyof DatosEdicion, string>>; error?: string };

const CAMPOS_EDITABLES: (keyof DatosEdicion)[] = [
  'nombres',
  'apellidos',
  'username',
  'email',
  'avatarUrl',
];

export function validarEmail(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.trim() === '') return 'Escribe tu correo.';
  if (valor.trim().length > 254 || !EMAIL_REGEX.test(valor.trim())) {
    return 'Escribe un correo válido, por ejemplo nombre@correo.com.';
  }
  return null;
}

/**
 * Valida en el servidor los cambios del perfil (PATCH): solo se revisan los campos enviados.
 * El correo solo se puede cambiar en cuentas creadas con correo y contraseña.
 */
export function validarEdicion(body: unknown, proveedor: string): ResultadoEdicion {
  const entrada = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const enviados = CAMPOS_EDITABLES.filter((campo) => entrada[campo] !== undefined);

  if (enviados.length === 0) {
    return { ok: false, errores: {}, error: 'No enviaste ningún cambio.' };
  }

  const errores: Partial<Record<keyof DatosEdicion, string>> = {};
  const datos: DatosEdicion = {};

  if (entrada.nombres !== undefined) {
    const e = validarNombre(entrada.nombres, 'nombres');
    if (e) errores.nombres = e;
    else datos.nombres = (entrada.nombres as string).trim();
  }
  if (entrada.apellidos !== undefined) {
    const e = validarNombre(entrada.apellidos, 'apellidos');
    if (e) errores.apellidos = e;
    else datos.apellidos = (entrada.apellidos as string).trim();
  }
  if (entrada.username !== undefined) {
    const e = validarUsername(entrada.username);
    if (e) errores.username = e;
    else datos.username = (entrada.username as string).trim();
  }
  if (entrada.email !== undefined) {
    if (proveedor !== 'password') {
      errores.email = 'Tu cuenta es de Google: el correo se cambia en tu cuenta de Google.';
    } else {
      const e = validarEmail(entrada.email);
      if (e) errores.email = e;
      else datos.email = (entrada.email as string).trim().toLowerCase();
    }
  }
  if (entrada.avatarUrl !== undefined) {
    const e = validarAvatar(entrada.avatarUrl);
    if (e) errores.avatarUrl = e;
    else datos.avatarUrl = (entrada.avatarUrl as string | null) || null;
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return { ok: true, datos };
}
