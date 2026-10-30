import { z } from "zod";
import { plateEquipmentSchema } from "../../../src/domain/training-tools";
import { AtomicStoreError, type AtomicStorage } from "./atomic-contract";
export const trainingPreferencesSchema = z
  .object({
    weightUnit: z.enum(["kg", "lb"]),
    distanceUnit: z.enum(["m", "km", "mi"]),
    showTargets: z.boolean(),
    showPrevious: z.boolean(),
    restSeconds: z
      .number()
      .int()
      .min(0)
      .max(600)
      .refine((n) => n % 15 === 0),
    equipment: plateEquipmentSchema,
  })
  .strict();
export type TrainingPreferences = z.infer<typeof trainingPreferencesSchema>;
export const defaultTrainingPreferences = (): TrainingPreferences => ({
  weightUnit: "kg",
  distanceUnit: "m",
  showTargets: true,
  showPrevious: true,
  restSeconds: 90,
  equipment: { unit: "kg", bar: 20, plates: [] },
});
export function trainingPreferencesKey(userId: string) {
  return `is:native-training-preferences:v1:${z.uuid().parse(userId)}`;
}
const envelope = z
  .object({ version: z.literal(1), userId: z.uuid(), value: trainingPreferencesSchema })
  .strict();
type State = {
  ready: boolean;
  busy: boolean;
  paused: boolean;
  blocked: boolean;
  error: string | null;
  value: TrainingPreferences;
};
export class TrainingPreferencesController {
  private state: State = {
    ready: false,
    busy: false,
    paused: false,
    blocked: false,
    error: null,
    value: defaultTrainingPreferences(),
  };
  private raw: string | null = null;
  private listeners = new Set<() => void>();
  private readonly key: string;
  constructor(
    private userId: string,
    private storage: AtomicStorage,
  ) {
    this.key = trainingPreferencesKey(userId);
  }
  getSnapshot = () => this.state;
  restForNewSession = () => {
    if (!this.state.ready || this.state.busy || this.state.paused)
      throw Error(
        "Espera a que terminen de cargarse o guardarse tus preferencias antes de iniciar.",
      );
    if (this.state.blocked)
      throw Error(
        "No pudimos leer tus preferencias. Abre Cuenta y usa Releer preferencias antes de iniciar.",
      );
    return this.state.value.restSeconds;
  };
  /** Account removal holds this lease before any awaited cleanup or request. */
  pauseWrites() {
    if (!this.state.ready || this.state.busy || this.state.paused)
      throw Error(
        "Espera a que termine la lectura o el guardado de preferencias antes de borrar la cuenta.",
      );
    this.publish({ paused: true });
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.publish({ paused: false });
    };
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(p: Partial<State>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
  }
  async restore() {
    if (this.state.busy || this.state.paused) return;
    this.publish({ busy: true });
    try {
      const raw = await this.storage.get(this.key);
      const read = raw === null ? null : envelope.parse(JSON.parse(raw));
      if (read && read.userId !== this.userId) throw Error("Cuenta diferente");
      this.raw = raw;
      this.publish({
        ready: true,
        blocked: false,
        error: null,
        value: read?.value ?? defaultTrainingPreferences(),
      });
    } catch {
      this.publish({
        ready: true,
        blocked: true,
        error:
          "No pudimos leer tus preferencias. Conservamos el contenido local; reintenta con Releer preferencias.",
      });
    } finally {
      this.publish({ busy: false });
    }
  }
  async save(value: TrainingPreferences) {
    if (!this.state.ready || this.state.blocked || this.state.busy || this.state.paused)
      throw Error("Relee las preferencias antes de guardar.");
    const next = JSON.stringify(envelope.parse({ version: 1, userId: this.userId, value }));
    this.publish({ busy: true, error: null });
    try {
      // A lost acknowledgement may have already stored this exact document. No second write.
      if ((await this.storage.get(this.key)) !== next)
        await this.storage.compareAndSet(this.key, this.raw, next);
      if ((await this.storage.get(this.key)) !== next) throw Error("verification");
      this.raw = next;
      this.publish({ value: envelope.parse(JSON.parse(next)).value });
    } catch (e) {
      const message =
        e instanceof AtomicStoreError && e.reason === "conflict"
          ? "Las preferencias cambiaron en otra ventana. Conservamos tu propuesta; relee antes de reemplazarla."
          : "No pudimos confirmar el guardado de preferencias. Conservamos tu propuesta; revisa el almacenamiento y reintenta.";
      this.publish({ error: message });
      throw Error(message);
    } finally {
      this.publish({ busy: false });
    }
  }
}
