// @vitest-environment jsdom
// T219 · Controlled fields cannot accept early input or reset it after a rejected action.
import { expect, it } from "vitest";
import { createElement, act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { ExerciseForm } from "./exercise-form";
const props = {
  action: async () => ({ error: null }),
  defaults: { name: "", muscleGroup: "Pecho", equipment: "Barra", progressionIncrementKg: 2.5 },
  submitLabel: "Crear ejercicio",
};
it("antes de hidratar no permite escribir ni enviar un formulario controlado que perdería los valores", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToString(createElement(ExerciseForm, props));
  expect(host.querySelector("fieldset")!.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
});
it("la creación y la edición quedan habilitadas al montarse el cliente", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => root.render(createElement(ExerciseForm, props)));
    expect(host.querySelector("fieldset")!.disabled).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    await act(async () =>
      root.render(
        createElement(ExerciseForm, { ...props, editing: true, submitLabel: "Guardar cambios" }),
      ),
    );
    expect(host.querySelector("fieldset")!.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("una validación rechazada conserva nombre y tipo; solo la confirmación explícita limpia", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  let saved = false;
  const action = async (_prev: unknown, form: FormData) => {
    expect(form.get("name")).toBe("Control propio");
    expect(form.get("recordType")).toBe("weight_distance");
    return saved ? { error: null, saved: true } : { error: "Revisa el dato" };
  };
  try {
    await act(async () => root.render(createElement(ExerciseForm, { ...props, action })));
    const input = host.querySelector<HTMLInputElement>('input[name="name"]')!,
      select = host.querySelector<HTMLSelectElement>('select[name="recordType"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "Control propio",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      select.value = "weight_distance";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Revisa el dato");
    expect(input.value).toBe("Control propio");
    expect(select.value).toBe("weight_distance");
    saved = true;
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Ejercicio guardado.");
    expect(input.value).toBe("");
    expect(select.value).toBe("weight_reps");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
