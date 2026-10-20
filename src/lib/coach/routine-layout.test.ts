import { expect, it } from "vitest";
import { groupSelected, separateMember, separateGroup, type LayoutRow } from "./routine-layout";
const rows: LayoutRow[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  restSeconds: null,
  supersetId: null,
  supersetRestSeconds: null,
}));
it("agrupa solo dos a cuatro seleccionados consecutivos y conserva descansos individuales", () => {
  const grouped = groupSelected(rows, ["a", "b", "c"], "g")!;
  expect(grouped.map((r) => r.supersetId)).toEqual(["g", "g", "g", null]);
  expect(groupSelected(rows, ["a", "c"], "g")).toBeNull();
  expect(groupSelected(rows, ["a"], "g")).toBeNull();
  expect(groupSelected(grouped, ["a", "b"], "other")).toBeNull();
});
it("sacar el integrante intermedio lo coloca después del bloque sin partirlo", () => {
  const grouped = groupSelected(rows, ["a", "b", "c"], "g")!;
  const next = separateMember(grouped, "b");
  expect(next.map((r) => r.id)).toEqual(["a", "c", "b", "d"]);
  expect(next.map((r) => r.supersetId)).toEqual(["g", "g", null, null]);
});
it("separar dos integrantes deja ambos independientes y separar grupo conserva el orden", () => {
  const grouped = groupSelected(rows, ["a", "b"], "g")!;
  expect(separateMember(grouped, "a")).toEqual(rows);
  expect(separateGroup(grouped, "g")).toEqual(rows);
});
