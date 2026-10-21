// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkoutRunner } from "@/app/(app)/workout/[plannedSessionId]/runner";
import { sendWorkout } from "@/lib/offline/sync";
import type { WorkoutContext } from "@/lib/data/workout-context";
import { createDraft, finishDraft } from "./runner-state";
import { saveDraft, draftKey } from "./draft";

vi.mock("@/app/(app)/workout/[plannedSessionId]/actions", () => ({
  exerciseHistoryAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/offline/queue", () => ({
  enqueueWorkout: vi.fn().mockRejectedValue(new Error("IndexedDB unavailable")),
  removeConfirmedWorkout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/offline/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/sync")>()),
  sendWorkout: vi.fn(),
}));

const context: WorkoutContext = {
  session: {
    id: "session-1",
    label: "A",
    programId: "program-1",
    programName: "Fuerza",
    weekNumber: 1,
    weeksCount: 2,
  },
  exercises: [],
};

describe("pantalla de recuperación sin iniciar una sesión antigua", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sin borrador no crea uno nuevo ni muestra el corredor", async () => {
    await act(() =>
      root.render(<WorkoutRunner userId="student-1" context={context} recoveryOnly />),
    );
    expect(container.textContent).toContain("Esta sesión no está disponible hoy.");
    expect(container.querySelector('[aria-label="Terminar entrenamiento"]')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("recupera una sesión terminada de la semana anterior y reenvía el mismo id, fecha y duración", async () => {
    const initial = createDraft({
      workoutId: "11111111-1111-4111-8111-111111111111",
      userId: "student-1",
      plannedSession: { id: "session-1", programId: "program-1", label: "A" },
      now: new Date("2026-10-18T15:00:00.000Z"),
      exercises: [
        {
          sessionExerciseId: "se-1",
          exerciseId: "ex-1",
          name: "Sentadilla",
          isBodyweight: false,
          lastWeightKg: null,
          prescribed: { sets: 1, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
        },
      ],
    });
    initial.exercises[0].sets[0] = { ...initial.exercises[0].sets[0], done: true, reps: "10" };
    saveDraft(localStorage, finishDraft(initial, new Date("2026-10-18T16:00:00.000Z")));
    vi.mocked(sendWorkout)
      .mockResolvedValueOnce({ ok: false, reason: "network" })
      .mockResolvedValueOnce({ ok: true, status: "created" });
    await act(() =>
      root.render(<WorkoutRunner userId="student-1" context={context} recoveryOnly />),
    );
    expect(container.textContent).toContain("Pendiente de enviar");
    expect(sendWorkout).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(draftKey("student-1", "session-1"))).not.toBeNull();
    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reintentar",
    );
    await act(() => retry!.click());
    expect(sendWorkout).toHaveBeenCalledTimes(2);
    expect(sendWorkout).toHaveBeenLastCalledWith(
      "student-1",
      expect.objectContaining({
        id: initial.workoutId,
        startedAt: initial.startedAt,
        finishedAt: "2026-10-18T16:00:00.000Z",
        durationSeconds: 3600,
      }),
    );
    expect(localStorage.getItem(draftKey("student-1", "session-1"))).toBeNull();
  });
});
