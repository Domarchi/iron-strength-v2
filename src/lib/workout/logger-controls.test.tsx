// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkoutRunner } from "@/app/(app)/workout/[plannedSessionId]/runner";
import type { WorkoutContext } from "@/lib/data/workout-context";

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
  exercises: [
    {
      sessionExerciseId: "se1",
      exerciseId: "ex1",
      name: "Sentadilla",
      isBodyweight: false,
      prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
      lastWeightKg: null,
      note: null,
      suggestion: null,
      last: null,
    },
  ],
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
  vi.unstubAllGlobals();
});
const mount = () => act(() => root.render(<WorkoutRunner userId="student" context={context} />));
const button = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const selectRest = async (seconds: string) => {
  const select = container.querySelector<HTMLSelectElement>("select")!;
  await act(() => {
    select.value = seconds;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

it("aplica el descanso elegido al marcar y conserva la elección al volver a la sesión", async () => {
  await mount();
  await selectRest("120");
  await act(() => button("Marcar como hecha la serie 1 de Sentadilla").click());
  expect(container.querySelector('[data-testid="rest-clock"]')?.textContent).toBe("2:00");
  expect(container.querySelector('[aria-label="Volumen de trabajo"]')?.textContent).toBe("480 kg");
  await selectRest("0");
  // Cambiar la preferencia no cancela un descanso que ya está en curso.
  expect(container.querySelector('[role="timer"]')).not.toBeNull();
  await act(() => button("Marcar como hecha la serie 2 de Sentadilla").click());
  expect(container.querySelector('[role="timer"]')).toBeNull();
  expect(container.querySelector('[aria-label="Volumen de trabajo"]')?.textContent).toBe("960 kg");
  await act(() => button("Desmarcar la serie 1 de Sentadilla").click());
  expect(container.querySelector('[aria-label="Volumen de trabajo"]')?.textContent).toBe("480 kg");
  await act(() => root.unmount());
  root = createRoot(container);
  await mount();
  expect(container.querySelector("select")?.value).toBe("0");
  expect(container.querySelector('[aria-label="Volumen de trabajo"]')?.textContent).toBe("480 kg");
});
