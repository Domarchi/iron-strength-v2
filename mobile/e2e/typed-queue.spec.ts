import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek, enterWeekUser } from "./support/week-fixture";
import { typedRecordingFixture } from "../../src/test/fixtures/typed-recording";
import {
  typedRecordingRequestSchema,
  type TypedRecordingPayload,
} from "../../src/lib/mobile/typed-recording-contracts";
import { downloadId } from "../../src/test/fixtures/week-download";
const key = `is:native-sync:v1:${downloadId(1)}`;
function envelope() {
  const p = typedRecordingFixture();
  p.workout.note = "Entrenamiento registrado sin conexión";
  p.workout.perceivedEffort = 8;
  return {
    version: 3,
    userId: downloadId(1),
    entries: [
      {
        title: "Sesión recuperada",
        payload: p,
        queuedAt: "2026-10-24T15:00:00Z",
        phase: "pending",
        confirmedAt: null,
        error: { code: "review", message: "Envío conservado para revisión", blocked: true },
      },
    ],
  };
}
test("recupera sobre3, revisa cabecera y confirma el mismo documento después de perder respuesta", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await setupDownloadedWeek(page);
  const raw = envelope(),
    requests: TypedRecordingPayload[] = [],
    saved = new Set<string>();
  let lose = true;
  await page.route(
    "https://iron-strength-seven.vercel.app/api/mobile/v1/typed-recordings",
    async (route) => {
      const p = typedRecordingRequestSchema.parse(route.request().postDataJSON()).payload;
      requests.push(p);
      const duplicate = saved.has(p.id);
      saved.add(p.id);
      if (lose) {
        lose = false;
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        json: {
          version: 3,
          ok: true,
          status: duplicate ? "duplicate" : "created",
          workoutId: p.id,
        },
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, JSON.stringify(raw)), {
    key,
    raw,
  });
  await page.reload();
  await enterWeekUser(page);
  await expect(
    page.getByText("1 registro pendiente", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revisar envío 1: Sesión recuperada", exact: true })
    .click();
  await expect(page.getByText("Tu registro está protegido", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Entrenamiento registrado sin conexión", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Esfuerzo: 8/10", { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("typed-queue-dark-360.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("button", { name: "Sincronizar ahora", exact: true }).click();
  await expect.poll(() => saved.size).toBe(1);
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).entries[0].phase, key), {
      timeout: 30000,
    })
    .toBe("confirmed");
  expect(requests).toHaveLength(2);
  expect(requests).toEqual([raw.entries[0].payload, raw.entries[0].payload]);
  await expect(
    page.getByRole("button", { name: "Ver resultado del último envío", exact: true }),
  ).toBeVisible();
});
test("documento3 bajo sobre2 se conserva y explica incompatibilidad sin enviar ni degradar", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  const control = await setupDownloadedWeek(page),
    raw = JSON.stringify({ ...envelope(), version: 2 });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
  await page.reload();
  await enterWeekUser(page);
  await expect(
    page.getByRole("button", { name: "Comprobar cola local", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Comprobar cola local", exact: true }).click();
  await expect(
    page.getByText(/No pudimos verificar tu cola local/).filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(raw);
  expect(control.calls.some((c) => c.includes("typed-recordings"))).toBe(false);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
});
