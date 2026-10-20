// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SortableExerciseList } from "./sortable-exercise-list";
import { CleanEditor, useRoutineGuard, WeekWorkspace } from "./week-workspace";
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const reorder = vi.fn();
const busy = vi.fn();
const items = [
  { id: "a", name: "Sentadilla" },
  { id: "b", name: "Press" },
  { id: "c", name: "Remo" },
];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const mount = (disabled = false) =>
  act(() =>
    root.render(
      <SortableExerciseList
        items={items}
        disabled={disabled}
        onReorder={reorder}
        onBusyChange={busy}
      >
        {(item, index, handle) => (
          <div>
            {handle}
            <span>
              {index + 1}. {item.name}
            </span>
          </div>
        )}
      </SortableExerciseList>,
    ),
  );
const handle = () =>
  container.querySelector<HTMLButtonElement>('[aria-label="Reordenar Sentadilla"]')!;
const key = (value: string) =>
  act(() =>
    handle().dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
    ),
  );
it("Espacio levanta, flechas cambian destino y Enter confirma la permutación completa", async () => {
  await mount();
  await key(" ");
  await key("ArrowDown");
  await key("ArrowDown");
  expect(container.textContent).toContain("posición 3 de 3");
  expect(reorder).not.toHaveBeenCalled();
  await key("Enter");
  expect(reorder).toHaveBeenCalledWith(["b", "c", "a"]);
  expect(busy).toHaveBeenLastCalledWith(false);
});
it("Escape cancela, no escribe al soltar en el mismo lugar y no inicia si está bloqueado", async () => {
  await mount();
  await key("Enter");
  await key("ArrowDown");
  await key("Escape");
  expect(reorder).not.toHaveBeenCalled();
  await key(" ");
  await key("Enter");
  expect(reorder).not.toHaveBeenCalled();
  await mount(true);
  expect(handle().disabled).toBe(true);
  await key("Enter");
  expect(busy).toHaveBeenCalledTimes(4);
});

function GuardProbe() {
  const guard = useRoutineGuard();
  return (
    <div>
      <button onClick={() => guard.setDirty("session-drag", true)}>Levantar</button>
      <button onClick={() => guard.setDirty("session-order", true)}>Soltar</button>
      <CleanEditor>
        <button>Quitar</button>
      </CleanEditor>
    </div>
  );
}
it("protege durante el gesto sin insertar un aviso superior que desplace los destinos", async () => {
  await act(() =>
    root.render(
      <WeekWorkspace
        weeks={[{ number: 1, editable: true, sessions: 1, exercises: 2 }]}
        initialWeek={1}
      >
        {[<GuardProbe key="probe" />]}
      </WeekWorkspace>,
    ),
  );
  const button = (name: string) =>
    [...container.querySelectorAll("button")].find((b) => b.textContent === name)!;
  await act(() => button("Levantar").click());
  expect(container.textContent).not.toContain("Tienes cambios sin guardar");
  expect(container.querySelector("fieldset")!.disabled).toBe(true);
  await act(() => button("Soltar").click());
  expect(container.textContent).toContain("Tienes cambios sin guardar");
});
