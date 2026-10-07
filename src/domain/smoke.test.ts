import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("humo de pruebas", () => {
  it("resuelve el alias @/ y combina clases", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});
