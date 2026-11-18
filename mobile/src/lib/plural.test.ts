import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("usa singular solo con uno", () => {
    expect(plural(1, "serie", "series")).toBe("1 serie");
    expect(plural(0, "serie", "series")).toBe("0 series");
    expect(plural(2, "entrenamiento", "entrenamientos")).toBe("2 entrenamientos");
  });
});
