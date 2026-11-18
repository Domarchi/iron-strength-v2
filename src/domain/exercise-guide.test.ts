import { describe, expect, it } from "vitest";
import { exerciseGuide } from "./exercise-guide";

const base = { muscleGroup: "Piernas", equipment: "Barra", isBodyweight: false };

describe("exerciseGuide", () => {
  it("usa la guía específica de los movimientos principales, sin importar tildes ni mayúsculas", () => {
    expect(exerciseGuide({ ...base, name: "Sentadilla" }).summary).toMatch(/Piernas y glúteos/);
    expect(exerciseGuide({ ...base, name: "PRESS DE BANCA inclinado" }).summary).toMatch(/Pecho/);
    expect(exerciseGuide({ ...base, name: "Puente de glúteo" }).summary).toBe("Glúteos.");
  });
  it("cae al grupo muscular y luego a una guía general; nunca queda vacía", () => {
    const group = exerciseGuide({
      name: "Cruce de poleas",
      muscleGroup: "Pecho",
      equipment: "Polea",
      isBodyweight: false,
    });
    expect(group.summary).toMatch(/pecho/i);
    const unknown = exerciseGuide({
      name: "Movimiento 0",
      muscleGroup: null,
      equipment: null,
      isBodyweight: false,
    });
    expect(unknown.steps.length).toBeGreaterThanOrEqual(2);
    expect(unknown.avoid.length).toBeGreaterThan(0);
  });
  it("adapta la última indicación al peso corporal o al equipo", () => {
    const bw = exerciseGuide({
      name: "Flexiones",
      muscleGroup: "Pecho",
      equipment: "Peso corporal",
      isBodyweight: true,
    });
    expect(bw.steps.at(-1)).toMatch(/variante más fácil/);
    const eq = exerciseGuide({ ...base, name: "Prensa de piernas", equipment: "Máquina" });
    expect(eq.steps.at(-1)).toMatch(/máquina/);
  });
  it("no promete resultados ni da consejos médicos", () => {
    const text = JSON.stringify(exerciseGuide({ ...base, name: "Sentadilla" })).toLowerCase();
    for (const banned of ["garantiza", "cura", "dolor crónico", "lesión"])
      expect(text).not.toContain(banned);
  });
});
