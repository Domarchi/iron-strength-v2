// @vitest-environment jsdom
// T219: the ten original editor regressions now exercise the mounted canonical editor.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WeekWorkspace } from "./week-workspace";
import { CanonicalSessionEditor as SessionEditor } from "./canonical-session-editor";
import type { CoachSessionRow } from "@/lib/data/coach-programs";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
import {
  applyCoachPrescriptionChanges,
  type CoachSessionRequest,
} from "@/domain/coach-session-mutation";
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), review: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../canonical-editor-actions", () => ({
  mutateCanonicalSessionAction: mocks.mutate,
  reviewCanonicalSessionAction: mocks.review,
  reconcileLegacySessionAction: vi.fn(),
}));
vi.mock("../actions", () => ({ removeSessionAction: vi.fn() }));
vi.mock("../action-form", () => ({
  ActionForm: ({ disabled, ariaLabel }: { disabled: boolean; ariaLabel: string }) => (
    <button disabled={disabled} aria-label={ariaLabel} />
  ),
}));
const scope = {
    userId: crypto.randomUUID(),
    programId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
  },
  rowId = crypto.randomUUID();
const baseExercise = {
  id: crypto.randomUUID(),
  name: "Sentadilla",
  muscleGroup: "Piernas",
  equipment: "Barra",
  recordType: null,
};
const catalog = [
  {
    id: crypto.randomUUID(),
    name: "Jalón",
    muscleGroup: "Espalda",
    equipment: "Polea",
    recordType: null,
  },
  {
    id: crypto.randomUUID(),
    name: "Press",
    muscleGroup: "Pecho",
    equipment: "Barra",
    recordType: null,
  },
];
let session: CoachSessionRow, container: HTMLDivElement, root: ReturnType<typeof createRoot>;
function row(
  id: string,
  exercise = baseExercise,
  position = 0,
): CoachSessionRow["exercises"][number] {
  return {
    id,
    exerciseId: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    equipment: exercise.equipment,
    recordType: null,
    position,
    isBodyweight: false,
    incrementKg: 2.5,
    archived: false,
    prescribed: parsePrescriptionInput(defaultPrescriptionInput(null)),
    note: null,
    restSeconds: null,
    supersetId: null,
    supersetRestSeconds: null,
    alternatives: [],
  };
}
async function mount() {
  await act(() =>
    root.render(
      <WeekWorkspace
        weeks={[
          { number: 1, editable: true, sessions: 1, exercises: session.exercises.length },
          { number: 2, editable: true, sessions: 0, exercises: 0 },
        ]}
        initialWeek={1}
      >
        {[
          <SessionEditor
            key={scope.sessionId}
            userId={scope.userId}
            programId={scope.programId}
            session={session}
            exercises={catalog}
          />,
          <p key="second">Segunda semana</p>,
        ]}
      </WeekWorkspace>,
    ),
  );
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  let tail = Promise.resolve();
  vi.stubGlobal("navigator", {
    ...navigator,
    locks: {
      request: async (_name: string, operation: () => void) => {
        const next = tail.then(operation);
        tail = next.catch(() => {});
        await next;
      },
    },
  });
  session = {
    id: scope.sessionId,
    revision: 2,
    label: "A",
    title: null,
    weekday: null,
    weekNumber: 1,
    position: 0,
    exercises: [row(rowId)],
  };
  mocks.review.mockImplementation(async () => session);
  mocks.mutate.mockImplementation(async ({ request }: { request: CoachSessionRequest }) => {
    session = { ...session, revision: request.revision + 1 };
    if (request.operation === "prescribe")
      for (const patch of request.data.rows)
        session.exercises = session.exercises.map((item) =>
          item.id === patch.id
            ? { ...item, prescribed: applyCoachPrescriptionChanges(item.prescribed, patch.changes) }
            : item,
        );
    if (request.operation === "add")
      for (const item of request.data.items)
        session.exercises = [
          ...session.exercises,
          row(
            item.id,
            catalog.find((ex) => ex.id === item.exerciseId)!,
            session.exercises.length,
          ),
        ];
    if (request.operation === "duplicate" && request.data.rowId !== null)
      session.exercises = [
        ...session.exercises,
        {
          ...session.exercises.find((item) => item.id === request.data.rowId)!,
          id: request.data.copyId,
          position: session.exercises.length,
        },
      ];
    return {
      ok: true,
      result: {
        version: 2,
        id: request.id,
        sessionId: scope.sessionId,
        revision: session.revision,
        status: "applied",
        ...(request.operation === "duplicate"
          ? {
              copyId: request.data.copyId,
              copyKind: request.data.rowId === null ? "session" : "exercise",
            }
          : {}),
      },
    };
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await mount();
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const btn = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes(text),
  )!;
async function fill(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(text: string) {
  expect(btn(text)).toBeDefined();
  await act(() => btn(text).click());
}
const posted = (index = 0) => mocks.mutate.mock.calls[index][0] as { request: CoachSessionRequest };
async function selectFirst() {
  await click("Agregar ejercicios");
  await act(() =>
    container
      .querySelector<HTMLInputElement>(
        '[aria-label="Catálogo de ejercicios"] input[type="checkbox"]',
      )!
      .click(),
  );
}
it("preserva las ediciones al cambiar semana y bloquea operaciones estructurales", async () => {
  await fill("Series de Sentadilla", "4");
  for (const label of ["Quitar Sentadilla", "Duplicar Sentadilla"])
    expect(container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.disabled).toBe(
      true,
    );
  expect(btn("Agregar ejercicios").disabled).toBe(true);
  expect(btn("Duplicar sesión").disabled).toBe(true);
  await click("Semana 2");
  await click("Semana 1");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Series de Sentadilla"]')!.value,
  ).toBe("4");
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});
it("una respuesta perdida conserva la misma identidad de copia y protege la salida", async () => {
  mocks.mutate.mockRejectedValueOnce(Error("offline"));
  await act(() =>
    container.querySelector<HTMLButtonElement>('[aria-label="Duplicar Sentadilla"]')!.click(),
  );
  expect(container.textContent).toContain("Reintentar operación");
  const first = posted().request;
  expect(first).toMatchObject({ operation: "duplicate", data: { rowId } });
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(btn("Agregar ejercicios").disabled).toBe(true);
  await click("Reintentar operación");
  expect(posted(1).request).toEqual(first);
  expect(container.textContent).toContain("Ejercicio duplicado.");
  expect(btn("Agregar ejercicios").disabled).toBe(false);
});
it("no envía valores inválidos y conserva datos si falla el guardado", async () => {
  await fill("Reps mín. de Sentadilla", "15");
  await click("Guardar sesión");
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(container.textContent).toContain("mínimo");
  await fill("Reps mín. de Sentadilla", "9");
  mocks.mutate.mockRejectedValueOnce(Error("offline"));
  await click("Guardar sesión");
  expect(container.textContent).toContain("No recibimos confirmación");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Reps mín. de Sentadilla"]')!.value,
  ).toBe("9");
  expect(btn("Guardar sesión").disabled).toBe(false);
});
it("mantiene toda la selección al buscar si el lote falla", async () => {
  await selectFirst();
  await fill("Buscar ejercicios", "barra");
  await act(() =>
    container
      .querySelector<HTMLInputElement>(
        '[aria-label="Catálogo de ejercicios"] input[type="checkbox"]',
      )!
      .click(),
  );
  expect(btn("Agregar seleccionados (2)")).toBeDefined();
  mocks.mutate.mockResolvedValueOnce({ ok: false, reason: "invalid" });
  await click("Agregar seleccionados");
  expect(container.textContent).toContain("Revisa los datos");
  expect(btn("Agregar seleccionados (2)")).toBeDefined();
  expect(container.querySelector('[aria-label="Deseleccionar Jalón"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Deseleccionar Press"]')).not.toBeNull();
  expect(posted().request).toMatchObject({
    operation: "add",
    data: { items: [{ exerciseId: catalog[0].id }, { exerciseId: catalog[1].id }] },
  });
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
});
it("reintenta el lote completo con la misma identidad tras una respuesta perdida", async () => {
  const second = row(crypto.randomUUID(), catalog[1], 1);
  session = { ...session, exercises: [...session.exercises, second] };
  await mount();
  await fill("Series de Sentadilla", "4");
  await fill("Series de Press", "2");
  mocks.mutate.mockRejectedValueOnce(Error("offline"));
  await click("Guardar sesión");
  expect(container.textContent).toContain("No recibimos confirmación");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Series de Press"]')!.value).toBe(
    "2",
  );
  const first = posted().request;
  await click("Guardar sesión");
  const sent = posted(1).request;
  expect(sent).toEqual(first);
  expect(sent.revision).toBe(2);
  if (sent.operation !== "prescribe") throw Error("wrong operation");
  expect(sent.data.rows.map((item) => item.id)).toEqual([rowId, second.id]);
});
it("persiste campos incompletos en el dispositivo y muestra el resultado real", async () => {
  await fill("Series de Sentadilla", "");
  const keys = Object.keys(localStorage).filter((key) => key.startsWith("is:coach-draft:"));
  expect(keys).toHaveLength(1);
  const stored = JSON.parse(localStorage.getItem(keys[0])!);
  expect(stored.edits[rowId].targets.input.sets).toBe("");
  expect(stored.userId).toBe(scope.userId);
  expect(stored.revision).toBe(2);
  expect(container.textContent).toContain("Guardado en este dispositivo");
});
it("no afirma protección local cuando falla la cuota y permite reintentar", async () => {
  const fail = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("quota");
  });
  await fill("Series de Sentadilla", "5");
  expect(container.textContent).toContain("No pudimos confirmar el guardado en este dispositivo");
  expect(container.textContent).not.toContain("Guardado en este dispositivo");
  fail.mockRestore();
  await click("Reintentar guardado local");
  expect(container.textContent).toContain("Guardado en este dispositivo");
});
it("un agregado incierto conserva el mismo ID y todas las filas al confirmar", async () => {
  await selectFirst();
  mocks.mutate.mockRejectedValueOnce(Error("offline"));
  await click("Agregar seleccionados");
  const first = posted().request;
  expect(btn("Reintentar operación").disabled).toBe(false);
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="Duplicar Sentadilla"]')!.disabled,
  ).toBe(true);
  await click("Reintentar operación");
  expect(posted(1).request).toEqual(first);
  expect(first).toMatchObject({
    operation: "add",
    data: { items: [{ exerciseId: catalog[0].id }] },
  });
});
it("no envía un agregado si no puede confirmar su copia local", async () => {
  await selectFirst();
  const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("quota");
  });
  await click("Agregar seleccionados");
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(container.textContent).toContain("No pudimos confirmar el guardado en este dispositivo");
  blocked.mockRestore();
});
