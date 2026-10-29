import { z } from "zod";
import type { DraftStorage } from "@/lib/workout/draft";
import { listCoachEditorEntries, type CoachEditorScope } from "./editor-browser";
import {
  coachEditorDraftKey,
  decodeCoachEditorDraft,
  type CoachEditorStorage,
} from "./typed-editor-draft";
import {
  confirmedCoachResult,
  confirmedLegacyResult,
  legacyEditorOperations,
  type LegacyOperation,
} from "./editor-receipts";
import type { CoachSessionRequest } from "@/domain/coach-session-mutation";
export type OrphanCoachDraft = { scope: CoachEditorScope; key: string; raw: string };
export function listOrphanCoachEditorEntries(
  userId: string,
  programId: string,
  availableIds: string[],
  getStorage: () => DraftStorage = () => window.localStorage,
): { ok: boolean; entries: OrphanCoachDraft[] } {
  const entries: OrphanCoachDraft[] = [];
  try {
    z.uuid().parse(userId);
    z.uuid().parse(programId);
    const storage = getStorage(),
      prefix = `is:coach-draft:v1:${userId}:${programId}:`,
      sessions = new Set<string>();
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const [sessionId, id, ...extra] = key.slice(prefix.length).split(":");
      if (
        extra.length ||
        !z.uuid().safeParse(sessionId).success ||
        !z.uuid().safeParse(id).success ||
        availableIds.includes(sessionId)
      )
        continue;
      sessions.add(sessionId);
    }
    for (const sessionId of sessions) {
      const scope = { userId, programId, sessionId },
        found = listCoachEditorEntries(scope, () => storage);
      if (!found.ok) return { ok: false, entries };
      for (const { key, entry } of found.entries) entries.push({ scope, key, raw: entry.raw });
    }
    return { ok: true, entries };
  } catch {
    return { ok: false, entries };
  }
}
type Dependencies = {
  storage: CoachEditorStorage;
  mutate: (input: CoachEditorScope & { request: CoachSessionRequest }) => Promise<unknown>;
  legacy: (
    input: CoachEditorScope & { raw: string; operation: LegacyOperation },
  ) => Promise<unknown>;
};
export class CoachOrphanEditorRecovery {
  private state = { busy: false, confirmed: false, removed: false, error: null as string | null };
  private listeners = new Set<() => void>();
  private confirmations = new Set<string>();
  readonly entry;
  constructor(
    readonly source: OrphanCoachDraft,
    private deps: Dependencies,
  ) {
    const decoded = decodeCoachEditorDraft(source.raw, source.scope);
    this.entry =
      decoded.kind !== "empty" &&
      decoded.kind !== "unknown" &&
      coachEditorDraftKey(decoded.draft) !== source.key
        ? { kind: "unknown" as const, raw: source.raw }
        : decoded;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  get operations(): (LegacyOperation | "canonical")[] {
    return this.entry.kind === "current"
      ? this.entry.draft.pending
        ? ["canonical"]
        : []
      : this.entry.kind === "legacy"
        ? legacyEditorOperations(this.entry.draft)
        : [];
  }
  private async protect() {
    const { key, raw } = this.source;
    await this.deps.storage.compareAndSet(key, raw, raw);
    if ((await this.deps.storage.get(key)) !== raw) throw Error("changed");
  }
  async verify(operation: LegacyOperation | "canonical" = "canonical"): Promise<boolean> {
    if (this.state.busy || this.state.removed || !this.operations.includes(operation)) return false;
    if (this.confirmations.has(operation)) return true;
    this.publish({ busy: true, error: null });
    try {
      await this.protect();
      let confirmed = false;
      if (operation === "canonical" && this.entry.kind === "current" && this.entry.draft.pending) {
        const request = this.entry.draft.pending;
        confirmed = !!confirmedCoachResult(
          await this.deps.mutate({ ...this.source.scope, request }),
          request,
          this.source.scope.sessionId,
        );
      } else if (operation !== "canonical" && this.entry.kind === "legacy") {
        confirmed = confirmedLegacyResult(
          await this.deps.legacy({ ...this.source.scope, raw: this.source.raw, operation }),
          this.entry.draft,
          operation,
          this.source.scope.sessionId,
        );
      }
      if (!confirmed) {
        this.publish({
          error:
            "No se pudo confirmar la operación. El borrador completo sigue guardado; reintenta con la misma cuenta.",
        });
        return false;
      }
      this.confirmations.add(operation);
      this.publish({
        confirmed: this.operations.every((operation) => this.confirmations.has(operation)),
      });
      return true;
    } catch {
      this.publish({
        error:
          "No se pudo proteger o verificar este intento. Conservamos el borrador; revisa tu conexión y si cambió en otra ventana.",
      });
      return false;
    } finally {
      this.publish({ busy: false });
    }
  }
  async remove(confirmed: boolean): Promise<boolean> {
    if (
      !confirmed ||
      this.state.busy ||
      this.state.removed ||
      !this.state.confirmed ||
      this.entry.kind === "unknown"
    )
      return false;
    this.publish({ busy: true, error: null });
    try {
      await this.deps.storage.compareAndSet(this.source.key, this.source.raw, null);
      if ((await this.deps.storage.get(this.source.key)) !== null) throw Error("not removed");
      this.publish({ removed: true });
      return true;
    } catch {
      this.publish({
        error: "No se pudo retirar el borrador o cambió en otra ventana. Su contenido se conserva.",
      });
      return false;
    } finally {
      this.publish({ busy: false });
    }
  }
}
