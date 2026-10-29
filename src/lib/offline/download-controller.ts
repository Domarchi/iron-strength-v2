// Account-scoped read-only download cache; never writes training, drafts or queue keys.
import { z } from "zod";
import { bundleSchema, type Bundle } from "./training-bundle";
const uuid = z.uuid().transform((v) => v.toLowerCase());
function compareDownloadTime(left: string, right: string) {
  const key = (value: string) => {
    const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
    if (fraction.length > 6) throw new DownloadFault("format");
    return { second: Math.floor(Date.parse(value) / 1000), fraction: fraction.padEnd(6, "0") };
  };
  const a = key(left),
    b = key(right);
  return a.second - b.second || a.fraction.localeCompare(b.fraction);
}
export const downloadKey = (userId: string) => `is:training-download:v1:${uuid.parse(userId)}`;
export const downloadRecordSchema = z
  .strictObject({
    version: z.literal(1),
    userId: uuid,
    bundle: bundleSchema.nullable(),
    previousBundle: bundleSchema.nullable(),
  })
  .refine(
    (r) =>
      (r.bundle !== null || r.previousBundle === null) &&
      (!r.bundle || r.bundle.userId === r.userId) &&
      (!r.previousBundle || r.previousBundle.userId === r.userId),
  );
const messages = {
  quota: "No hay espacio suficiente. Libera espacio y comprueba la copia guardada.",
  unsupported: "Este navegador no permite proteger la descarga. Usa una versión compatible.",
  unauthorized: "Vuelve a entrar para actualizar la descarga. Los datos guardados se conservan.",
  format: "La descarga requiere una versión compatible. Conservamos los datos guardados.",
  storage:
    "No pudimos verificar el almacenamiento. Comprueba la copia guardada antes de continuar.",
  conflict:
    "La copia cambió desde otra ventana. Comprueba los datos guardados antes de reintentar.",
  network: "No pudimos completar la descarga. La copia guardada se conserva.",
  interface:
    "No pudimos preparar la app sin conexión. Revisa Internet; si hay una actualización, termina tus registros y cierra las otras pestañas.",
  account_changed: "La cuenta cambió. Abre la descarga con su cuenta original.",
  stale: "La respuesta es anterior a tu copia guardada. Conservamos la más reciente.",
  capacity: "La descarga supera el límite de esta versión. No se reemplazó la copia guardada.",
} as const;
export type Code = keyof typeof messages;
export class DownloadFault extends Error {
  constructor(readonly code: Code) {
    super(messages[code]);
  }
}
export type DownloadStorage = {
  get(key: string): Promise<string | null>;
  compareAndSet(key: string, before: string | null, next: string): Promise<void>;
};
type State = {
  ready: boolean;
  busy: boolean;
  verified: boolean;
  blocked: boolean;
  reserved: boolean;
  bundle: Bundle | null;
  error: { code: Code; message: string } | null;
};
export class DownloadController {
  readonly key: string;
  private raw: string | null = null;
  private disposed = false;
  private epoch = 0;
  private reservations = 0;
  private pending: Promise<void> | null = null;
  private state: State = {
    ready: false,
    busy: false,
    verified: false,
    blocked: false,
    reserved: false,
    bundle: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  constructor(
    readonly userId: string,
    private storage: DownloadStorage,
    private fetchBundle: () => Promise<unknown>,
    private owns: () => boolean,
  ) {
    this.userId = uuid.parse(userId);
    this.key = downloadKey(this.userId);
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(update: Partial<State>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...update };
    for (const fn of this.listeners) fn();
  }
  private current(epoch: number) {
    if (this.disposed || epoch !== this.epoch || !this.owns())
      throw new DownloadFault("account_changed");
  }
  private failure(error: unknown, fallback: Code): { code: Code; message: string } {
    let code: Code = error instanceof DownloadFault ? error.code : fallback;
    if (!this.owns()) code = "account_changed";
    else if (error && typeof error === "object" && "code" in error) {
      if (error.code === "conflict") code = "conflict";
      if (error.code === "capacity") code = "capacity";
      if (error.code === "interface") code = "interface";
      if (["version", "incompatible", "format"].includes(String(error.code))) code = "format";
      if (["account_changed", "identity"].includes(String(error.code))) code = "account_changed";
      if (["unauthorized", "forbidden"].includes(String(error.code))) code = "unauthorized";
    }
    if (
      this.owns() &&
      error &&
      typeof error === "object" &&
      (("name" in error && error.name === "QuotaExceededError") ||
        ("code" in error && error.code === "SQLITE_FULL") ||
        ("message" in error &&
          typeof error.message === "string" &&
          /database or disk is full|no space left/i.test(error.message)))
    )
      code = "quota";
    return { code, message: messages[code] };
  }
  private async perform(op: () => Promise<boolean>): Promise<boolean> {
    if (this.pending) return false;
    let done!: () => void;
    this.pending = new Promise<void>((resolve) => {
      done = resolve;
    });
    try {
      return await op();
    } finally {
      this.pending = null;
      done();
    }
  }
  async restore(): Promise<boolean> {
    if (this.pending) {
      if (!this.disposed) return false;
      await this.pending;
    }
    if (this.reservations) return false;
    this.disposed = false;
    const epoch = ++this.epoch;
    return this.perform(async () => {
      this.publish({ busy: true, verified: false, error: null });
      try {
        this.current(epoch);
        const raw = await this.storage.get(this.key);
        this.current(epoch);
        this.raw = raw;
        let bundle: Bundle | null = null;
        if (raw !== null) {
          let value: unknown;
          try {
            value = JSON.parse(raw);
          } catch {
            throw new DownloadFault("format");
          }
          const record = downloadRecordSchema.safeParse(value);
          if (!record.success || record.data.userId !== this.userId)
            throw new DownloadFault("format");
          bundle = record.data.bundle;
        }
        this.publish({ ready: true, verified: true, blocked: false, bundle, error: null });
        return true;
      } catch (error) {
        const failure = this.failure(error, "storage");
        this.publish({ ready: true, verified: false, blocked: true, bundle: null, error: failure });
        return false;
      } finally {
        if (epoch === this.epoch) this.publish({ busy: false });
      }
    });
  }
  async download(): Promise<boolean> {
    if (!this.state.ready || this.state.blocked || !this.state.verified || this.reservations)
      return false;
    return this.perform(async () => {
      const epoch = this.epoch;
      let storing = false;
      this.publish({ busy: true, error: null });
      try {
        this.current(epoch);
        const value = await this.fetchBundle();
        this.current(epoch);
        const parsed = bundleSchema.safeParse(value);
        if (!parsed.success || parsed.data.userId !== this.userId)
          throw new DownloadFault("format");
        const next = parsed.data,
          previous = this.state.bundle;
        if (
          previous &&
          compareDownloadTime(next.downloadedAt, previous.downloadedAt) <= 0 &&
          JSON.stringify(next) !== JSON.stringify(previous)
        )
          throw new DownloadFault("stale");
        const encoded =
          previous && JSON.stringify(next) === JSON.stringify(previous) && this.raw !== null
            ? this.raw
            : JSON.stringify({
                version: 1,
                userId: this.userId,
                bundle: next,
                previousBundle: previous,
              });
        this.current(epoch);
        storing = true;
        this.publish({ verified: false });
        await this.storage.compareAndSet(this.key, this.raw, encoded);
        // Even if this read fails after commit, the prior complete bundle is still in previousBundle.
        if ((await this.storage.get(this.key)) !== encoded) throw new DownloadFault("storage");
        this.current(epoch);
        this.raw = encoded;
        this.publish({ verified: true, blocked: false, bundle: next, error: null });
        return true;
      } catch (error) {
        const failure = this.failure(error, storing ? "storage" : "network");
        this.publish({
          error: failure,
          ...(storing ? { verified: false } : {}),
          ...(failure.code === "account_changed"
            ? { bundle: null, verified: false, blocked: true }
            : {}),
        });
        return false;
      } finally {
        if (epoch === this.epoch) this.publish({ busy: false });
      }
    });
  }
  async remove(): Promise<boolean> {
    if (!this.state.ready || this.state.blocked || !this.state.verified || this.reservations)
      return false;
    return this.perform(async () => {
      const epoch = this.epoch;
      this.publish({ busy: true, error: null, verified: false });
      try {
        this.current(epoch);
        const encoded = JSON.stringify({
          version: 1,
          userId: this.userId,
          bundle: null,
          previousBundle: null,
        });
        await this.storage.compareAndSet(this.key, this.raw, encoded);
        if ((await this.storage.get(this.key)) !== encoded) throw new DownloadFault("storage");
        this.current(epoch);
        this.raw = encoded;
        this.publish({ bundle: null, verified: true, error: null });
        return true;
      } catch (error) {
        const failure = this.failure(error, "storage");
        this.publish({
          error: failure,
          ...(failure.code === "account_changed" ? { bundle: null, blocked: true } : {}),
        });
        return false;
      } finally {
        if (epoch === this.epoch) this.publish({ busy: false });
      }
    });
  }
  async reserve(): Promise<() => void> {
    this.reservations++;
    this.publish({ reserved: true });
    await this.pending;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reservations--;
      this.publish({ reserved: this.reservations > 0 });
    };
  }
  dispose() {
    this.disposed = true;
    this.epoch++;
    this.listeners.clear();
  }
}
