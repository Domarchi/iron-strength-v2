import { test, expect } from "@playwright/test";

for (const marker of ["invalid", '{"version":99,"account":"future"}']) {
  test(`identidad local incompatible se conserva y ofrece recuperar acceso: ${marker}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const apiRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
    });
    await page.goto("/offline");
    const draftKey = "is:native-training:v1:11111111-1111-4111-8111-111111111111";
    const raw = '{"version":99,"keep":"unchanged"}';
    await page.evaluate(
      ({ marker, draftKey, raw }) => {
        localStorage.setItem("is:offline:active-user", marker);
        localStorage.setItem(draftKey, raw);
      },
      { marker, draftKey, raw },
    );
    await page.reload();
    await expect(page.getByRole("heading", { name: "Recupera tu acceso" })).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "No pudimos identificar la cuenta guardada" }),
    ).toContainText("Conservamos los datos de este dispositivo");
    await expect(page.getByRole("button", { name: "Entrar con conexión" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(await page.evaluate(() => localStorage.getItem("is:offline:active-user"))).toBe(marker);
    expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(raw);
    expect(errors).toEqual([]);
    expect(apiRequests).toEqual([]);
  });
}
