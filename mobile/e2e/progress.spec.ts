import { fulfillLegacyTypedResult } from "./support/legacy-result";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const origin = "https://iron-strength-seven.vercel.app",
  id = "11111111-1111-4111-8111-111111111111",
  workout = "22222222-2222-4222-8222-222222222222";
async function setup(page: Page, bodyweight = false, failed = false, empty = false) {
  const exercise = {
    exerciseId: id,
    name: bodyweight ? "Dominadas" : "Sentadilla",
    bestWeightKg: 100,
    bestEstimated1RM: 120,
    bestReps: 15,
    isBodyweight: bodyweight,
    lastDate: "2026-10-24",
    workoutCount: 4,
  };
  await page.route(origin + "/api/mobile/v1/**", async (route) => {
    if (await fulfillLegacyTypedResult(route)) return;
    const path = new URL(route.request().url()).pathname;
    let json: unknown = { version: 1, kind: "no_program" };
    if (path.endsWith("auth/login"))
      json = {
        version: 1,
        accessToken: "synthetic-access",
        refreshToken: "synthetic-refresh",
        expiresAt: 4000000000,
        profile: { id, fullName: "Ana Prueba", email: "ana@example.test", role: "student" },
      };
    else if (path.endsWith("comments/unread")) json = { version: 1, items: [] };
    else if (path.endsWith("/comments"))
      json = { version: 1, workoutId: workout, items: [], nextCursor: null, unreadCount: 0 };
    else if (path.endsWith("/progress/" + id)) {
      if (failed) {
        await route.fulfill({
          status: 503,
          json: {
            version: 1,
            error: { code: "unavailable", message: "No pudimos cargar el progreso. Reintenta." },
          },
        });
        return;
      }
      json = {
        version: 1,
        today: "2026-10-24",
        exercise,
        points: empty
          ? []
          : [
              {
                workoutId: workout,
                date: "2026-08-01",
                estimated1RM: 120,
                volumeKg: 900,
                bodyweightReps: 15,
              },
              {
                workoutId: workout,
                date: "2026-09-01",
                estimated1RM: 80,
                volumeKg: 400,
                bodyweightReps: 10,
              },
              {
                workoutId: workout,
                date: "2026-10-01",
                estimated1RM: 100,
                volumeKg: 500,
                bodyweightReps: 12,
              },
              {
                workoutId: workout,
                date: "2026-10-24",
                estimated1RM: 110,
                volumeKg: 600,
                bodyweightReps: 14,
              },
            ],
      };
    } else if (path.endsWith("/progress")) json = { version: 1, exercises: [exercise] };
    else if (path.endsWith("/workouts/" + workout))
      json = {
        version: 1,
        workout: {
          id: workout,
          programName: "Fuerza",
          sessionLabel: "A",
          startedAt: "2026-10-24T14:00:00Z",
          performedOn: "2026-10-24",
          durationSeconds: 1800,
          perceivedEffort: 7,
          note: null,
          summary: { workingSets: 1, volumeKg: 600, bodyweightReps: 0, exerciseCount: 1 },
          exercises: [
            {
              position: 0,
              exerciseId: id,
              name: exercise.name,
              sets: [{ id: workout, setNumber: 1, weightKg: 60, reps: 10, isWarmup: false }],
            },
          ],
        },
      };
    await route.fulfill({ json, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await page.goto("/");
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Synthetic-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Hola, Ana", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Progreso", exact: true }).click();
  await page.getByRole("button", { name: "Ver progreso de " + exercise.name, exact: true }).click();
}
for (const theme of ["light", "dark"] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme });
    test("periodos, comparación, marcas históricas y vuelta desde evidencia a 360 px", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await setup(page);
      await expect(page.getByText("Mejor peso histórico: 100 kg", { exact: true })).toBeVisible();
      await expect(page.getByText("-8,3 %", { exact: true })).toBeVisible();
      const selectors = await Promise.all(
        ["4 semanas", "8 semanas", "12 semanas"].map((name) =>
          page.getByRole("button", { name, exact: true }).boundingBox(),
        ),
      );
      expect(
        selectors.every((box) => box && Math.abs(box.y - selectors[0]!.y) < 1 && box.height >= 48),
      ).toBe(true);

      await page.getByRole("button", { name: "4 semanas", exact: true }).click();
      await page.getByRole("button", { name: "Volumen", exact: true }).click();
      await expect(page.getByText("+175 %", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: /Ver entrenamiento del 24/ }).click();
      await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Volver al progreso", exact: true }).click();
      await expect(page.getByRole("button", { name: "4 semanas", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByRole("button", { name: "Volumen", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.getByRole("button", { name: "12 semanas", exact: true }).click();
      await expect(page.getByText("+66,7 %", { exact: true })).toBeVisible();
      expect(
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
          .violations,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`progress-${theme}-360.png`),
        fullPage: true,
      });
    });
  });
}
test("sin carga ofrece repeticiones y no inventa 1RM", async ({ page }) => {
  await setup(page, true);
  await expect(page.getByText("Mejor serie histórica: 15 reps", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Volumen", exact: true })).toHaveCount(0);
  await expect(page.getByText("36 reps", { exact: true })).toBeVisible();
});
test("fallo de lectura no se presenta como periodo vacío", async ({ page }) => {
  await setup(page, false, true);
  await expect(
    page.getByRole("alert").filter({ hasText: "No pudimos cargar el progreso. Reintenta." }),
  ).toBeVisible();
  await expect(page.getByText("No hay registros en este periodo.", { exact: true })).toHaveCount(0);
});

test("periodo vacío conserva la marca histórica y explica la ausencia", async ({ page }) => {
  await setup(page, false, false, true);
  await expect(
    page.getByRole("alert").filter({ hasText: "No hay registros en este periodo." }),
  ).toBeVisible();
  await expect(page.getByText("Mejor peso histórico: 100 kg", { exact: true })).toBeVisible();
  await expect(page.getByRole("img")).toHaveCount(0);
});
