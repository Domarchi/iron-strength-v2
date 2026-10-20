// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WeekWorkspace } from "./week-workspace";
import { SessionEditor } from "./session-editor";
import type { SessionRow } from "@/lib/data/programs";
const mocks = vi.hoisted(() => ({ save: vi.fn(), add: vi.fn(), duplicate: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../editor-actions", () => ({
  savePrescriptionsAction: mocks.save,
  addExercisesAction: mocks.add,
  duplicateRoutineAction: mocks.duplicate,
  reviewSessionAction: vi.fn(),
}));
vi.mock("../actions", () => ({
  moveExerciseAction: vi.fn(),
  removeExerciseAction: vi.fn(),
  removeSessionAction: vi.fn(),
}));
vi.mock("../action-form", () => ({
  ActionForm: ({ disabled, ariaLabel }: { disabled: boolean; ariaLabel: string }) => (
    <button disabled={disabled} aria-label={ariaLabel} />
  ),
}));
const session: SessionRow = {
  id: "s",
  revision: 2,
  label: "A",
  weekNumber: 1,
  position: 0,
  exercises: [
    {
      id: "a",
      exerciseId: "00000000-0000-4000-8000-000000000001",
      name: "Sentadilla",
      muscleGroup: "Piernas",
      equipment: "Barra",
      isBodyweight: false,
      incrementKg: 2.5,
      archived: false,
      position: 0,
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      targetWeightKg: null,
      note: null,
    },
  ],
};
const catalog = [
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Jalón",
    muscleGroup: "Espalda",
    equipment: "Polea",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Press",
    muscleGroup: "Pecho",
    equipment: "Barra",
  },
];
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() =>
    root.render(
      <WeekWorkspace
        weeks={[
          { number: 1, editable: true, sessions: 1, exercises: 1 },
          { number: 2, editable: true, sessions: 0, exercises: 0 },
        ]}
        initialWeek={1}
      >
        {[
          <SessionEditor
            key="s"
            userId="coach"
            programId="p"
            session={session}
            exercises={catalog}
          />,
          <p key="second">Segunda semana</p>,
        ]}
      </WeekWorkspace>,
    ),
  );
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const btn = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(text),
  )!;
async function fill(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("preserva las ediciones al cambiar semana y bloquea operaciones estructurales", async () => {
  await fill("Series de Sentadilla", "4");
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="Quitar Sentadilla"]')!.disabled,
  ).toBe(true);
  expect(btn("Agregar ejercicios").disabled).toBe(true);
  expect(btn("Duplicar sesión").disabled).toBe(true);
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="Duplicar Sentadilla"]')!.disabled,
  ).toBe(true);
  await act(() => btn("Semana 2").click());
  await act(() => btn("Semana 1").click());
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Series de Sentadilla"]')!.value,
  ).toBe("4");
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

it("una respuesta perdida conserva la misma identidad de copia y protege la salida", async () => {
  mocks.duplicate.mockRejectedValueOnce(new Error("offline"));
  await act(() =>
    container.querySelector<HTMLButtonElement>('[aria-label="Duplicar Sentadilla"]')!.click(),
  );
  expect(container.textContent).toContain("Reintentar copia");
  const first = mocks.duplicate.mock.calls[0][0] as FormData;
  expect(first.get("exerciseId")).toBe("a");
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(btn("Agregar ejercicios").disabled).toBe(true);
  mocks.duplicate.mockResolvedValueOnce({ error: null, savedIds: [first.get("copyId")] });
  await act(() => btn("Reintentar copia").click());
  expect(mocks.duplicate.mock.calls[1][0].get("copyId")).toBe(first.get("copyId"));
  expect(container.textContent).toContain("Ejercicio duplicado.");
  expect(btn("Agregar ejercicios").disabled).toBe(false);
});
it("no envía valores inválidos y conserva datos si falla el guardado", async () => {
  await fill("Reps mín. de Sentadilla", "15");
  await act(() => btn("Guardar sesión").click());
  expect(mocks.save).not.toHaveBeenCalled();
  expect(container.textContent).toContain("mínimo");
  await fill("Reps mín. de Sentadilla", "9");
  mocks.save.mockRejectedValueOnce(new Error("offline"));
  await act(() => btn("Guardar sesión").click());
  expect(container.textContent).toContain("Se conservan aquí");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Reps mín. de Sentadilla"]')!.value,
  ).toBe("9");
  expect(btn("Guardar sesión").disabled).toBe(false);
});
it("mantiene la selección al buscar y retira solo los ejercicios agregados en un fallo parcial", async () => {
  await act(() => btn("Agregar ejercicios").click());
  const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  await act(() => boxes[0].click());
  await fill("Buscar ejercicios", "barra");
  await act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(btn("Agregar seleccionados (2)")).toBeTruthy();
  mocks.add.mockResolvedValueOnce({ savedIds: [catalog[0].id], error: "Fallo parcial" });
  await act(() => btn("Agregar seleccionados").click());
  expect(container.textContent).toContain("Fallo parcial");
  expect(btn("Agregar seleccionados (1)")).toBeTruthy();
  expect(container.querySelector('[aria-label="Deseleccionar Jalón"]')).toBeNull();
  expect(container.querySelector('[aria-label="Deseleccionar Press"]')).not.toBeNull();
});

it("pide confirmación al salir por un enlace o cerrar la sesión y permite cancelar", async () => {
  await fill("Series de Sentadilla", "4");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const link = document.createElement("a");
  link.href = "/week";
  document.body.append(link);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  const form = document.createElement("form");
  document.body.append(form);
  const submit = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(submit);
  expect(submit.defaultPrevented).toBe(true);
  expect(confirm).toHaveBeenCalledTimes(2);
  link.remove();
  form.remove();
  confirm.mockRestore();
});

it("reintenta el lote completo con la misma identidad tras una respuesta perdida", async () => {
  const second = { ...session.exercises[0], id: "b", name: "Press", position: 1 };
  await act(() =>
    root.render(
      <WeekWorkspace
        weeks={[{ number: 1, editable: true, sessions: 1, exercises: 2 }]}
        initialWeek={1}
      >
        {[
          <SessionEditor
            key="s"
            userId="coach"
            programId="p"
            session={{ ...session, exercises: [...session.exercises, second] }}
            exercises={catalog}
          />,
        ]}
      </WeekWorkspace>,
    ),
  );
  await fill("Series de Sentadilla", "4");
  await fill("Series de Press", "2");
  mocks.save.mockRejectedValueOnce(new Error("offline"));
  await act(() => btn("Guardar sesión").click());
  expect(container.textContent).toContain("Se conservan aquí");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Series de Press"]')!.value).toBe(
    "2",
  );
  mocks.save.mockResolvedValueOnce({ savedIds: ["a", "b"], error: null, revision: 4 });
  await act(() => btn("Guardar sesión").click());
  const sent = JSON.parse(mocks.save.mock.calls[1][0].get("rows"));
  expect(sent.map((row: { id: string }) => row.id)).toEqual(["a", "b"]);
  expect(mocks.save.mock.calls[1][0].get("requestId")).toBe(
    mocks.save.mock.calls[0][0].get("requestId"),
  );
  expect(mocks.save.mock.calls[1][0].get("revision")).toBe("2");
});

it("persiste campos incompletos en el dispositivo y muestra el resultado real", async () => {
  await fill("Series de Sentadilla", "");
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("is:coach-draft:"));
  expect(keys).toHaveLength(1);
  const stored = JSON.parse(localStorage.getItem(keys[0])!);
  expect(stored.edits.a.sets).toBe("");
  expect(stored.userId).toBe("coach");
  expect(stored.revision).toBe(2);
  expect(container.textContent).toContain("Guardado en este dispositivo");
});

it("no afirma protección local cuando falla la cuota y permite reintentar", async () => {
  const fail = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  await fill("Series de Sentadilla", "5");
  expect(container.textContent).toContain("No se pudo guardar en este dispositivo");
  expect(container.textContent).not.toContain("Guardado en este dispositivo");
  fail.mockRestore();
  await act(() => btn("Reintentar guardado local").click());
  expect(container.textContent).toContain("Guardado en este dispositivo");
});
