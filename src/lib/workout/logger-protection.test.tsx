// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkoutRunner } from "@/app/(app)/workout/[plannedSessionId]/runner";
import { PendingWorkouts } from "@/components/week/pending-workouts";
import type { WorkoutContext } from "@/lib/data/workout-context";
import { createDraft } from "./runner-state";
import { draftKey, loadDraft, saveDraft } from "./draft";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(app)/workout/[plannedSessionId]/actions", () => ({ saveWorkoutAction: vi.fn() }));

const context: WorkoutContext = {
  session: {
    id: "session",
    label: "A",
    programId: "program",
    programName: "Fuerza",
    weekNumber: 1,
    weeksCount: 4,
  },
  exercises: ["Sentadilla", "Press de banca"].map((name, i) => ({
    sessionExerciseId: "se" + i,
    exerciseId: "ex" + i,
    name,
    isBodyweight: false,
    prescribed: { sets: 2, repsMin: 8, repsMax: 12, targetWeightKg: i === 0 ? 60 : 40 },
    lastWeightKg: null,
    note: null,
    suggestion: null,
    last: null,
  })),
};
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
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const mount = () => act(() => root.render(<WorkoutRunner userId="student" context={context} />));
const button = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const field = (label: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const current = () => loadDraft(localStorage, "student", "session")!;
const initial = (now = new Date()) =>
  createDraft({
    workoutId: "11111111-1111-4111-8111-111111111111",
    userId: "student",
    plannedSession: { id: "session", programId: "program", label: "A" },
    exercises: context.exercises,
    now,
  });

it("recupera una sesión en curso de hace 60 días con sus mismas series e id", async () => {
  const old = initial(new Date(Date.now() - 60 * 86400000));
  old.exercises[0].sets[0] = {
    ...old.exercises[0].sets[0],
    weight: "62,5",
    reps: "10",
    done: true,
  };
  saveDraft(localStorage, old);
  await mount();
  expect(field("Peso de la serie 1 de Sentadilla (kg)").value).toBe("62,5");
  expect(current().workoutId).toBe(old.workoutId);
  expect(current().exercises[0].sets[0].done).toBe(true);
});

it("Mi semana sigue ofreciendo retomar un borrador antiguo", async () => {
  saveDraft(localStorage, initial(new Date(Date.now() - 60 * 86400000)));
  await act(() => root.render(<PendingWorkouts userId="student" />));
  expect(container.textContent).toContain("Retomar");
});

it("conserva el plazo real del descanso al recargar, también tras ajustarlo o cerrarlo", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
  await mount();
  await act(() => button("Marcar como hecha la serie 1 de Sentadilla").click());
  await act(() => button("Sumar 15 segundos al descanso").click());
  const endsAt = current().rest?.endsAt;
  expect(endsAt).toBe(Date.now() + 105000);
  await act(() => root.unmount());
  vi.setSystemTime(new Date("2026-10-19T15:00:30Z"));
  root = createRoot(container);
  await mount();
  expect(container.querySelector('[data-testid="rest-clock"]')?.textContent).toBe("1:15");
  expect(current().rest?.endsAt).toBe(endsAt);
  const dismiss = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Saltar",
  )!;
  await act(() => dismiss.click());
  expect(current().rest).toBeNull();
});

it("deshace marcar y eliminar series, restaurando datos, volumen y descanso", async () => {
  await mount();
  await act(() => button("Marcar como hecha la serie 1 de Sentadilla").click());
  expect(current().exercises[0].sets[0].done).toBe(true);
  await act(() => button("Deshacer última acción").click());
  expect(current().exercises[0].sets[0]).toMatchObject({ done: false, reps: "" });
  expect(container.querySelector('[role="timer"]')).toBeNull();
  await act(() => button("Marcar como hecha la serie 1 de Sentadilla").click());
  const savedSet = current().exercises[0].sets[0];
  await act(() => button("Serie 1 de Sentadilla, opciones").click());
  await act(() => button("Quitar la serie 1 de Sentadilla").click());
  expect(current().exercises[0].sets).toHaveLength(1);
  await act(() => button("Deshacer última acción").click());
  expect(current().exercises[0].sets[0]).toEqual(savedSet);
  expect(container.querySelector('[aria-label="Volumen de trabajo"]')?.textContent).toBe("480 kg");
});

it("una edición posterior invalida Deshacer para no pisar cambios nuevos", async () => {
  await mount();
  await act(() => button("Marcar como hecha la serie 1 de Sentadilla").click());
  const add = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Agregar serie"),
  )!;
  await act(() => add.click());
  expect(button("Deshacer última acción")).toBeNull();
  expect(current().exercises[0].sets).toHaveLength(3);
});

it("Enter pasa de peso a repeticiones y completar avanza al siguiente ejercicio", async () => {
  await mount();
  const weight = field("Peso de la serie 1 de Sentadilla (kg)");
  await act(() => {
    weight.focus();
    weight.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(document.activeElement).toBe(field("Repeticiones de la serie 1 de Sentadilla"));
  await act(() => button("Marcar como hecha la serie 1 de Sentadilla").click());
  await act(() => button("Marcar como hecha la serie 2 de Sentadilla").click());
  expect(container.querySelector('[data-exercise-id="se1"]')?.getAttribute("data-active")).toBe(
    "true",
  );
});

it("si no se puede guardar, avisa y permite reintentar sin perder el avance", async () => {
  const broken = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("cuota", "QuotaExceededError");
  });
  await mount();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "No se pudo guardar en este dispositivo",
  );
  await act(() => button("Marcar como hecha la serie 1 de Sentadilla").click());
  expect(localStorage.getItem(draftKey("student", "session"))).toBeNull();
  broken.mockRestore();
  await act(() => button("Reintentar guardado local").click());
  expect(current().exercises[0].sets[0].done).toBe(true);
  expect(container.textContent).toContain("Guardado en este dispositivo");
});

it("Enter en repeticiones marca y enfoca la siguiente serie; con datos inválidos se queda en el campo", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  await mount();
  const reps = field("Repeticiones de la serie 1 de Sentadilla");
  await act(() => {
    reps.focus();
    reps.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await act(() => {
    frames.splice(0).forEach((callback) => callback(0));
  });
  expect(current().exercises[0].sets[0].done).toBe(true);
  expect(document.activeElement).toBe(field("Peso de la serie 2 de Sentadilla (kg)"));
  await act(() => root.unmount());
  const invalid = initial();
  invalid.exercises[0].sets[0].weight = "";
  saveDraft(localStorage, invalid);
  root = createRoot(container);
  await mount();
  const badReps = field("Repeticiones de la serie 1 de Sentadilla");
  await act(() => {
    badReps.focus();
    badReps.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(document.activeElement).toBe(badReps);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Revisa el peso");
  expect(frames).toHaveLength(0);
});

it("deshacer recupera el plazo del descanso anterior en lugar de reiniciarlo", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
  await mount();
  await act(() => button("Marcar como hecha la serie 1 de Sentadilla").click());
  const deadline = current().rest?.endsAt;
  vi.setSystemTime(new Date("2026-10-19T15:00:20Z"));
  await act(() => button("Marcar como hecha la serie 2 de Sentadilla").click());
  await act(() => button("Deshacer última acción").click());
  expect(current().rest?.endsAt).toBe(deadline);
  expect(current().exercises[0].sets[1].done).toBe(false);
});
