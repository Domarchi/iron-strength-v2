import { downloadCard } from "./support/download-cache";
import { test, expect } from "@playwright/test";
import { setupDownloadedWeek } from "./support/week-fixture";
test("misma descarga completa en Inicio, Entrenar y Cuenta sin crear un paquete anterior", async ({
  page,
}) => {
  const control = await setupDownloadedWeek(page);
  await expect(
    page.getByRole("button", { name: "Descargar entrenamientos", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  for (const name of ["Inicio", "Entrenar", "Cuenta"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("heading", { name: name === "Inicio" ? "Tu semana" : name, exact: true }),
    ).toBeVisible();
    await expect(
      downloadCard(page).getByRole("button", {
        name: "Actualizar entrenamientos descargados",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      downloadCard(page)
        .getByText(/Disponible sin conexión/)
        .filter({ visible: true }),
    ).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Descargar semana", exact: true })).toHaveCount(
      0,
    );
  }
  expect(control.completeRequests).toBe(1);
  expect(control.requests).toBe(0);
});
