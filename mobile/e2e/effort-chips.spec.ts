import { expect, test } from "@playwright/test";
import { setupDownloadedWeek } from "./support/week-fixture";

test("el cierre ofrece esfuerzo 1–10 con un toque y conserva el campo numérico", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setupDownloadedWeek(page);
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Revisa antes de terminar", exact: true });
  const eight = review.getByRole("radio", { name: "Esfuerzo 8", exact: true });
  expect((await eight.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await eight.click();
  await expect(eight).toBeChecked();
  await expect(
    review.getByRole("textbox", { name: "Esfuerzo percibido", exact: true }),
  ).toHaveValue("8");
  await review.getByRole("radio", { name: "Esfuerzo 8", exact: true }).click();
  await expect(
    review.getByRole("textbox", { name: "Esfuerzo percibido", exact: true }),
  ).toHaveValue("");
});
