/**
 * Límite de intentos fallidos de ingreso, en memoria.
 *
 * Cuenta los intentos fallidos por IP y por nombre de usuario dentro de una ventana de tiempo.
 * Al llegar al máximo, se rechazan los intentos (429) hasta que pase la ventana.
 * Un ingreso correcto borra el contador de ese usuario en esa IP.
 */
export class LimiteIntentos {
  private intentos = new Map<string, { fallos: number; desde: number }>();

  constructor(
    private maximo = 5,
    private ventanaMs = 15 * 60 * 1000,
    private ahora: () => number = Date.now
  ) {}

  private clave(ip: string, usuario: string) {
    return `${ip}|${usuario.toLowerCase()}`;
  }

  private vigente(clave: string) {
    const registro = this.intentos.get(clave);
    if (registro && this.ahora() - registro.desde >= this.ventanaMs) {
      this.intentos.delete(clave);
      return undefined;
    }
    return registro;
  }

  /** Minutos que faltan para poder intentar de nuevo, o 0 si puede intentar ya. */
  minutosBloqueado(ip: string, usuario: string): number {
    const registro = this.vigente(this.clave(ip, usuario));
    if (!registro || registro.fallos < this.maximo) return 0;
    return Math.ceil((registro.desde + this.ventanaMs - this.ahora()) / 60000);
  }

  registrarFallo(ip: string, usuario: string) {
    const clave = this.clave(ip, usuario);
    const registro = this.vigente(clave) ?? { fallos: 0, desde: this.ahora() };
    registro.fallos++;
    this.intentos.set(clave, registro);
  }

  registrarExito(ip: string, usuario: string) {
    this.intentos.delete(this.clave(ip, usuario));
  }

  /** Borra los registros vencidos (para que la memoria no crezca). */
  limpiar() {
    for (const clave of [...this.intentos.keys()]) this.vigente(clave);
  }
}
