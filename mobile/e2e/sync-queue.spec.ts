import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek, enterWeekUser } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
import { parseWeekPackage } from "../../src/lib/offline/package";
const queueKey = `is:native-sync:v1:${downloadId(1)}`,
  trainingKey = `is:native-training:v1:${downloadId(1)}`;
async function reachability(page: Page, online: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  }, online);
}
test("dos cierres sin red, otro registro en curso y sincronización automática conservan IDs, descanso y foco", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const control = await setupDownloadedWeek(page);
  const second = structuredClone(control.pack.sessions[0]);
  second.context.session = {
    ...second.context.session,
    id: downloadId(30),
    label: "B",
    title: "Espalda",
  };
  second.context.exercises = second.context.exercises.map((e, i) => ({
    ...e,
    sessionExerciseId: downloadId(31 + i),
    alternatives: e.alternatives?.map((a) => ({ ...a, sessionExerciseId: downloadId(31 + i) })),
    supersetId: downloadId(35),
  }));
  second.weekday = 3;
  control.pack.sessions.push(second);
  expect(parseWeekPackage(control.pack, downloadId(1))).not.toBeNull();
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  control.offline = true;
  await reachability(page, false);
  await expect(page.getByRole("button", { name: "Conectar", exact: true })).toBeVisible();
  for (const [i, label] of ["A", "B"].entries()) {
    await page
      .getByRole("button", { name: `Consultar rutina descargada ${label}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Guardar en este dispositivo", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (k) => JSON.parse(localStorage.getItem(k) ?? '{"entries":[]}').entries.length,
          queueKey,
        ),
      )
      .toBe(i + 1);
    await expect
      .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, trainingKey))
      .toBeNull();
    await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  }
  await expect(
    page.getByText("2 registros pendientes", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(control.saveRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Consultar rutina descargada A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Omitir descanso", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).active.draft.rest?.endsAt ?? null,
        trainingKey,
      ),
    )
    .not.toBeNull();
  const before = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).active,
    trainingKey,
  );
  const currentUrl = page.url();
  control.offline = false;
  control.saveLost = true;
  await reachability(page, true);
  await expect.poll(() => control.saved.size, { timeout: 30000 }).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(
        (k) =>
          JSON.parse(localStorage.getItem(k)!).entries.filter(
            (e: { phase: string }) => e.phase === "confirmed",
          ).length,
        queueKey,
      ),
    )
    .toBe(2);
  expect(control.saveRequests).toHaveLength(3);
  expect(control.saveRequests[0]).toEqual(control.saveRequests[1]);
  expect(page.url()).toBe(currentUrl);
  const after = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).active,
    trainingKey,
  );
  expect(after.draft.workoutId).toBe(before.draft.workoutId);
  expect(after.draft.rest.endsAt).toBe(before.draft.rest.endsAt);
  expect(after.draft.exercises).toEqual(before.draft.exercises);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("sync-active-dark-360.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await expect(page.getByText("2 de 2 sesiones completadas", { exact: true })).toBeVisible();
});
async function prepareOffline(page: Page, night = false) {
  const control = await setupDownloadedWeek(page);
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  control.offline = true;
  await reachability(page, false);
  await expect(page.getByRole("button", { name: "Conectar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Consultar rutina descargada A", exact: true }).click();
  if (night) await page.clock.setFixedTime(new Date("2026-10-25T02:00:00Z"));
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  return control;
}
async function closeLocal(page: Page) {
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Guardar en este dispositivo", exact: true }).click();
}
test("sin espacio en la cola conserva el cierre original; comprobar permite transferirlo y descartar con confirmación", async ({
  page,
}) => {
  const control = await prepareOffline(page, true);
  await page.clock.setFixedTime(new Date("2026-10-25T04:00:00Z"));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:native-sync:") && !localStorage.getItem("allow-sync-write"))
        throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await closeLocal(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "No pudimos confirmar la cola" }),
  ).toBeVisible();
  const original = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).active.payload,
    trainingKey,
  );
  expect(original.version).toBe(2);
  expect(original.workout.sets).toHaveLength(1);
  expect(await page.evaluate((k) => localStorage.getItem(k), queueKey)).toBeNull();
  expect(control.saveRequests).toHaveLength(0);
  await page.evaluate(() => localStorage.setItem("allow-sync-write", "1"));
  await page.getByRole("button", { name: "Comprobar cola local", exact: true }).click();
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, trainingKey))
    .toBeNull();
  expect(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).entries[0].payload, queueKey),
  ).toEqual(original);
  await expect(page.getByText(/^24\/10 · 1 serie/).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Revisar envío 1: Piernas", exact: true }).click();
  await page.getByRole("button", { name: "Descartar registro local", exact: true }).click();
  expect(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).entries.length, queueKey),
  ).toBe(1);
  await page.getByRole("button", { name: "Confirmar descarte", exact: true }).click();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
  expect(control.saveRequests).toHaveLength(0);
});
test("rechazo del servidor conserva el cierre, detiene el reintento automático y permite revisión manual", async ({
  page,
}) => {
  const control = await prepareOffline(page);
  await closeLocal(page);
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k) ?? '{"entries":[]}').entries.length,
        queueKey,
      ),
    )
    .toBe(1);
  let posts = 0,
    permit = false;
  await page.route(
    "https://iron-strength-seven.vercel.app/api/mobile/v1/recordings",
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posts++;
      if (permit) return route.fallback();
      await route.fulfill({
        status: 403,
        json: {
          version: 1,
          error: { code: "forbidden", message: "La rutina requiere revisión del coach." },
        },
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  control.offline = false;
  await reachability(page, true);
  await expect(
    page.getByRole("alert").filter({ hasText: "La rutina requiere revisión del coach" }),
  ).toBeVisible();
  expect(posts).toBe(1);
  expect(control.saved.size).toBe(0);
  const frozen = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).entries[0],
    queueKey,
  );
  expect(frozen.phase).toBe("pending");
  expect(frozen.error.blocked).toBe(true);
  permit = true;
  await page.getByRole("button", { name: "Reintentar envío", exact: true }).click();
  await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible();
  expect(posts).toBe(2);
  expect(control.saved.size).toBe(1);
  expect(control.saveRequests[0]).toEqual(frozen.payload);
});
test("una cola de otra versión queda protegida al salir de la cuenta", async ({ page }) => {
  const control = await setupDownloadedWeek(page);
  const future = '{"version":99,"private":"conservar"}',
    otherKey = `is:native-sync:v1:${downloadId(99)}`;
  await page.evaluate(
    ({ key, otherKey, future }) => {
      localStorage.setItem(key, future);
      localStorage.setItem(otherKey, "otra cuenta");
    },
    { key: queueKey, otherKey, future },
  );
  await page.reload();
  const { enterWeekUser } = await import("./support/week-fixture");
  await enterWeekUser(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "No pudimos verificar tu cola local" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), queueKey)).toBe(future);
  expect(await page.evaluate((k) => localStorage.getItem(k), otherKey)).toBe("otra cuenta");
  expect(control.saveRequests).toHaveLength(0);
});
for (const theme of ["light", "dark"] as const)
  test(`cola en Inicio y detalle ${theme} a 360 px sin duplicar la presentación del registro`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const control = await prepareOffline(page);
    await closeLocal(page);
    await expect
      .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, trainingKey))
      .toBeNull();
    await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
    await expect(
      page.getByText("1 registro pendiente", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Revisar envío 1: Piernas", exact: true }),
    ).toHaveCount(1);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`queue-home-${theme}-360.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Revisar envío 1: Piernas", exact: true }).click();
    await expect(
      page.getByText("Tu registro está protegido", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`queue-detail-${theme}-360.png`),
      fullPage: true,
    });
    expect(control.saveRequests).toHaveLength(0);
  });

test("una cola anterior conserva su cuerpo y usa el guardado legado al recuperar la app", async ({
  page,
}) => {
  const control = await prepareOffline(page);
  await closeLocal(page);
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k) ?? '{"entries":[]}').entries.length,
        queueKey,
      ),
    )
    .toBe(1);
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, trainingKey))
    .toBeNull();
  const legacy = await page.evaluate((k) => {
    const raw = JSON.parse(localStorage.getItem(k)!);
    const body = raw.entries[0].payload.workout;
    raw.version = 1;
    delete raw.previousFormat;
    raw.entries[0].payload = body;
    localStorage.setItem(k, JSON.stringify(raw));
    return body;
  }, queueKey);
  await page.reload();
  control.offline = false;
  await enterWeekUser(page);
  await expect.poll(() => control.saved.size).toBe(1);
  expect(control.saveRequests).toEqual([legacy]);
  expect(control.calls).toContain("POST /api/mobile/v1/workouts");
  expect(control.calls).not.toContain("POST /api/mobile/v1/recordings");
  expect(control.recordings.size).toBe(0);
  await expect
    .poll(() =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).entries[0].phase, queueKey),
    )
    .toBe("confirmed");
});
