import { describe, expect, it } from "vitest";
import { DELETE_CONFIRMATION, isDeleteConfirmation } from "./account";

describe("confirmación para borrar la cuenta (RF-48; DC-33)", () => {
  it("la palabra es BORRAR", () => {
    expect(DELETE_CONFIRMATION).toBe("BORRAR");
  });

  it("acepta la palabra sin distinguir mayúsculas ni espacios alrededor", () => {
    for (const text of ["BORRAR", "borrar", " Borrar ", "bOrRaR\n"]) {
      expect(isDeleteConfirmation(text)).toBe(true);
    }
  });

  it("rechaza todo lo demás", () => {
    for (const text of ["", "borra", "borrar mi cuenta", "BORRAR!", "ELIMINAR", "B O R R A R"]) {
      expect(isDeleteConfirmation(text)).toBe(false);
    }
    expect(isDeleteConfirmation(null)).toBe(false);
    expect(isDeleteConfirmation(undefined)).toBe(false);
  });
});
