import { test, expect } from "@playwright/test";
import { setupDownloadedWeek, recoverLegacyWeek } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
const queueKey = `is:native-sync:v1:${downloadId(1)}`;
async function reachability(page: import("@playwright/test").Page, online: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  }, online);
}
test("una reconexión 503 conserva el cierre sin pedir reparación local y confirma una sola vez al recuperar servicio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const control = await setupDownloadedWeek(page);
  await recoverLegacyWeek(page, control.pack);
  control.offline = true;
  await reachability(page, false);
  await page.getByRole("button", { name: "Consultar rutina descargada A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Guardar en este dispositivo", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}').entries.length,
        queueKey,
      ),
    )
    .toBe(1);
  const before = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).entries[0].payload,
    queueKey,
  );
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.evaluate(() => {
    const state = window as Window & { sawQueueRepair?: boolean };
    state.sawQueueRepair = false;
    new MutationObserver(() => {
      if (
        [...document.querySelectorAll('button,[role="button"]')].some(
          (e) => e.textContent?.trim() === "Comprobar cola local",
        )
      )
        state.sawQueueRepair = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  let unavailable = true;
  await page.route(
    "https://iron-strength-seven.vercel.app/api/mobile/v1/auth/refresh",
    async (route) => {
      if (unavailable)
        return route.fulfill({
          status: 503,
          json: {
            version: 1,
            error: { code: "unavailable", message: "Servicio temporalmente no disponible" },
          },
        });
      await route.fallback();
    },
  );
  const failed = page.waitForResponse(
    (r) => r.url().endsWith("/auth/refresh") && r.status() === 503,
  );
  await reachability(page, true);
  await (await failed).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByText("1 registro pendiente", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Comprobar cola local", exact: true })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() => (window as Window & { sawQueueRepair?: boolean }).sawQueueRepair),
  ).toBe(false);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).entries[0].payload,
      queueKey,
    ),
  ).toEqual(before);
  expect(control.saveRequests).toHaveLength(0);
  await page.screenshot({
    path: test.info().outputPath("connection-pending-dark-360.png"),
    fullPage: true,
  });
  unavailable = false;
  control.offline = false;
  control.saveLost = true;
  await reachability(page, false);
  await reachability(page, true);
  await expect
    .poll(
      () =>
        page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).entries[0].phase, queueKey),
      { timeout: 30000 },
    )
    .toBe("confirmed");
  expect(control.saved.size).toBe(1);
  expect(control.saveRequests).toHaveLength(2);
  expect(control.saveRequests[0]).toEqual(control.saveRequests[1]);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).entries[0].payload,
      queueKey,
    ),
  ).toEqual(before);
  await expect(
    page.getByText("ÚLTIMO ENVÍO CONFIRMADO", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Comprobar cola local", exact: true })).toHaveCount(
    0,
  );
});
