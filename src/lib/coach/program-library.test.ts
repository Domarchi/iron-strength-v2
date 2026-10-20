import { expect, it } from "vitest";
import { filterTemplates } from "./program-library";
const templates = [
  {
    name: "Fuerza básica",
    sessions: [{ title: "Tren superior", exercises: [{ name: "Press de banca" }] }],
  },
  { name: "Volumen", sessions: [{ title: null, exercises: [{ name: "Sentadilla" }] }] },
];
it("busca por nombre, título y ejercicio sin tildes ni mayúsculas", () => {
  for (const term of [" BASICA ", "superior", "BANCA"])
    expect(filterTemplates(templates, term)).toEqual([templates[0]]);
  expect(filterTemplates(templates, "sentadilla")).toEqual([templates[1]]);
  expect(filterTemplates(templates, "")).toEqual(templates);
  expect(filterTemplates(templates, "ausente")).toEqual([]);
});
