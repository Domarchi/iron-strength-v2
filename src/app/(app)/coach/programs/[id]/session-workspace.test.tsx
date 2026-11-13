// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionWorkspace } from "./session-workspace";
let root: ReturnType<typeof createRoot> | undefined, host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  host?.remove();
});
it("muestra una sesión, conserva sus campos montados y admite cambiar por teclado", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() =>
    root!.render(
      <SessionWorkspace
        sessions={[
          { id: "a", label: "A", title: null },
          { id: "b", label: "B", title: "Inferior" },
        ]}
      >
        {[
          <input key="a" aria-label="Campo A" defaultValue="3" />,
          <input key="b" aria-label="Campo B" defaultValue="4" />,
        ]}
      </SessionWorkspace>,
    ),
  );
  const input = host.querySelector<HTMLInputElement>('[aria-label="Campo A"]')!;
  input.value = "7";
  const buttons = host.querySelectorAll<HTMLButtonElement>("nav button");
  expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  await act(() => buttons[1].click());
  expect(input.closest<HTMLElement>("[data-session-panel]")!.hidden).toBe(true);
  await act(() => buttons[0].click());
  expect(input.value).toBe("7");
  expect(input.closest<HTMLElement>("[data-session-panel]")!.hidden).toBe(false);
  buttons[0].focus();
  await act(() =>
    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
  );
  expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
  expect(document.activeElement).toBe(buttons[1]);
});

import { WeekWorkspace, useRoutineGuard } from "./week-workspace";
function DragProbe() {
  const guard = useRoutineGuard();
  return <button onClick={() => guard.setDirty("a-drag", true)}>Iniciar gesto</button>;
}
it("el arrastre transitorio no inserta avisos ni mueve la lista bajo el puntero", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() =>
    root!.render(
      <WeekWorkspace
        weeks={[{ number: 1, editable: true, sessions: 2, exercises: 2, sessionIds: ["a", "b"] }]}
        initialWeek={1}
      >
        {[
          <SessionWorkspace
            key="week"
            sessions={[
              { id: "a", label: "A" },
              { id: "b", label: "B" },
            ]}
          >
            {[<DragProbe key="a" />, <p key="b">Otra sesión</p>]}
          </SessionWorkspace>,
        ]}
      </WeekWorkspace>,
    ),
  );
  await act(() =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Iniciar gesto")!.click(),
  );
  expect(host.textContent).not.toContain("Cambios pendientes");
  expect(host.textContent).not.toContain("Las sesiones con cambios pendientes");
});

it("recupera la posición por programa y conserva campos al cambiar de sesión", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const scope = { userId: "coach", programId: "base" };
  const render = async (programId = "base") =>
    act(() =>
      root!.render(
        <WeekWorkspace
          key={programId}
          scope={{ ...scope, programId }}
          initialWeek={1}
          weeks={[
            { number: 1, editable: true, sessions: 2, exercises: 2, sessionIds: ["a", "b"] },
            { number: 3, editable: true, sessions: 2, exercises: 2, sessionIds: ["c", "d"] },
          ]}
        >
          {[
            ["a", "b"],
            ["c", "d"],
          ].map((ids, index) => (
            <SessionWorkspace
              key={index}
              weekNumber={index ? 3 : 1}
              sessions={ids.map((id) => ({ id, label: id }))}
            >
              {ids.map((id) => (
                <input key={id} aria-label={id} defaultValue={id} />
              ))}
            </SessionWorkspace>
          ))}
        </WeekWorkspace>,
      ),
    );
  await render();
  await act(() =>
    host.querySelector<HTMLButtonElement>('[aria-controls="editor-week-3"]')!.click(),
  );
  await act(() =>
    host.querySelector<HTMLButtonElement>('[aria-controls="editor-session-d"]')!.click(),
  );
  await act(() => root!.unmount());
  root = createRoot(host);
  await render();
  expect(host.querySelector('[aria-controls="editor-week-3"]')!.getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(
    host.querySelector('[aria-controls="editor-session-d"]')!.getAttribute("aria-pressed"),
  ).toBe("true");
  await render("other");
  expect(host.querySelector('[aria-controls="editor-week-1"]')!.getAttribute("aria-pressed")).toBe(
    "true",
  );
  sessionStorage.clear();
});

it.each([
  { ctrlKey: true },
  { metaKey: true },
  { altKey: true },
  { shiftKey: true },
  { isComposing: true },
])("no cambia de sesión durante una combinación reservada %j", async (options) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() =>
    root!.render(
      <SessionWorkspace
        sessions={[
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ]}
      >
        {[<input key="a" defaultValue="Pendiente" />, <input key="b" />]}
      </SessionWorkspace>,
    ),
  );
  const buttons = host.querySelectorAll<HTMLButtonElement>("nav button");
  buttons[0].focus();
  const event = new KeyboardEvent("keydown", {
    key: "ArrowRight",
    bubbles: true,
    cancelable: true,
    ...options,
  });
  await act(() => {
    buttons[0].dispatchEvent(event);
  });
  expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  expect(document.activeElement).toBe(buttons[0]);
  expect(event.defaultPrevented).toBe(false);
});

it("recorre semanas con foco sin desmontar campos o guardar la rutina", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = () =>
    act(() =>
      root!.render(
        <WeekWorkspace
          scope={{ userId: "keyboard-coach", programId: "keyboard-program" }}
          initialWeek={1}
          weeks={[1, 3, 4].map((number) => ({
            number,
            editable: number !== 1,
            sessions: 1,
            exercises: 1,
          }))}
        >
          {[1, 3, 4].map((number) => (
            <input key={number} aria-label={`Campo semana ${number}`} defaultValue="3" />
          ))}
        </WeekWorkspace>,
      ),
    );
  await render();
  const buttons = host.querySelectorAll<HTMLButtonElement>(
    'nav[aria-label="Semanas del programa"] button',
  );
  const input = host.querySelector<HTMLInputElement>('[aria-label="Campo semana 1"]')!;
  input.value = "7,5";
  buttons[0].focus();
  for (const [key, expected] of [
    ["ArrowRight", 1],
    ["End", 2],
    ["ArrowRight", 0],
    ["ArrowLeft", 2],
    ["Home", 0],
  ] as const) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    await act(() => {
      document.activeElement!.dispatchEvent(event);
    });
    expect(buttons[expected].getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(buttons[expected]);
    expect(event.defaultPrevented).toBe(true);
  }
  expect(host.querySelector('[aria-label="Campo semana 1"]')).toBe(input);
  expect(input.value).toBe("7,5");
  await act(() => {
    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
  });
  await act(() => root!.unmount());
  root = createRoot(host);
  await render();
  expect(host.querySelector('[aria-controls="editor-week-4"]')!.getAttribute("aria-pressed")).toBe(
    "true",
  );
  sessionStorage.clear();
});

it.each([
  { ctrlKey: true },
  { metaKey: true },
  { altKey: true },
  { shiftKey: true },
  { isComposing: true },
])("conserva semana y foco durante una combinación reservada %j", async (options) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() =>
    root!.render(
      <WeekWorkspace
        initialWeek={1}
        weeks={[1, 2].map((number) => ({ number, editable: true, sessions: 1, exercises: 1 }))}
      >
        {[<input key="1" defaultValue="Pendiente" />, <input key="2" />]}
      </WeekWorkspace>,
    ),
  );
  const buttons = host.querySelectorAll<HTMLButtonElement>(
    'nav[aria-label="Semanas del programa"] button',
  );
  buttons[0].focus();
  const event = new KeyboardEvent("keydown", {
    key: "End",
    bubbles: true,
    cancelable: true,
    ...options,
  });
  await act(() => {
    buttons[0].dispatchEvent(event);
  });
  expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  expect(document.activeElement).toBe(buttons[0]);
  expect(event.defaultPrevented).toBe(false);
});
