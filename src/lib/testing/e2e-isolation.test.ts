import { expect, it } from "vitest";
import { E2E_EMAIL_DOMAIN, isE2EAccount } from "./e2e-isolation";

it("reserva la limpieza solo a las cuentas de la suite, sin tocar las de desarrollo", () => {
  const users = [
    "coach-e2e@test.local",
    "alumno1-e2e@test.local",
    `ana@${E2E_EMAIL_DOMAIN}`,
    "persona@example.com",
    undefined,
  ];
  expect(users.filter(isE2EAccount)).toEqual([`ana@${E2E_EMAIL_DOMAIN}`]);
  expect(isE2EAccount(`intruso@${E2E_EMAIL_DOMAIN}.otro.test`)).toBe(false);
  expect(isE2EAccount(`intruso@otro-${E2E_EMAIL_DOMAIN}`)).toBe(false);
});
