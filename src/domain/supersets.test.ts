import { expect, it } from "vitest";
import { exerciseBlocks, validSupersetLayout } from "./supersets";
const row = (
  id: string,
  supersetId: string | null = null,
  supersetRestSeconds: number | null = null,
) => ({ id, name: id, supersetId, supersetRestSeconds });
it("acepta dos a cuatro integrantes consecutivos con descanso consistente", () => {
  for (let n = 2; n <= 4; n++) {
    const rows = [
      row("first"),
      ...Array.from({ length: n }, (_, i) => row(String(i), "group", 90)),
      row("last"),
    ];
    expect(validSupersetLayout(rows)).toBe(true);
    expect(exerciseBlocks(rows).map((b) => b.exercises.length)).toEqual([1, n, 1]);
  }
});
it("rechaza grupos partidos, identidad repetida, tamaño inválido y descansos incoherentes", () => {
  for (const rows of [
    [row("a", "g")],
    Array.from({ length: 5 }, (_, i) => row(String(i), "g")),
    [row("a", "g"), row("b"), row("c", "g")],
    [row("a", "g", 90), row("b", "g", 60)],
    [row("a", "g"), row("a", "g")],
    [row("a", null, 90)],
    [row("a", "g", 12), row("b", "g", 12)],
  ])
    expect(validSupersetLayout(rows)).toBe(false);
});
it("mantiene orden y datos al formar bloques y admite rutinas anteriores sin grupos", () => {
  const rows = [{ id: "a", name: "A" }, row("b", "g"), row("c", "g"), row("d")];
  const blocks = exerciseBlocks(rows);
  expect(blocks.map((b) => b.id)).toEqual(["a", "superset:g", "d"]);
  expect(blocks.flatMap((b) => b.exercises)).toEqual(rows);
  expect(blocks[1].name).toBe("Superserie 1");
});
