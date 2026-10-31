// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CanonicalSessionEditor } from "./canonical-session-editor";
import type { CoachSessionRow } from "@/lib/data/coach-programs";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
import type { CoachSessionRequest } from "@/domain/coach-session-mutation";
import { WeekWorkspace } from "./week-workspace";
import { SessionWorkspace } from "./session-workspace";
const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  review: vi.fn(),
  legacy: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../canonical-editor-actions", () => ({
  mutateCanonicalSessionAction: mocks.mutate,
  reviewCanonicalSessionAction: mocks.review,
  reconcileLegacySessionAction: mocks.legacy,
}));
vi.mock("../actions", () => ({ removeSessionAction: vi.fn() }));
vi.mock("../action-form", () => ({
  ActionForm: ({ ariaLabel, disabled }: { ariaLabel: string; disabled: boolean }) => (
    <button aria-label={ariaLabel} disabled={disabled} />
  ),
}));
const scope = {
  userId: crypto.randomUUID(),
  programId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
};
const ids = [crypto.randomUUID(), crypto.randomUUID()],
  exerciseIds = [crypto.randomUUID(), crypto.randomUUID()];
const catalog = [
  {
    id: exerciseIds[0],
    name: "Sostener carga",
    recordType: "weight_duration" as const,
    muscleGroup: "Core",
    equipment: null,
  },
  {
    id: exerciseIds[1],
    name: "Recorrer distancia",
    recordType: "distance_duration" as const,
    muscleGroup: "Piernas",
    equipment: null,
  },
];
let source: CoachSessionRow, container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal("navigator", {
    ...navigator,
    locks: {
      request: async (name: string, operation: () => void) => {
        const task = (tails.get(name) ?? Promise.resolve()).then(operation);
        tails.set(
          name,
          task.catch(() => {}),
        );
        await task;
      },
    },
  });
  source = {
    id: scope.sessionId,
    revision: 2,
    title: null,
    weekday: null,
    weekNumber: 1,
    label: "A",
    position: 0,
    exercises: catalog.map((exercise, i) => ({
      id: ids[i],
      exerciseId: exercise.id,
      name: exercise.name,
      recordType: exercise.recordType,
      muscleGroup: exercise.muscleGroup,
      equipment: null,
      isBodyweight: false,
      incrementKg: 2.5,
      archived: false,
      position: i,
      prescribed: parsePrescriptionInput(defaultPrescriptionInput(exercise.recordType)),
      note: null,
      restSeconds: 90,
      supersetId: null,
      supersetRestSeconds: null,
      alternatives: [],
    })),
  };
  mocks.review.mockImplementation(async () => source);
  mocks.mutate.mockImplementation(async ({ request }: { request: CoachSessionRequest }) => {
    source = { ...source, revision: source.revision + 1 };
    if (request.operation === "prescribe")
      for (const patch of request.data.rows) {
        source.exercises = source.exercises.map((row) =>
          row.id !== patch.id
            ? row
            : {
                ...row,
                ...(patch.changes.prescribed ? { prescribed: patch.changes.prescribed } : {}),
                ...(patch.changes.note !== undefined ? { note: patch.changes.note } : {}),
              },
        );
      }
    if (request.operation === "layout")
      source.exercises = request.data.items.map((item) => ({
        ...source.exercises.find((row) => row.id === item.id)!,
        ...item,
      }));
    if (request.operation === "order")
      source.exercises = request.data.ids.map((id, i) => ({
        ...source.exercises.find((row) => row.id === id)!,
        position: i,
      }));
    return {
      ok: true,
      result: {
        version: 2,
        id: request.id,
        sessionId: scope.sessionId,
        revision: source.revision,
        status: "applied",
      },
    };
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(() =>
    root.render(
      <WeekWorkspace
        weeks={[{ number: 1, editable: true, sessions: 1, exercises: 2 }]}
        initialWeek={1}
      >
        {[
          <CanonicalSessionEditor
            key={scope.sessionId}
            userId={scope.userId}
            programId={scope.programId}
            session={source}
            exercises={catalog}
          />,
        ]}
      </WeekWorkspace>,
    ),
  );
}
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text,
  )!;
async function click(text: string) {
  expect(button(text)).not.toBeUndefined();
  await act(() => button(text).click());
}
async function fill(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(input).not.toBeNull();
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("monta los objetivos reales y guarda el documento protegido con la cuenta original", async () => {
  await mount();
  expect(container.querySelector('[aria-label="Reps mín. de Sostener carga"]')).toBeNull();
  await fill("Tiempo (s) de Sostener carga", "45");
  await fill("Peso (kg) de Sostener carga", "20,5");
  expect(container.textContent).toContain("Guardado en este dispositivo");
  await click("Guardar sesión");
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
  const posted = mocks.mutate.mock.calls[0][0];
  expect(posted).toMatchObject({
    ...scope,
    request: {
      version: 2,
      revision: 2,
      operation: "prescribe",
      data: {
        rows: [
          {
            id: ids[0],
            changes: {
              prescribed: {
                recordType: "weight_duration",
                target: { repsMin: null, targetWeightKg: 20.5, targetDurationSeconds: 45 },
              },
            },
          },
        ],
      },
    },
  });
  expect(container.textContent).toContain("Cambios guardados");
});
it("cuota llena protege el mismo intento y nunca envía antes de confirmar su escritura", async () => {
  await mount();
  await fill("Tiempo (s) de Sostener carga", "60");
  const quota = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("quota");
  });
  await click("Guardar sesión");
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Reintentar");
  quota.mockRestore();
  await click("Reintentar operación");
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
});
it("un sobre futuro se conserva y no habilita un editor vacío", async () => {
  const key = `is:coach-draft:v1:${scope.userId}:${scope.programId}:${scope.sessionId}:${crypto.randomUUID()}`;
  localStorage.setItem(key, '{"version":99}');
  await mount();
  expect(container.textContent).toContain("formato");
  expect(localStorage.getItem(key)).toBe('{"version":99}');
  expect(container.querySelector('[aria-label="Tiempo (s) de Sostener carga"]')).toBeNull();
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it("agrupa y mueve un bloque completo conservando los controles de teclado", async () => {
  await mount();
  await act(() =>
    container.querySelector<HTMLInputElement>('[aria-label="Seleccionar Sostener carga"]')!.click(),
  );
  await act(() =>
    container
      .querySelector<HTMLInputElement>('[aria-label="Seleccionar Recorrer distancia"]')!
      .click(),
  );
  await click("Agrupar seleccionados (2)");
  expect(mocks.mutate.mock.calls[0][0].request.operation).toBe("layout");
  expect(container.textContent).toContain("Superserie 1");
  expect(container.querySelector('[aria-label="Separar Superserie 1"]')).not.toBeNull();
});
it("el lote ofrece solo dimensiones comunes y conserva la vista previa antes de aplicar", async () => {
  await mount();
  await act(() =>
    container.querySelector<HTMLInputElement>('[aria-label="Seleccionar Sostener carga"]')!.click(),
  );
  await act(() =>
    container
      .querySelector<HTMLInputElement>('[aria-label="Seleccionar Recorrer distancia"]')!
      .click(),
  );
  expect(container.querySelector('[aria-label="Cambiar peso"]')).toBeNull();
  expect(container.querySelector('[aria-label="Cambiar repeticiones"]')).toBeNull();
  await act(() =>
    container.querySelector<HTMLInputElement>('[aria-label="Cambiar tiempo"]')!.click(),
  );
  await fill("Tiempo para la selección (segundos)", "45");
  expect(container.querySelector('[aria-label="Vista previa del lote"]')).not.toBeNull();
  await click("Aplicar al borrador");
  expect(mocks.mutate).not.toHaveBeenCalled();
  await click("Guardar sesión");
  expect(
    mocks.mutate.mock.calls[0][0].request.data.rows.map((row: { changes: unknown }) => row.changes),
  ).toEqual([{ targetDurationSeconds: 45 }, { targetDurationSeconds: 45 }]);
});
it("activa la copia solo cuando la respuesta de servidor ya la incorporó a las pestañas", async () => {
  let copyId: string | undefined;
  mocks.mutate.mockImplementationOnce(async ({ request }: { request: CoachSessionRequest }) => {
    if (request.operation !== "duplicate") throw Error("unexpected");
    copyId = request.data.copyId;
    source = { ...source, revision: source.revision + 1 };
    return {
      ok: true,
      result: {
        version: 2,
        id: request.id,
        sessionId: scope.sessionId,
        revision: source.revision,
        status: "applied",
        copyId,
        copyKind: "session",
      },
    };
  });
  const render = async (includeCopy: boolean) => {
    const sessions = [
      { id: source.id, label: "A" },
      ...(includeCopy ? [{ id: copyId!, label: "B" }] : []),
    ];
    await act(() =>
      root.render(
        <WeekWorkspace
          initialWeek={1}
          weeks={[
            {
              number: 1,
              editable: true,
              sessions: sessions.length,
              exercises: 2,
              sessionIds: sessions.map((session) => session.id),
            },
          ]}
        >
          {[
            <SessionWorkspace key="sessions" sessions={sessions}>
              {[
                <CanonicalSessionEditor
                  key={scope.sessionId}
                  userId={scope.userId}
                  programId={scope.programId}
                  session={source}
                  exercises={catalog}
                />,
                ...(includeCopy ? [<p key="copy">Sesión copiada visible</p>] : []),
              ]}
            </SessionWorkspace>,
          ]}
        </WeekWorkspace>,
      ),
    );
  };
  await render(false);
  await click("Duplicar sesión A");
  expect(copyId).toBeDefined();
  await render(true);
  expect(
    container
      .querySelector(`[aria-controls="editor-session-${copyId}"]`)
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
  expect(container.querySelector<HTMLElement>(`#editor-session-${copyId}`)?.hidden).toBe(false);
});
it("muestra el orden propuesto y el actual antes de descartar un movimiento rechazado", async () => {
  await mount();
  mocks.mutate.mockResolvedValueOnce({ ok: false, reason: "conflict" });
  await click("Bajar Sostener carga");
  await click("Revisar versión actual");
  const proposed = container.querySelector('[aria-label="Orden y grupos de tu borrador"]');
  const actual = container.querySelector('[aria-label="Orden y grupos actuales"]');
  expect(proposed).not.toBeNull();
  expect(actual).not.toBeNull();
  expect(proposed!.querySelector("li")!.textContent).toContain("Recorrer distancia");
  expect(actual!.querySelector("li")!.textContent).toContain("Sostener carga");
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
});
it("la revisión de alternativas muestra explícitamente que el servidor no tiene alternativas", async () => {
  await mount();
  // Exercise an alternatives conflict through a fully protected restored draft.
  const id = crypto.randomUUID();
  await act(() => root.unmount());
  root = createRoot(container);
  localStorage.clear();
  sessionStorage.clear();
  const raw = {
    version: 4,
    ...scope,
    id,
    revision: 1,
    updatedAt: "2026-10-29T00:00:00.000Z",
    edits: {},
    selection: [],
    additionSelection: [],
    bulk: null,
    alternatives: {
      [ids[0]]: [
        { exerciseId: exerciseIds[1], input: defaultPrescriptionInput("distance_duration") },
      ],
    },
    order: null,
    pending: null,
    previousRaw: null,
  };
  localStorage.setItem(
    `is:coach-draft:v1:${scope.userId}:${scope.programId}:${scope.sessionId}:${id}`,
    JSON.stringify(raw),
  );
  await mount();
  await click("Revisar versión actual");
  expect(container.textContent).toContain("Actual: Sin alternativas");
});
it("muestra ejercicios e indicaciones actuales al revisar un agregado con revisión antigua", async () => {
  const id = crypto.randomUUID();
  source.exercises[0].note = "Indicación remota";
  localStorage.setItem(
    `is:coach-draft:v1:${scope.userId}:${scope.programId}:${scope.sessionId}:${id}`,
    JSON.stringify({
      version: 4,
      ...scope,
      id,
      revision: 1,
      updatedAt: "2026-10-29T00:00:00.000Z",
      edits: {},
      selection: [],
      additionSelection: [exerciseIds[1]],
      bulk: null,
      alternatives: {},
      order: null,
      pending: null,
      previousRaw: null,
    }),
  );
  await mount();
  await click("Revisar versión actual");
  const review = container.querySelector('[aria-label="Revisión de conflicto"]');
  expect(review?.textContent).toContain("Indicación remota");
  expect(review?.querySelector('[aria-label="Ejercicios que agregarás"]')?.textContent).toContain(
    "Recorrer distancia",
  );
});

it("vincula la biblioteca a la sesión visible y conserva el objetivo al cambiar de sesión", async () => {
  const second = { ...source, id: crypto.randomUUID(), label: "B", title: "Piernas" };
  await act(() =>
    root.render(
      <WeekWorkspace
        weeks={[{ number: 1, editable: true, sessions: 2, exercises: 4 }]}
        initialWeek={1}
      >
        {[
          <SessionWorkspace key="sessions" sessions={[source, second]}>
            {[source, second].map((session) => (
              <CanonicalSessionEditor
                key={session.id}
                userId={scope.userId}
                programId={scope.programId}
                session={session}
                exercises={catalog}
              />
            ))}
          </SessionWorkspace>,
        ]}
      </WeekWorkspace>,
    ),
  );
  await fill("Tiempo (s) de Sostener carga", "45");
  await click("Sesión B · Piernas");
  const activePanel = container.querySelector<HTMLElement>("[data-session-panel]:not([hidden])")!;
  expect(activePanel.querySelector("aside")!.textContent).toContain("Destino: sesión B");
  await act(() =>
    container
      .querySelector<HTMLButtonElement>(`button[aria-controls="editor-session-${source.id}"]`)!
      .click(),
  );
  const restored = container.querySelector<HTMLElement>("[data-session-panel]:not([hidden])")!;
  expect(
    restored.querySelector<HTMLInputElement>('input[aria-label="Tiempo (s) de Sostener carga"]')!
      .value,
  ).toBe("45");
  expect(restored.querySelector("aside")!.textContent).toContain("Destino: sesión A");
  expect(mocks.mutate).not.toHaveBeenCalled();
});
