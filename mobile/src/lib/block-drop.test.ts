import { describe, expect, it } from "vitest";
import { blockDropTarget, scrollDragDelta } from "./block-drop";
const viewport = { x: 20, y: 100, width: 320, height: 400 };
const rows = [
  { id: "a", y: 0, height: 80 },
  { id: "group", y: 90, height: 120 },
  { id: "c", y: 220, height: 80 },
];
describe("destinos de bloques por coordenadas", () => {
  it("encuentra un bloque completo en coordenadas de contenido", () => {
    expect(blockDropTarget(rows, viewport, 0, { x: 60, y: 260 })).toBe("group");
    expect(blockDropTarget(rows, viewport, 140, { x: 60, y: 200 })).toBe("c");
  });
  it("cancelar fuera, en un hueco o con geometría inválida nunca inventa un destino", () => {
    for (const point of [
      { x: 19, y: 120 },
      { x: 341, y: 120 },
      { x: 60, y: 99 },
      { x: 60, y: 501 },
      { x: 60, y: 185 },
      { x: NaN, y: 120 },
    ])
      expect(blockDropTarget(rows, viewport, 0, point)).toBeNull();
    expect(blockDropTarget(rows, { ...viewport, height: 0 }, 0, { x: 60, y: 120 })).toBeNull();
    expect(blockDropTarget(rows, viewport, -1, { x: 60, y: 120 })).toBeNull();
  });
  it("los bordes visibles pertenecen a su bloque, nunca a otro grupo", () => {
    expect(blockDropTarget(rows, viewport, 0, { x: 20, y: 100 })).toBe("a");
    expect(blockDropTarget(rows, viewport, 0, { x: 340, y: 400 })).toBe("c");
  });
  it("solo desplaza en los bordes internos y respeta el largo disponible", () => {
    expect(scrollDragDelta(viewport, { x: 60, y: 110 }, 20, 900)).toBe(-12);
    expect(scrollDragDelta(viewport, { x: 60, y: 490 }, 200, 900)).toBe(12);
    expect(scrollDragDelta(viewport, { x: 60, y: 110 }, 4, 900)).toBe(-4);
    expect(scrollDragDelta(viewport, { x: 60, y: 490 }, 495, 900)).toBe(5);
    expect(scrollDragDelta(viewport, { x: 60, y: 110 }, 0, 900)).toBe(0);
    expect(scrollDragDelta(viewport, { x: 60, y: 490 }, 0, 300)).toBe(0);
    expect(scrollDragDelta(viewport, { x: 60, y: 300 }, 20, 900)).toBe(0);
    expect(scrollDragDelta(viewport, { x: 0, y: 490 }, 20, 900)).toBe(0);
    expect(scrollDragDelta(viewport, { x: 60, y: 501 }, 20, 900)).toBe(0);
  });
});
