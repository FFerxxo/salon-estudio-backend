/**
 * Firestore en memoria, solo para las pruebas de los repositorios.
 * Implementa lo que usa la API: doc/get/set/update/delete/create, where/get,
 * subcolecciones, runTransaction y recursiveDelete.
 */
type Datos = Record<string, unknown>;

export class FakeFirestore {
  datos = new Map<string, Datos>();

  collection(ruta: string) {
    return new FakeCollection(this, ruta);
  }

  async runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    const copia = new Map(this.datos);
    try {
      return await fn(new FakeTx());
    } catch (error) {
      this.datos = copia;
      throw error;
    }
  }

  async recursiveDelete(ref: FakeDoc) {
    for (const ruta of [...this.datos.keys()]) {
      if (ruta === ref.path || ruta.startsWith(`${ref.path}/`)) this.datos.delete(ruta);
    }
  }

  batch() {
    const ops: (() => void)[] = [];
    return {
      delete: (ref: FakeDoc) => ops.push(() => this.datos.delete(ref.path)),
      commit: async () => ops.forEach((op) => op()),
    };
  }
}

class FakeSnap {
  constructor(
    public ref: FakeDoc,
    private valor: Datos | undefined
  ) {}
  get exists() {
    return this.valor !== undefined;
  }
  get id() {
    return this.ref.id;
  }
  data() {
    return this.valor ? { ...this.valor } : undefined;
  }
}

class FakeDoc {
  constructor(
    private db: FakeFirestore,
    public path: string
  ) {}
  get id() {
    return this.path.split('/').pop() as string;
  }
  collection(nombre: string) {
    return new FakeCollection(this.db, `${this.path}/${nombre}`);
  }
  async get() {
    return new FakeSnap(this, this.db.datos.get(this.path));
  }
  async set(valor: Datos) {
    this.db.datos.set(this.path, { ...valor });
  }
  async create(valor: Datos) {
    if (this.db.datos.has(this.path)) {
      throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    }
    this.db.datos.set(this.path, { ...valor });
  }
  async update(valor: Datos) {
    const actual = this.db.datos.get(this.path);
    if (!actual) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
    this.db.datos.set(this.path, { ...actual, ...valor });
  }
  async delete() {
    this.db.datos.delete(this.path);
  }
}

class FakeCollection {
  private filtros: [string, unknown][] = [];
  constructor(
    private db: FakeFirestore,
    private ruta: string
  ) {}
  doc(id: string) {
    return new FakeDoc(this.db, `${this.ruta}/${id}`);
  }
  where(campo: string, _op: '==', valor: unknown) {
    const c = new FakeCollection(this.db, this.ruta);
    c.filtros = [...this.filtros, [campo, valor]];
    return c;
  }
  async get() {
    const docs = [...this.db.datos.entries()]
      .filter(([ruta]) => {
        const resto = ruta.slice(this.ruta.length + 1);
        return ruta.startsWith(`${this.ruta}/`) && !resto.includes('/');
      })
      .filter(([, d]) => this.filtros.every(([campo, valor]) => d[campo] === valor))
      .map(([ruta, d]) => new FakeSnap(new FakeDoc(this.db, ruta), d));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeTx {
  get(ref: FakeDoc) {
    return ref.get();
  }
  set(ref: FakeDoc, valor: Datos) {
    void ref.set(valor);
    return this;
  }
  update(ref: FakeDoc, valor: Datos) {
    void ref.update(valor);
    return this;
  }
  delete(ref: FakeDoc) {
    void ref.delete();
    return this;
  }
}
