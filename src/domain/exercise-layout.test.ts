import { describe, expect, it } from "vitest";
import {
  reorderExerciseBlocks,
  groupExerciseLayout,
  ungroupExerciseLayout,
  detachExerciseLayout,
  removeExerciseLayout,
  setExerciseGroupRest,
  reorderGroupMembers,
} from "./exercise-layout";
import { validSupersetLayout, type GroupedExercise } from "./supersets";
const row = (
  id: string,
  group: string | null = null,
  rest: number | null = null,
): GroupedExercise => ({ id, name: id, supersetId: group, supersetRestSeconds: rest });
const ids = (rows: readonly GroupedExercise[]) => rows.map((r) => r.id);
const grouped = () => [row("a", "g", 60), row("b", "g", 60), row("c"), row("d")];

describe("estructura de ejercicios por bloques sin modificar su contenido", () => {
  it("mueve una superserie completa desde cualquier integrante y conserva objetos/descansos", () => {
    const rows = grouped(),
      next = reorderExerciseBlocks(rows, "b", "d");
    expect(ids(next)).toEqual(["c", "d", "a", "b"]);
    expect(ids(rows)).toEqual(["a", "b", "c", "d"]);
    expect(next[2]).toBe(rows[0]);
    expect(next[3]).toBe(rows[1]);
    expect(validSupersetLayout([...next])).toBe(true);
  });
  it("acepta IDs de bloque para el asa y no introduce una fila dentro del grupo destino", () => {
    const rows = grouped();
    expect(ids(reorderExerciseBlocks(rows, "superset:g", "c"))).toEqual(["c", "a", "b", "d"]);
    expect(ids(reorderExerciseBlocks(rows, "d", "a"))).toEqual(["d", "a", "b", "c"]);
  });
  it("cancelar fuera, destino desconocido o soltar dentro del mismo bloque no cambia nada", () => {
    const rows = grouped();
    expect(reorderExerciseBlocks(rows, "a", null)).toBe(rows);
    expect(reorderExerciseBlocks(rows, "a", "unknown")).toBe(rows);
    expect(reorderExerciseBlocks(rows, "unknown", "a")).toBe(rows);
    expect(reorderExerciseBlocks(rows, "a", "b")).toBe(rows);
  });
  it("agrupa seleccionados consecutivos manteniendo orden y descanso cero explícito", () => {
    const rows = [row("a"), row("b"), row("c")];
    const next = groupExerciseLayout(rows, ["b", "a"], "g", 0);
    expect(ids(next)).toEqual(["a", "b", "c"]);
    expect(next.slice(0, 2).every((r) => r.supersetId === "g" && r.supersetRestSeconds === 0)).toBe(
      true,
    );
    expect(next[2]).toBe(rows[2]);
    expect(rows[0].supersetId).toBeNull();
    expect(groupExerciseLayout(rows, ["a", "b"], "g")[0].supersetRestSeconds).toBe(90);
  });
  it.each(
    [[], ["a"], ["a", "c"], ["a", "a"], ["a", "missing"], ["a", "b", "c", "d", "e"]].map(
      (selected) => ({ selected }),
    ),
  )("rechaza selección inválida $selected sin aplicación parcial", ({ selected }) => {
    const rows = [row("a"), row("b"), row("c"), row("d"), row("e")];
    expect(() => groupExerciseLayout(rows, selected, "g", 90)).toThrow();
    expect(rows.every((r) => r.supersetId === null)).toBe(true);
  });
  it("no anida grupos ni reutiliza la identidad de otro grupo", () => {
    const rows = grouped();
    expect(() => groupExerciseLayout(rows, ["a", "b"], "new", 90)).toThrow();
    expect(() => groupExerciseLayout(rows, ["c", "d"], "g", 90)).toThrow();
    expect(() => groupExerciseLayout(rows, ["c", "d"], " ", 90)).toThrow();
  });
  it("admite cuatro integrantes y conserva la fila externa al grupo", () => {
    const rows = [row("a"), row("b"), row("c"), row("d"), row("e")];
    const next = groupExerciseLayout(rows, ["a", "b", "c", "d"], "g", 15);
    expect(validSupersetLayout([...next])).toBe(true);
    expect(next.slice(0, 4).every((r) => r.supersetId === "g")).toBe(true);
    expect(next[4]).toBe(rows[4]);
  });
  it("quitar una fila independiente o separar otra superserie conserva las demás filas", () => {
    const rows = grouped(),
      next = removeExerciseLayout(rows, "c");
    expect(ids(next)).toEqual(["a", "b", "d"]);
    expect(next[0]).toBe(rows[0]);
    expect(next[1]).toBe(rows[1]);
    const separated = ungroupExerciseLayout(rows, "g");
    expect(separated[2]).toBe(rows[2]);
    expect(separated[3]).toBe(rows[3]);
    expect(rows[0].supersetId).toBe("g");
  });
  it("sacar un integrante intermedio deja el resto junto y la fila fuera inmediatamente después", () => {
    const rows = [row("a", "g", 45), row("b", "g", 45), row("c", "g", 45), row("d")];
    const next = detachExerciseLayout(rows, "b");
    expect(ids(next)).toEqual(["a", "c", "b", "d"]);
    expect(next[0].supersetId).toBe("g");
    expect(next[1].supersetId).toBe("g");
    expect(next[2]).toMatchObject({ supersetId: null, supersetRestSeconds: null });
    expect(validSupersetLayout([...next])).toBe(true);
    expect(ids(rows)).toEqual(["a", "b", "c", "d"]);
  });
  it("quitar o sacar uno de dos elimina el grupo solitario sin perder el otro ejercicio", () => {
    const rows = grouped();
    const removed = removeExerciseLayout(rows, "b");
    expect(ids(removed)).toEqual(["a", "c", "d"]);
    expect(removed[0]).toMatchObject({ supersetId: null, supersetRestSeconds: null });
    const detached = detachExerciseLayout(rows, "b");
    expect(ids(detached)).toEqual(["a", "b", "c", "d"]);
    expect(detached.slice(0, 2).every((r) => r.supersetId === null)).toBe(true);
    expect(detachExerciseLayout(rows, "c")).toBe(rows);
  });
  it("quitar dentro de un grupo de tres conserva el grupo restante y separar limpia todos sus integrantes", () => {
    const rows = [row("a", "g", 90), row("b", "g", 90), row("c", "g", 90)];
    const next = removeExerciseLayout(rows, "b");
    expect(next.every((r) => r.supersetId === "g")).toBe(true);
    expect(
      ungroupExerciseLayout(next, "g").every(
        (r) => r.supersetId === null && r.supersetRestSeconds === null,
      ),
    ).toBe(true);
  });
  it("cambia el descanso del bloque entero y permite restaurar el predeterminado", () => {
    const rows = grouped(),
      next = setExerciseGroupRest(rows, "g", 0);
    expect(next[0].supersetRestSeconds).toBe(0);
    expect(next[1].supersetRestSeconds).toBe(0);
    expect(next[2]).toBe(rows[2]);
    expect(setExerciseGroupRest(rows, "g", null)[0].supersetRestSeconds).toBeNull();
    expect(() => setExerciseGroupRest(rows, "g", 14)).toThrow();
    expect(() => groupExerciseLayout([row("x"), row("y")], ["x", "y"], "g", 601)).toThrow();
  });
  it("rechaza identidades retiradas en acciones explícitas", () => {
    const rows = grouped();
    expect(() => removeExerciseLayout(rows, "unknown")).toThrow();
    expect(() => detachExerciseLayout(rows, "unknown")).toThrow();
    expect(() => ungroupExerciseLayout(rows, "unknown")).toThrow();
    expect(() => setExerciseGroupRest(rows, "unknown", 60)).toThrow();
  });
  it("valida estructura y límite antes de aplicar cualquier orden", () => {
    expect(() => reorderExerciseBlocks([row("a"), row("a")], "a", "a")).toThrow();
    expect(() =>
      reorderExerciseBlocks([row("a", "g", 60), row("b"), row("c", "g", 60)], "a", "b"),
    ).toThrow();
    expect(() =>
      reorderExerciseBlocks(
        Array.from({ length: 16 }, (_, i) => row(String(i))),
        "0",
        "15",
      ),
    ).toThrow("15");
  });
  it("ordena integrantes explícitamente y conserva el bloque y las filas externas", () => {
    const rows = grouped(),
      next = reorderGroupMembers(rows, "g", ["b", "a"]);
    expect(ids(next)).toEqual(["b", "a", "c", "d"]);
    expect(next[0]).toBe(rows[1]);
    expect(next[1]).toBe(rows[0]);
    expect(next[2]).toBe(rows[2]);
    expect(validSupersetLayout([...next])).toBe(true);
    expect(ids(rows)).toEqual(["a", "b", "c", "d"]);
    expect(reorderGroupMembers(rows, "g", ["a", "b"])).toBe(rows);
    expect(() => reorderGroupMembers(rows, "unknown", [])).toThrow("superserie");
  });
  it.each([["a"], ["a", "a"], ["a", "missing"], ["b", "a", "c"]].map((order) => ({ order })))(
    "rechaza un orden de integrantes incompleto/ajeno $order",
    ({ order }) => {
      const rows = grouped();
      expect(() => reorderGroupMembers(rows, "g", order)).toThrow("integrantes");
      expect(ids(rows)).toEqual(["a", "b", "c", "d"]);
    },
  );
});
