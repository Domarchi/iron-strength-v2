import { describe, expect, it } from "vitest";
import { adjustWeightText } from "../lib/weight-adjust";

describe("adjustWeightText", () => {
  it("suma y resta con coma decimal sin ruido flotante", () => {
    expect(adjustWeightText("57,5", 2.5, null)).toBe("60");
    expect(adjustWeightText("57.5", -2.5, null)).toBe("55");
    expect(adjustWeightText("0,1", 0.2, null)).toBe("0,3");
  });
  it("parte del objetivo cuando el campo está vacío y nunca baja de cero", () => {
    expect(adjustWeightText("", 2.5, 50)).toBe("52,5");
    expect(adjustWeightText("", 2.5, null)).toBe("2,5");
    expect(adjustWeightText("1", -2.5, null)).toBe("0");
  });
  it("conserva texto no numérico sin inventar un valor", () => {
    expect(adjustWeightText("abc", 2.5, 50)).toBe("abc");
  });
});
