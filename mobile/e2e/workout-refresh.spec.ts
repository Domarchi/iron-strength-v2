import { completeWeekFixture } from "./support/complete-week-fixture";
import { expect, test } from "@playwright/test";
import { setupDownloadedWeek, enterWeekUser } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";

const key = `is:native-training:v1:${downloadId(1)}`;
for (const theme of ["light", "dark"] as const) {
  test(`registro compacto y contexto recuperable · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    const weight = page.getByRole("textbox", { name: "KG serie 1", exact: true });
    expect((await weight.boundingBox())!.y).toBeLessThan(320);
    await expect(page.getByText("KG", { exact: true })).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }),
    ).toHaveCount(1);
    await weight.fill("57,5");
    await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
    await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Detalles del ejercicio", exact: true });
    await expect(details).toBeVisible();
    await details
      .getByRole("textbox", { name: "Nota del ejercicio", exact: true })
      .fill("Controlar la bajada");
    await details.getByRole("button", { name: "Cerrar panel", exact: true }).click();
    await expect(details).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Detalles del ejercicio", exact: true }),
    ).toBeFocused();
    await expect(weight).toHaveValue("57,5");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("10");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await expect(page.getByTestId("rest-progress")).toBeVisible();
    await page.getByRole("button", { name: "Herramientas del ejercicio", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Herramientas del ejercicio", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByLabel("Tiempo de descanso restante").filter({ visible: true }),
    ).toHaveText("1:00");
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Revisa antes de terminar", exact: true });
    await expect(review).toContainText("2 series realizadas");
    await review
      .getByRole("textbox", { name: "Nota del entrenamiento", exact: true })
      .fill("Buena sesión");
    await review.getByRole("button", { name: "Seguir entrenando", exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).active.review.note, key),
      )
      .toBe("Buena sesión");
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Ir a Sentadilla", exact: true }).click();
    await expect(weight).toHaveValue("57,5");
    await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Nota del ejercicio", exact: true }),
    ).toHaveValue("Controlar la bajada");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: test.info().outputPath(`workout-${theme}-360.png`) });
  });

  test(`registro legado conserva revisión y errores dentro del panel · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
    await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
    await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
    await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("20");
    await page.getByRole("textbox", { name: "Repeticiones serie 1", exact: true }).fill("8");
    expect(
      (await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).boundingBox())!.y,
    ).toBeLessThan(320);
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Revisa antes de terminar", exact: true });
    await expect(review).toBeVisible();
    await review.getByRole("textbox", { name: "Esfuerzo percibido", exact: true }).fill("11");
    await review.getByRole("button", { name: "Guardar demo", exact: true }).click();
    await expect(review.getByRole("alert")).toBeVisible();
    await review.getByRole("textbox", { name: "Esfuerzo percibido", exact: true }).fill("7");
    await review.getByRole("button", { name: "Seguir entrenando", exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
    ).toBeChecked();
    await expect(page.getByTestId("rest-progress")).toBeVisible();
  });
}

test("el historial ampliado cierra el contexto al navegar y vuelve al mismo registro", async ({
  page,
}) => {
  const control = await setupDownloadedWeek(page);
  control.pack.history[downloadId(5)].items = [
    {
      id: downloadId(90),
      startedAt: "2026-10-23T15:00:00Z",
      date: "2026-10-23",
      sessionLabel: "A",
      sets: [
        { id: downloadId(91), position: 0, setNumber: 1, weightKg: 50, reps: 8, isWarmup: false },
      ],
    },
  ];
  const detail = completeWeekFixture(control.pack).history[downloadId(5)];
  detail.history.nextCursor = "2026-10-23T15:00:00Z|" + downloadId(90);
  await page.route(
    "https://iron-strength-seven.vercel.app/api/mobile/v1/training-catalog/" + downloadId(5),
    (route) => route.fulfill({ json: detail }),
  );
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("textbox", { name: "KG serie 1", exact: true }).fill("57,5");
  await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Ver más historial", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp("/exercises/" + downloadId(5)));
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "KG serie 1", exact: true })).toHaveValue("57,5");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
