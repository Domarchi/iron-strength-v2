import type { TrainingStorage } from "./training";
export type AtomicStorage = TrainingStorage & {
  compareAndSet(key: string, before: string | null, next: string): Promise<void>;
};
export class AtomicStoreError extends Error {
  constructor(readonly reason: "conflict" | "unsupported") {
    super(
      reason === "conflict"
        ? "El contenido cambió en otra ventana."
        : "El almacenamiento no permite una escritura protegida.",
    );
  }
}
