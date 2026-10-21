// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { accountStorageKeys, hasLocalTraining } from "./local-account";
beforeEach(() => localStorage.clear());
it("la limpieza incluye formatos desconocidos propios y conserva otras cuentas", () => {
  for (const key of [
    "is:draft:v1:a:s",
    "is:draft:v2:a:t",
    "is:draft:v99:a:u",
    "is:coach-draft:v1:a:p:s:e",
    "is:program-copy:v1:a:p:c",
    "is:planning-request:v99:a:p:copy:c",
    "is:draft:v2:ab:s",
    "theme",
    "sb-token",
  ])
    localStorage.setItem(key, "raw");
  expect(accountStorageKeys(localStorage, "a")).toEqual([
    "is:draft:v1:a:s",
    "is:draft:v2:a:t",
    "is:draft:v99:a:u",
    "is:coach-draft:v1:a:p:s:e",
    "is:program-copy:v1:a:p:c",
    "is:planning-request:v99:a:p:copy:c",
  ]);
  expect(hasLocalTraining(localStorage)).toBe(true);
});
it("los borradores de otra cuenta y los formatos ilegibles también aplazan la actualización", () => {
  expect(hasLocalTraining(localStorage)).toBe(false);
  localStorage.setItem("is:coach-draft:v1:a:p:s:e", "{}");
  expect(hasLocalTraining(localStorage)).toBe(false);
  localStorage.setItem("is:draft:v99:b:s", "unknown");
  expect(hasLocalTraining(localStorage)).toBe(true);
});
