import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { downloadId, weekDownloadFixture } from "../../src/test/fixtures/week-download";
const origin = "https://iron-strength-seven.vercel.app",
  userId = downloadId(1),
  key = `is:native-week:v1:${userId}`;
async function enter(page: Page) {
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Synthetic-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Hola, Ana", { exact: true })).toBeVisible();
}
async function setup(page: Page, timestamp = "2026-10-24T12:00:00Z") {
  const control = {
    waiting: null as Promise<void> | null,
    lost: false,
    requests: 0,
    pack: weekDownloadFixture(userId, timestamp),
  };
  await page.route(origin + "/api/mobile/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = { version: 1, kind: "no_program" };
    if (path.endsWith("auth/login") || path.endsWith("auth/refresh"))
      json = {
        version: 1,
        accessToken: "synthetic-access",
        refreshToken: "synthetic-refresh",
        expiresAt: 4000000000,
        profile: { id: userId, fullName: "Ana Prueba", email: "ana@example.test", role: "student" },
      };
    else if (path.endsWith("comments/unread")) json = { version: 1, items: [] };
    else if (path.endsWith("/week/download")) {
      control.requests++;
      if (control.waiting) await control.waiting;
      if (control.lost) {
        await route.abort("failed");
        return;
      }
      json = { version: 1, userId, pack: control.pack };
    } else if (path.endsWith("/week"))
      json = {
        version: 1,
        kind: "active",
        program: control.pack.program,
        weekNumber: 1,
        weekStart: control.pack.weekStart,
        weekEnd: control.pack.weekEnd,
        sessions: [
          {
            sessionId: downloadId(3),
            label: "A",
            title: "Piernas",
            status: "pending",
            exerciseCount: 2,
            setCount: 4,
            exerciseNames: ["Sentadilla", "Remo"],
          },
        ],
      };
    else if (path.endsWith("/sessions/" + downloadId(3)))
      json = { version: 1, ...control.pack.sessions[0].context };
    else if (path.endsWith("auth/logout")) json = { version: 1, ok: true };
    await route.fulfill({ json, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await page.goto("/");
  await enter(page);
  return control;
}
test("descarga completa, recarga y eliminación conservan el entrenamiento iniciado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const control = await setup(page);
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
  expect(stored.pack.sessions[0].context.exercises[0].prescribed.series).toHaveLength(2);
  expect(stored.pack.sessions[0].context.exercises[0].alternatives).toHaveLength(1);
  expect(Object.keys(stored.pack.history)).toHaveLength(3);
  await page.reload();
  await enter(page);
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  expect(control.requests).toBe(1);
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: /Empezar/ }).click();
  await expect(page.getByRole("button", { name: "Volver a Inicio", exact: true })).toBeVisible();
  const active = await page.evaluate(
    (id) => localStorage.getItem("is:native-training:v1:" + id),
    userId,
  );
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  control.pack = weekDownloadFixture(userId, "2026-10-24T14:00:00Z");
  control.pack.sessions[0].context.exercises[0].prescribed.series![0].targetWeightKg = 65;
  await page.getByRole("button", { name: "Actualizar descarga", exact: true }).click();
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).pack.downloadedAt, key))
    .toBe(control.pack.downloadedAt);
  expect(
    await page.evaluate((id) => localStorage.getItem("is:native-training:v1:" + id), userId),
  ).toBe(active);
  await page.getByRole("button", { name: "Eliminar descarga", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar eliminación de descarga", exact: true })
    .click();
  await expect(
    page
      .getByText("Todavía no has descargado esta semana.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((id) => localStorage.getItem("is:native-training:v1:" + id), userId),
  ).toBe(active);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("red fallida conserva descarga y formato futuro no se sobrescribe", async ({ page }) => {
  const control = await setup(page);
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  const original = await page.evaluate((k) => localStorage.getItem(k), key);
  control.lost = true;
  await page.getByRole("button", { name: "Actualizar descarga", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos conectar" })).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(original);
  await page.evaluate((k) => localStorage.setItem(k, '{"version":99}'), key);
  await page.reload();
  await enter(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "No pudimos interpretar la descarga" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Descargar semana", exact: true })).toBeDisabled();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{"version":99}');
});
test("dos ventanas compiten usando el mismo bloqueo y preservan la descarga más reciente", async ({
  page,
  context,
}) => {
  await setup(page);
  const other = await context.newPage();
  await setup(other, "2026-10-24T14:00:00Z");
  await other.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(other.getByText(/Descarga guardada:/)).toBeVisible();
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "La descarga cambió desde otra ventana" }),
  ).toBeVisible();
  expect(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).pack.downloadedAt, key),
  ).toBe("2026-10-24T14:00:00Z");
  await page.getByRole("button", { name: "Comprobar descarga", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  await other.close();
});

test("almacenamiento lleno no confirma la descarga y conserva sus bytes anteriores", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  const original = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("is:native-week:")) throw new DOMException("Full", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "Actualizar descarga", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No hay espacio suficiente" }),
  ).toBeVisible();
  await expect(page.getByText("Descarga sin verificar.", { exact: true })).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(original);
});
test("salida y borrado esperan a la descarga; salir conserva la copia por cuenta", async ({
  page,
}) => {
  const control = await setup(page);
  let release!: () => void;
  control.waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  try {
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).pack.userId, key)).toBe(
    userId,
  );
  await expect(page.getByText("Fuerza", { exact: true })).toHaveCount(0);
});

test("sin bloqueo disponible explica el límite y no escribe sin protección", async ({ page }) => {
  await setup(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true }),
  );
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Este navegador no permite proteger la descarga" }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});

for (const theme of ["light", "dark"] as const) {
  test(`descarga visible y accesible a 360 px en ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setup(page);
    await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
    await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
    const card = page
      .getByRole("heading", { name: "Tu semana en este dispositivo", exact: true })
      .locator("..");
    await expect(
      card.getByRole("button", { name: "Actualizar descarga", exact: true }),
    ).toBeVisible();
    await card.screenshot({ path: test.info().outputPath(`download-${theme}-360.png`) });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
