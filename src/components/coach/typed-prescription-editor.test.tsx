// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultPrescriptionInput,
  parsePrescriptionInput,
  type PrescriptionInput,
} from "@/domain/prescription-input";
import { RECORD_TYPES, type RecordType } from "@/domain/training-metrics";
import { TypedPrescriptionEditor } from "./typed-prescription-editor";

let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
let latest: PrescriptionInput;
const changes = vi.fn();
function Controlled({ initial }: { initial: PrescriptionInput }) {
  const [value, setValue] = useState(initial);
  return (
    <TypedPrescriptionEditor
      name="Ejercicio"
      value={value}
      onChange={(next) => {
        latest = next;
        changes(next);
        setValue(next);
      }}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  changes.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const mount = (kind: RecordType) =>
  act(() => root.render(<Controlled initial={defaultPrescriptionInput(kind)} />));
const input = (label: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
async function fill(label: string, value: string) {
  const node = input(label);
  expect(node).not.toBeNull();
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mode(value: string) {
  const select = container.querySelector<HTMLSelectElement>("select")!;
  await act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent === label,
  )!;
  expect(button).not.toBeUndefined();
  await act(() => button.click());
}
describe("T219 · controles de prescripción tipada", () => {
  it.each([null, ...RECORD_TYPES])("muestra únicamente las dimensiones de %s", async (kind) => {
    await mount(kind);
    const reps =
      kind === null ||
      ["weight_reps", "bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight"].includes(
        kind,
      );
    const weight =
      kind === null ||
      [
        "weight_reps",
        "weighted_bodyweight",
        "assisted_bodyweight",
        "weight_duration",
        "weight_distance",
      ].includes(kind);
    const duration = ["duration", "weight_duration", "distance_duration"].includes(kind ?? "");
    const distance = ["distance_duration", "weight_distance"].includes(kind ?? "");
    expect(!!input("Reps mín. de Ejercicio")).toBe(reps);
    expect(!!input("Peso (kg) de Ejercicio")).toBe(weight);
    expect(!!input("Tiempo (s) de Ejercicio")).toBe(duration);
    expect(!!input("Distancia (m) de Ejercicio")).toBe(distance);
    expect(input("Series de Ejercicio").value).toBe("3");
    expect(changes).not.toHaveBeenCalled();
  });
  it("conserva coma decimal, texto incompleto, vacío y cero sin preparar el objetivo", async () => {
    await mount("weight_distance");
    await fill("Peso (kg) de Ejercicio", "0");
    await fill("Distancia (m) de Ejercicio", "12,");
    expect(latest).toMatchObject({ target: { targetWeightKg: "0", targetDistanceMeters: "12," } });
    expect(() => parsePrescriptionInput(latest)).toThrow();
    await fill("Distancia (m) de Ejercicio", "12,35");
    expect(parsePrescriptionInput(latest).target.targetDistanceMeters).toBe(12.35);
    await fill("Peso (kg) de Ejercicio", "");
    expect(parsePrescriptionInput(latest).target.targetWeightKg).toBeNull();
  });
  it("no cambia de modo con una cantidad incompleta y explica cómo corregirla", async () => {
    await mount("duration");
    await fill("Series de Ejercicio", "");
    await mode("series");
    expect(latest.mode).toBe("uniform");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("1 y 10");
    await fill("Series de Ejercicio", "2");
    await mode("series");
    expect(latest.mode).toBe("series");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("replica texto exacto al detallar, deriva cantidad y amplía desde la última serie", async () => {
    await mount("weight_duration");
    await fill("Tiempo (s) de Ejercicio", "30");
    await fill("Peso (kg) de Ejercicio", "12,");
    await fill("Series de Ejercicio", "2");
    await mode("series");
    expect(latest).not.toHaveProperty("target");
    expect(latest).not.toHaveProperty("sets");
    await fill("Tiempo (s) de serie 2 de Ejercicio", "45");
    await click("Añadir serie a Ejercicio");
    expect(latest).toMatchObject({
      series: [
        { targetDurationSeconds: "30" },
        { targetDurationSeconds: "45" },
        { targetDurationSeconds: "45", targetWeightKg: "12," },
      ],
    });
    await click("Quitar serie 2 de Ejercicio");
    expect(latest).toMatchObject({
      series: [{ targetDurationSeconds: "30" }, { targetDurationSeconds: "45" }],
    });
  });
  it("requiere revisar y confirmar para simplificar objetivos diferentes", async () => {
    await mount("duration");
    await fill("Series de Ejercicio", "2");
    await fill("Tiempo (s) de Ejercicio", "30");
    await mode("series");
    await fill("Tiempo (s) de serie 2 de Ejercicio", "45");
    await mode("uniform");
    expect(latest.mode).toBe("series");
    expect(
      container.querySelector('[aria-label="Revisar objetivo uniforme de Ejercicio"]'),
    ).not.toBeNull();
    await fill("Tiempo (s) de objetivo uniforme de Ejercicio", "60");
    await click("Conservar por serie");
    expect(latest.mode).toBe("series");
    await mode("uniform");
    await fill("Tiempo (s) de objetivo uniforme de Ejercicio", "60");
    await click("Confirmar todas iguales");
    expect(latest).toMatchObject({
      mode: "uniform",
      sets: "2",
      target: { targetDurationSeconds: "60" },
    });
  });
  it("convierte una lista uniforme sin una confirmación innecesaria", async () => {
    await mount(null);
    await mode("series");
    await mode("uniform");
    expect(latest).toEqual(defaultPrescriptionInput(null));
    expect(
      container.querySelector('[aria-label="Revisar objetivo uniforme de Ejercicio"]'),
    ).toBeNull();
  });
  it("no aplica una revisión anterior si el padre reemplaza el documento", async () => {
    const base = defaultPrescriptionInput("duration");
    const value: PrescriptionInput = {
      mode: "series",
      recordType: "duration",
      series: [
        { ...base.target, targetDurationSeconds: "30" },
        { ...base.target, targetDurationSeconds: "45" },
      ],
    };
    await act(() =>
      root.render(<TypedPrescriptionEditor name="Ejercicio" value={value} onChange={changes} />),
    );
    await mode("uniform");
    await act(() =>
      root.render(
        <TypedPrescriptionEditor
          name="Ejercicio"
          value={{
            ...value,
            series: [...value.series, { ...base.target, targetDurationSeconds: "90" }],
          }}
          onChange={changes}
        />,
      ),
    );
    expect(
      container.querySelector('[aria-label="Revisar objetivo uniforme de Ejercicio"]'),
    ).toBeNull();
    expect(changes).not.toHaveBeenCalled();
  });
  it("retira un error de cantidad anterior cuando se recupera un documento válido", async () => {
    const value = { ...defaultPrescriptionInput("duration"), sets: "" };
    await act(() =>
      root.render(<TypedPrescriptionEditor name="Ejercicio" value={value} onChange={changes} />),
    );
    await mode("series");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(() =>
      root.render(
        <TypedPrescriptionEditor
          name="Ejercicio"
          value={defaultPrescriptionInput("duration")}
          onChange={changes}
        />,
      ),
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(input("Series de Ejercicio").getAttribute("aria-invalid")).toBe("false");
    expect(input("Series de Ejercicio").hasAttribute("aria-describedby")).toBe(false);
    expect(changes).not.toHaveBeenCalled();
  });
  it("respeta límites de lista y marca los controles inválidos", async () => {
    const initial = defaultPrescriptionInput("duration");
    initial.sets = "1";
    await act(() =>
      root.render(
        <TypedPrescriptionEditor
          name="Ejercicio"
          value={{ mode: "series", recordType: "duration", series: [initial.target] }}
          invalid
          errorId="error-id"
          onChange={changes}
        />,
      ),
    );
    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Quitar serie 1 de Ejercicio"]',
    )!;
    expect(remove.disabled).toBe(true);
    expect(input("Tiempo (s) de serie 1 de Ejercicio").getAttribute("aria-describedby")).toBe(
      "error-id",
    );
    const full: PrescriptionInput = {
      mode: "series",
      recordType: "duration",
      series: Array.from({ length: 10 }, () => ({ ...initial.target })),
    };
    await act(() =>
      root.render(<TypedPrescriptionEditor name="Ejercicio" value={full} onChange={changes} />),
    );
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Añadir serie a Ejercicio"]')!
        .disabled,
    ).toBe(true);
  });
});
