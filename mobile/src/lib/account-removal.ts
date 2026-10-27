import { z } from "zod";
import type { TrainingStorage } from "./training";
export const REMOVAL_KEY = "is:native-account-removal:v1";
const receipt = z
  .object({ version: z.literal(1), userId: z.uuid(), phase: z.enum(["requested", "confirmed"]) })
  .strict();
type Record = z.infer<typeof receipt>;
type State = {
  ready: boolean;
  busy: boolean;
  blocked: boolean;
  record: Record | null;
  error: string | null;
  completion: "server_deleted" | "local_only" | null;
};
export async function clearAccountTraining(storage: TrainingStorage, id: string) {
  if (!z.uuid().safeParse(id).success) throw Error("Identidad local inválida.");
  for (const key of [
    `is:native-training:v1:${id}`,
    `is:native-comment:v1:${id}`,
    `is:native-week:v1:${id}`,
    `is:native-sync:v1:${id}`,
    `is:native-library:v1:${id}`,
    `is:native-training-preferences:v1:${id}`,
  ]) {
    await storage.remove(key);
    if ((await storage.get(key)) !== null)
      throw Error("No pudimos confirmar la limpieza local. Reintenta.");
  }
}
/** One device operation; receipt contains no email, name, password or token. */
export class AccountRemovalController {
  private state: State = {
    ready: false,
    busy: false,
    blocked: false,
    record: null,
    error: null,
    completion: null,
  };
  private listeners = new Set<() => void>();
  constructor(
    private storage: TrainingStorage,
    private cleanup: (userId: string) => Promise<void>,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(state: Partial<State>) {
    this.state = { ...this.state, ...state };
    this.listeners.forEach((fn) => fn());
  }
  async restore() {
    if (this.state.busy) return;
    try {
      const raw = await this.storage.get(REMOVAL_KEY);
      const record = raw === null ? null : receipt.parse(JSON.parse(raw));
      this.publish({ ready: true, blocked: false, record, error: null });
    } catch {
      this.publish({
        ready: true,
        blocked: true,
        error:
          "No pudimos leer el recibo de eliminación. Se conserva; reintenta o usa una versión compatible.",
      });
    }
  }
  private ensure() {
    if (!this.state.ready || this.state.blocked || this.state.busy)
      throw Error("Espera o recupera el recibo antes de continuar.");
  }
  private async write(record: Record) {
    const encoded = JSON.stringify(record);
    // Keep known server confirmation in memory even when its storage write fails.
    this.publish({ record });
    await this.storage.set(REMOVAL_KEY, encoded);
    if ((await this.storage.get(REMOVAL_KEY)) !== encoded)
      throw Error("No pudimos confirmar el recibo en este dispositivo.");
  }
  private async removeReceipt() {
    await this.storage.remove(REMOVAL_KEY);
    if ((await this.storage.get(REMOVAL_KEY)) !== null)
      throw Error("No pudimos retirar el recibo local. Reintenta.");
  }
  private async clean(record: Record, uncertain: boolean) {
    if (record.phase !== "confirmed" && !uncertain)
      throw Error("Confirma BORRAR LOCAL para descartar sin confirmación del servidor.");
    await this.cleanup(record.userId);
    await this.removeReceipt();
    this.publish({
      record: null,
      error: null,
      completion: record.phase === "confirmed" ? "server_deleted" : "local_only",
    });
  }
  async request(userId: string, remove: () => Promise<void>) {
    this.ensure();
    if (this.state.record) throw Error("Resuelve primero la eliminación pendiente.");
    const record = receipt.parse({ version: 1, userId, phase: "requested" });
    this.publish({ busy: true, error: null, completion: null });
    try {
      await this.write(record);
      await remove();
      const confirmed = { ...record, phase: "confirmed" as const };
      await this.write(confirmed);
      await this.clean(confirmed, false);
    } catch (e) {
      this.publish({
        error:
          e instanceof Error
            ? e.message
            : "No pudimos completar la eliminación. Conservamos el recibo.",
      });
      throw e;
    } finally {
      this.publish({ busy: false });
    }
  }
  async finishCleanup(uncertain = false) {
    this.ensure();
    const record = this.state.record;
    if (!record) return;
    this.publish({ busy: true, error: null });
    try {
      await this.clean(record, uncertain);
    } catch (e) {
      this.publish({
        error: e instanceof Error ? e.message : "No pudimos limpiar este dispositivo. Reintenta.",
      });
      throw e;
    } finally {
      this.publish({ busy: false });
    }
  }
  async preserve() {
    this.ensure();
    if (this.state.record?.phase !== "requested")
      throw Error("El servidor confirmó el borrado; completa la limpieza local.");
    this.publish({ busy: true });
    try {
      await this.removeReceipt();
      this.publish({ record: null, error: null });
    } catch (e) {
      this.publish({ error: "No pudimos retirar el recibo. Tus registros se conservan." });
      throw e;
    } finally {
      this.publish({ busy: false });
    }
  }
}
