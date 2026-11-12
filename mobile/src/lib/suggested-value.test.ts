import { describe, expect, it } from "vitest";
import { isSuggestedWeight } from "./suggested-value";

describe("isSuggestedWeight", () => {
  it("marca como sugerido el peso igual a la prescripción mientras la serie no esté hecha", () => {
    expect(isSuggestedWeight("55", 55, false)).toBe(true);
    expect(isSuggestedWeight("57,5", 57.5, false)).toBe(true);
  });
  it("no lo marca si la serie está hecha, no hay objetivo o el valor difiere", () => {
    expect(isSuggestedWeight("55", 55, true)).toBe(false);
    expect(isSuggestedWeight("55", null, false)).toBe(false);
    expect(isSuggestedWeight("60", 55, false)).toBe(false);
    expect(isSuggestedWeight("", 55, false)).toBe(false);
    expect(isSuggestedWeight("abc", 55, false)).toBe(false);
  });
});
