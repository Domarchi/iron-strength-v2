import {
  buildTrainingProgress,
  type TrainingProgressSource,
} from "../../src/domain/training-progress";
import { fulfillLegacyTypedResult } from "./support/legacy-result";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const origin = "https://iron-strength-seven.vercel.app",
  id = "11111111-1111-4111-8111-111111111111",
  workout = "22222222-2222-4222-8222-222222222222";
async function setup(page: Page, bodyweight = false, failed = false, empty = false) {
  const name = bodyweight ? "Dominadas" : "Sentadilla";
  const dates = empty
    ? ["2026-01-01", "2026-01-05", "2026-01-10", "2026-01-24"]
    : ["2026-08-01", "2026-09-01", "2026-10-01", "2026-10-24"];
  const values = bodyweight
    ? [
        [0, 15],
        [0, 10],
        [0, 12],
        [0, 14],
      ]
    : [
        [100, 6],
        [60, 10],
        [75, 10],
        [82.5, 10],
      ];
  const source: TrainingProgressSource = {
    version: 1,
    userId: id,
    today: "2026-10-24",
    workouts: dates.map((date, i) => ({
      id: i === 3 ? workout : `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
      startedAt: `${date}T14:00:00Z`,
      date,
      sourceKind: "assigned",
      title: null,
      sessionLabel: "A",
      durationSeconds: 1800,
      perceivedEffort: 7,
      note: null,
      sets: [
        {
          id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`,
          exerciseId: id,
          name,
          muscleGroup: "Piernas",
          position: 0,
          setNumber: 1,
          metrics: {
            recordType: null,
            weightKg: values[i][0],
            reps: values[i][1],
            durationSeconds: null,
            distanceMeters: null,
          },
          setType: "working",
          effort: null,
        },
      ],
    })),
  };
  const snapshot = {
    version: 2,
    userId: id,
    today: source.today,
    ...buildTrainingProgress(source),
  };
  let reads = 0;
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
    else if (path.endsWith("/training-progress")) {
      if (failed && ++reads > 1)
        return route.fulfill({
          status: 503,
          json: {
            version: 1,
            error: { code: "unavailable", message: "No pudimos cargar el progreso. Reintenta." },
          },
        });
      json = snapshot;
    } else if (path.endsWith("/workouts/" + workout))
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
          summary: {
            workingSets: 1,
            volumeKg: values[3][0] * values[3][1],
            bodyweightReps: bodyweight ? 14 : 0,
            exerciseCount: 1,
          },
          exercises: [
            {
              position: 0,
              exerciseId: id,
              name,
              sets: [
                {
                  id: source.workouts[3].sets[0].id,
                  setNumber: 1,
                  weightKg: values[3][0],
                  reps: values[3][1],
                  isWarmup: false,
                },
              ],
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
  await page
    .getByRole("button", { name: `Ver progreso de ${name} · Registro anterior`, exact: true })
    .click();
}
for (const theme of ["light", "dark"] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme });
    test("periodos, comparación, marcas históricas y vuelta desde evidencia a 360 px", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await setup(page);
      await page.getByRole("button", { name: "Marcas históricas", exact: true }).click();
      await expect(page.getByLabel("Marca histórica de Peso")).toHaveText("100 kg");
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
      await expect(page.getByText("+162,5 %", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: /Ver entrenamiento del 24/ }).click();
      await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
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
      await expect(page.getByText("+262,5 %", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Marcas históricas", exact: true }).click();
  await expect(page.getByLabel("Marca histórica de Repeticiones")).toHaveText("15 reps");
  await expect(page.getByRole("button", { name: "Volumen", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Repeticiones totales", exact: true }).click();
  await expect(page.getByLabel("Valor del periodo")).toHaveText("36 reps");
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
  await expect(page.getByText("No hay registros en este periodo.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Marcas históricas", exact: true }).click();
  await expect(page.getByLabel("Marca histórica de Peso")).toHaveText("100 kg");
  await expect(page.getByRole("img")).toHaveCount(0);
});
