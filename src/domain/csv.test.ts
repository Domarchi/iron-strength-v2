import { describe, expect, it } from "vitest";
import {
  BOM,
  buildHistoryCsv,
  csvFileName,
  escapeField,
  neutralizeFormula,
  type ExportSet,
} from "./csv";

describe("neutralizeFormula (RF-67)", () => {
  it.each(["=SUMA(A1)", "+56912345678", "-2+3", "@cmd", "\tcmd", "\rcmd"])(
    "antepone un apóstrofo a %j",
    (text) => {
      expect(neutralizeFormula(text)).toBe(`'${text}`);
    },
  );

  it("deja intacto el texto normal, aunque contenga esos signos más adelante", () => {
    expect(neutralizeFormula("Sentadilla")).toBe("Sentadilla");
    expect(neutralizeFormula("Press 3-1-1")).toBe("Press 3-1-1");
    expect(neutralizeFormula("")).toBe("");
  });
});

describe("escapeField", () => {
  it("cita lo que lleva separador, comillas o saltos de línea", () => {
    expect(escapeField("a;b")).toBe('"a;b"');
    expect(escapeField('di "hola"')).toBe('"di ""hola"""');
    expect(escapeField("a\nb")).toBe('"a\nb"');
  });

  it("no cita lo simple y sí cita lo neutralizado si hace falta", () => {
    expect(escapeField("Sentadilla")).toBe("Sentadilla");
    expect(escapeField("=1;2")).toBe('"\'=1;2"');
  });
});

const row = (over: Partial<ExportSet> = {}): ExportSet => ({
  date: "2026-10-05",
  sessionLabel: "A",
  exerciseName: "Sentadilla",
  setNumber: 1,
  isWarmup: false,
  weightKg: 62.5,
  reps: 10,
  ...over,
});

describe("buildHistoryCsv (RF-47)", () => {
  it("empieza con la marca de orden de bytes y el encabezado en español", () => {
    const csv = buildHistoryCsv([]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(
      `${BOM}Fecha;Sesión;Ejercicio;Serie;Tipo;Kg;Reps;Ejercicio prescrito;Esfuerzo (1–10);Nota del entrenamiento;Origen;Título;Tipo de registro;Duración (s);Distancia (m);Esfuerzo de serie (1–10);Nota del ejercicio;Fila;Entrenamiento ID;Ejercicio ID;Ejercicio prescrito ID\r\n`,
    );
  });

  it("una fila por serie, con coma decimal y fin de línea CRLF", () => {
    const csv = buildHistoryCsv([
      row(),
      row({ setNumber: 2, isWarmup: true, weightKg: 40, reps: 12 }),
    ]);
    expect(csv.slice(BOM.length).split("\r\n")).toEqual([
      "Fecha;Sesión;Ejercicio;Serie;Tipo;Kg;Reps;Ejercicio prescrito;Esfuerzo (1–10);Nota del entrenamiento;Origen;Título;Tipo de registro;Duración (s);Distancia (m);Esfuerzo de serie (1–10);Nota del ejercicio;Fila;Entrenamiento ID;Ejercicio ID;Ejercicio prescrito ID",
      "2026-10-05;A;Sentadilla;1;Trabajo;62,5;10;Sentadilla;;;Programa del coach;;;;;;;Serie;;;",
      "2026-10-05;A;Sentadilla;2;Calentamiento;40;12;Sentadilla;;;Programa del coach;;;;;;;Serie;;;",
      "",
    ]);
  });

  it("un histórico sin etiqueta conserva su celda vacía", () => {
    const csv = buildHistoryCsv([row({ sessionLabel: null })]);
    expect(csv).toContain("2026-10-05;;Sentadilla;");
  });

  it("neutraliza los nombres de ejercicio que serían fórmulas", () => {
    const csv = buildHistoryCsv([row({ exerciseName: '=HYPERLINK("http://x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).not.toMatch(/;=HYPERLINK/);
  });

  it("exporta procedencia explícita y protege títulos contra fórmulas", () => {
    const csv = buildHistoryCsv([
      row({ sourceKind: "free", workoutTitle: "=1+1", sessionLabel: null }),
    ]);
    expect(csv).toContain("Entrenamiento libre;'=1+1");
    expect(buildHistoryCsv([row({ sessionLabel: null })])).toContain("Programa del coach;");
  });
  it("respeta el orden recibido", () => {
    const csv = buildHistoryCsv([row({ date: "2026-10-06" }), row({ date: "2026-10-05" })]);
    const lines = csv.slice(BOM.length).split("\r\n");
    expect(lines[1].startsWith("2026-10-06")).toBe(true);
  });
});

describe("csvFileName", () => {
  it("usa el nombre sin tildes ni símbolos y la fecha", () => {
    expect(csvFileName("Ana María Pérez", "2026-10-08")).toBe(
      "entrenamientos-ana-maria-perez-2026-10-08.csv",
    );
  });

  it("un nombre sin letras cae en 'alumno'", () => {
    expect(csvFileName("???", "2026-10-08")).toBe("entrenamientos-alumno-2026-10-08.csv");
  });
});

it("exporta esfuerzo y nota del entrenamiento con neutralización (T156)", () => {
  expect(buildHistoryCsv([row({ perceivedEffort: 8, workoutNote: "=1+1" })])).toContain(
    ";8;'=1+1;Programa del coach;;;;;;;Serie;;;\r\n",
  );
});
