/**
 * Firestore en memoria, solo para las pruebas de los repositorios.
 * Implementa lo que usa la API: doc/get/set/update/delete/create, where/get,
 * collectionGroup, subcolecciones, batch, runTransaction y recursiveDelete.
 */
type Datos = Record<string, unknown>;

export class FakeFirestore {
  datos = new Map<string, Datos>();

  collection(ruta: string) {
    return new FakeCollection(this, ruta);
  }

  collectionGroup(nombre: string) {
    return new FakeQuery(this, (ruta) => {
      const partes = ruta.split('/');
      return partes.length >= 2 && partes.length % 2 === 0 && partes[partes.length - 2] === nombre;
    });
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
      set: (ref: FakeDoc, valor: Datos) => ops.push(() => this.datos.set(ref.path, { ...valor })),
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

class FakeQuery {
  constructor(
    protected db: FakeFirestore,
    protected coincideRuta: (ruta: string) => boolean,
    protected filtros: [string, unknown][] = []
  ) {}
  where(campo: string, _op: '==', valor: unknown) {
    return new FakeQuery(this.db, this.coincideRuta, [...this.filtros, [campo, valor]]);
  }
  async get() {
    const docs = [...this.db.datos.entries()]
      .filter(([ruta]) => this.coincideRuta(ruta))
      .filter(([, d]) => this.filtros.every(([campo, valor]) => d[campo] === valor))
      .map(([ruta, d]) => new FakeSnap(new FakeDoc(this.db, ruta), d));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeCollection extends FakeQuery {
  constructor(
    db: FakeFirestore,
    private ruta: string,
    filtros: [string, unknown][] = []
  ) {
    super(
      db,
      (docRuta) => {
        const resto = docRuta.slice(ruta.length + 1);
        return docRuta.startsWith(`${ruta}/`) && !resto.includes('/');
      },
      filtros
    );
  }
  doc(id: string) {
    return new FakeDoc(this.db, `${this.ruta}/${id}`);
  }
  override where(campo: string, _op: '==', valor: unknown) {
    return new FakeCollection(this.db, this.ruta, [...this.filtros, [campo, valor]]);
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
