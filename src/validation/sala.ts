export const AMBIENTES = ['ninguno', 'blue', 'green'] as const;
export type Ambiente = (typeof AMBIENTES)[number];

/** Letras y números sin los que se confunden (0/O, 1/I/L). */
export const ALFABETO_ID_SALA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LARGO_ID_SALA = 8;
const ID_SALA_REGEX = new RegExp(`^[${ALFABETO_ID_SALA}]{${LARGO_ID_SALA}}$`);

export interface DatosSala {
  nombre: string;
  ambiente: Ambiente;
}

export type ResultadoSala<T> =
  | { ok: true; datos: T }
  | { ok: false; errores: Partial<Record<keyof DatosSala, string>>; error?: string };

/** Normaliza el ID que escribe la persona (sin espacios, en mayúsculas). Null si no tiene el formato. */
export function normalizarIdSala(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const id = valor.trim().toUpperCase();
  return ID_SALA_REGEX.test(id) ? id : null;
}

function validarNombreSala(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.trim() === '') return 'Escribe el nombre de la sala.';
  const largo = valor.trim().length;
  if (largo < 3 || largo > 50) return 'El nombre de la sala debe tener entre 3 y 50 caracteres.';
  return null;
}

function validarAmbiente(valor: unknown): string | null {
  return typeof valor === 'string' && (AMBIENTES as readonly string[]).includes(valor)
    ? null
    : 'Elige un ambiente válido: ninguno, blue o green.';
}

/** POST /api/salas: nombre obligatorio (3 a 50), ambiente opcional (por defecto «ninguno»). */
export function validarNuevaSala(body: unknown): ResultadoSala<DatosSala> {
  const entrada = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const errores: Partial<Record<keyof DatosSala, string>> = {};

  const errNombre = validarNombreSala(entrada.nombre);
  if (errNombre) errores.nombre = errNombre;

  const ambiente = entrada.ambiente ?? 'ninguno';
  const errAmbiente = validarAmbiente(ambiente);
  if (errAmbiente) errores.ambiente = errAmbiente;

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    datos: { nombre: (entrada.nombre as string).trim(), ambiente: ambiente as Ambiente },
  };
}

/** PATCH /api/salas/:id: solo se revisan los campos enviados. */
export function validarEdicionSala(body: unknown): ResultadoSala<Partial<DatosSala>> {
  const entrada = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (entrada.nombre === undefined && entrada.ambiente === undefined) {
    return { ok: false, errores: {}, error: 'No enviaste ningún cambio.' };
  }

  const errores: Partial<Record<keyof DatosSala, string>> = {};
  const datos: Partial<DatosSala> = {};

  if (entrada.nombre !== undefined) {
    const e = validarNombreSala(entrada.nombre);
    if (e) errores.nombre = e;
    else datos.nombre = (entrada.nombre as string).trim();
  }
  if (entrada.ambiente !== undefined) {
    const e = validarAmbiente(entrada.ambiente);
    if (e) errores.ambiente = e;
    else datos.ambiente = entrada.ambiente as Ambiente;
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return { ok: true, datos };
}
