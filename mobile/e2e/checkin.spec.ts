import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { enterWeekUser, setupDownloadedWeek } from "./support/week-fixture";

const origin = "https://iron-strength-seven.vercel.app";
const weekStart = "2026-10-19";

for (const theme of ["dark", "light"] as const)
  test(`check-in semanal: responder, enviar una vez y corregir · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await expect(page.getByRole("group", { name: "Check-in semanal" })).toHaveCount(0);
    let saved: unknown = null,
      saves = 0;
    await page.route(origin + "/api/mobile/v1/checkins", async (route) => {
      if (route.request().method() === "POST") {
        saves++;
        saved = route.request().postDataJSON();
      }
      await route.fulfill({
        json: {
          version: 1,
          weekStart,
          answers: saved ? (saved as { answers: unknown }).answers : null,
        },
      });
    });
    await page.reload();
    await enterWeekUser(page);
    const card = page.getByRole("group", { name: "Check-in semanal" });
    await expect(card).toBeVisible();
    const send = card.getByRole("button", { name: "Enviar check-in", exact: true });
    await expect(send).toBeDisabled();
    for (const [label, n] of [
      ["Sueño", 4],
      ["Energía", 3],
      ["Dolor muscular", 2],
      ["Motivación", 5],
    ] as const) {
      const choice = card.getByRole("radio", { name: `${label} ${n}`, exact: true });
      expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await choice.click();
      await expect(choice).toBeChecked();
    }
    await card
      .getByRole("textbox", { name: "Nota para tu coach", exact: true })
      .fill("Buena semana");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await expect(send).toBeEnabled();
    await send.click();
    await expect(card.getByText("Enviado. Tu coach ya puede verlo.")).toBeVisible();
    expect(saves).toBe(1);
    expect(saved).toEqual({
      version: 1,
      answers: { sleep: 4, energy: 3, soreness: 2, motivation: 5, note: "Buena semana" },
    });
    await card.getByRole("button", { name: "Corregir mi check-in", exact: true }).click();
    await card.getByRole("radio", { name: "Energía 5", exact: true }).click();
    await card.getByRole("button", { name: "Enviar check-in", exact: true }).click();
    await expect(card.getByText("Enviado. Tu coach ya puede verlo.")).toBeVisible();
    expect(saves).toBe(2);
    expect((saved as { answers: { energy: number } }).answers.energy).toBe(5);
  });

test("un fallo al enviar conserva las respuestas y permite reintentar", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await setupDownloadedWeek(page);
  let fail = true,
    stored: unknown = null;
  await page.route(origin + "/api/mobile/v1/checkins", async (route) => {
    if (route.request().method() === "POST") {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { version: 1, error: { code: "unavailable", message: "Sin servicio." } },
        });
      stored = route.request().postDataJSON().answers;
    }
    return route.fulfill({ json: { version: 1, weekStart, answers: stored } });
  });
  await page.reload();
  await enterWeekUser(page);
  const card = page.getByRole("group", { name: "Check-in semanal" });
  for (const [label, n] of [
    ["Sueño", 3],
    ["Energía", 3],
    ["Dolor muscular", 3],
    ["Motivación", 3],
  ] as const)
    await card.getByRole("radio", { name: `${label} ${n}`, exact: true }).click();
  await card.getByRole("button", { name: "Enviar check-in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sin servicio." })).toBeVisible();
  await expect(card.getByRole("radio", { name: "Sueño 3", exact: true })).toBeChecked();
  fail = false;
  await card.getByRole("button", { name: "Enviar check-in", exact: true }).click();
  await expect(card.getByText("Enviado. Tu coach ya puede verlo.")).toBeVisible();
});
