import { expect, test } from "@playwright/test";

test("Siguiente enfoca la contraseña sin enviar; Ir conserva el envío explícito", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/auth/login")) attempts++;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        error: { code: "unauthorized", message: "Acceso de prueba rechazado." },
      }),
    });
  });
  await page.goto("/login");
  const email = page.getByLabel("Correo", { exact: true });
  const password = page.getByLabel("Contraseña", { exact: true });
  await email.fill("teclado@example.test");
  await email.press("Enter");
  await expect(password).toBeFocused();
  expect(attempts).toBe(0);
  await password.fill("Prueba-Sintetica-2026!");
  await password.press("Enter");
  await expect(page.getByText("Acceso de prueba rechazado.", { exact: true })).toBeVisible();
  expect(attempts).toBe(1);
});
