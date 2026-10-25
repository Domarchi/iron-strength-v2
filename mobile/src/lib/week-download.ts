import { z } from "zod";
import { parseWeekPackage, type WeekPackage } from "../../../src/lib/offline/package";
import { parseNativeWeek, type NativeWeekRecord } from "../../../src/lib/mobile/download-contract";
import type { TrainingStorage } from "./training";
export type WeekStorage = TrainingStorage & {
  compareAndSet(key: string, before: string | null, next: string): Promise<void>;
};
export const nativeWeekKey = (userId: string) => `is:native-week:v1:${userId}`;
export class WeekStorageError extends Error {
  constructor(reason: "conflict" | "unsupported") {
    super(
      reason === "conflict"
        ? "La descarga cambió desde otra ventana. Comprueba la copia guardada antes de reintentar."
        : "Este navegador no permite proteger la descarga entre ventanas. Usa un navegador compatible o la app instalada.",
    );
  }
}
function storageMessage(error: unknown) {
  if (error instanceof WeekStorageError) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    (("name" in error && error.name === "QuotaExceededError") ||
      ("code" in error && error.code === "SQLITE_FULL") ||
      ("message" in error &&
        typeof error.message === "string" &&
        /database or disk is full|no space left/i.test(error.message)))
  )
    return "No hay espacio suficiente para verificar la descarga. Libera espacio y comprueba los datos guardados antes de reintentar.";
  return "No pudimos verificar la descarga. Comprueba el almacenamiento antes de reintentar.";
}
type State = {
  ready: boolean;
  busy: boolean;
  verified: boolean;
  blocked: boolean;
  pack: WeekPackage | null;
  error: string | null;
};
export class NativeWeekController {
  readonly key: string;
  private state: State = {
    ready: false,
    busy: false,
    verified: false,
    blocked: false,
    pack: null,
    error: null,
  };
  private raw: string | null = null;
  private epoch = 0;
  private disposed = false;
  private listeners = new Set<() => void>();
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private userId: string,
    private storage: WeekStorage,
    private fetch: () => Promise<WeekPackage>,
  ) {
    if (!z.uuid().safeParse(userId).success) throw Error("Identidad de descarga inválida.");
    this.key = nativeWeekKey(userId);
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(next: Partial<State>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((fn) => fn());
  }
  private current(epoch: number) {
    if (this.disposed || epoch !== this.epoch)
      throw Error("La cuenta cambió. La descarga no se confirmó.");
  }
  private ensure() {
    this.current(this.epoch);
    if (!this.state.ready || this.state.busy || this.state.blocked)
      throw Error("Espera o comprueba la descarga guardada antes de continuar.");
  }
  async restore() {
    if (this.state.busy && !this.disposed) return;
    this.disposed = false;
    const epoch = ++this.epoch;
    this.publish({ busy: true, verified: false, error: null });
    try {
      const raw = await this.storage.get(this.key);
      this.current(epoch);
      const record = raw === null ? null : parseNativeWeek(JSON.parse(raw), this.userId);
      if (raw !== null && !record) throw Error("Formato desconocido");
      this.raw = raw;
      this.publish({ pack: record?.pack ?? null, verified: true, blocked: false, error: null });
    } catch {
      if (epoch === this.epoch)
        this.publish({
          blocked: true,
          verified: false,
          error:
            "No pudimos interpretar la descarga. Se conserva; comprueba el almacenamiento o usa una versión compatible.",
        });
    } finally {
      if (epoch === this.epoch) this.publish({ ready: true, busy: false });
    }
  }
  private async write(pack: WeekPackage | null, epoch: number) {
    const record: NativeWeekRecord = { version: 1, userId: this.userId, pack },
      encoded = JSON.stringify(record),
      before = this.raw;
    const operation = this.tail.then(async () => {
      this.current(epoch);
      await this.storage.compareAndSet(this.key, before, encoded);
      if ((await this.storage.get(this.key)) !== encoded)
        throw Error("No se pudo releer la descarga.");
      this.current(epoch);
      this.raw = encoded;
      this.publish({ pack, verified: true, blocked: false, error: null });
    });
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
  async download(expected: { programId: string; weekStart: string }) {
    this.ensure();
    const epoch = this.epoch;
    let storing = false;
    this.publish({ busy: true, error: null });
    try {
      const pack = parseWeekPackage(await this.fetch(), this.userId);
      this.current(epoch);
      if (!pack) throw Error("La descarga no corresponde a esta cuenta o está incompleta.");
      if (pack.program.id !== expected.programId || pack.weekStart !== expected.weekStart)
        throw Error("La semana cambió. Actualiza Inicio antes de descargar.");
      if (
        this.state.pack &&
        Date.parse(pack.downloadedAt) < Date.parse(this.state.pack.downloadedAt)
      )
        throw Error(
          "La respuesta es anterior a tu descarga guardada. Actualiza y vuelve a intentar.",
        );
      storing = true;
      await this.write(pack, epoch);
    } catch (e) {
      const error = storing
        ? Error(storageMessage(e))
        : e instanceof Error
          ? e
          : Error("No pudimos descargar. Reintenta con conexión.");
      if (epoch === this.epoch)
        this.publish({
          error: error.message,
          ...(storing ? { verified: false, blocked: true } : {}),
        });
      throw error;
    } finally {
      if (epoch === this.epoch) this.publish({ busy: false });
    }
  }
  async remove() {
    this.ensure();
    if (!this.state.verified || !this.state.pack) return;
    const epoch = this.epoch;
    this.publish({ busy: true, error: null });
    try {
      await this.write(null, epoch);
    } catch (e) {
      const error = Error(storageMessage(e));
      if (epoch === this.epoch)
        this.publish({ verified: false, blocked: true, error: error.message });
      throw error;
    } finally {
      if (epoch === this.epoch) this.publish({ busy: false });
    }
  }
  async flush() {
    if (!this.state.ready || this.state.busy)
      throw Error("Espera a que termine la descarga antes de continuar.");
    await this.tail;
  }
  dispose() {
    this.disposed = true;
    this.epoch++;
    this.listeners.clear();
  }
}
