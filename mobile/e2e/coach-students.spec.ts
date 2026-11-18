import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupDownloadedWeek } from "./support/week-fixture";

const origin = "https://iron-strength-seven.vercel.app";
const coachId = "11111111-1111-4111-8111-111111111111";
const students = {
  version: 1,
  students: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Ana Prueba",
      lastWorkoutDate: "2026-11-10",
      week: { kind: "active", programName: "Fuerza", planned: 3, done: 1, deload: false },
      signals: [{ kind: "comments", label: "1 comentario pendiente", detail: "Revisa." }],
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      fullName: "Bruno Prueba",
      lastWorkoutDate: null,
      week: { kind: "no_program" },
      signals: [],
    },
  ],
};

const detail = {
  version: 1,
  checkin: {
    weekStart: "2026-11-09",
    answers: { sleep: 4, energy: 3, soreness: 2, motivation: 5, note: "Dormí poco" },
  },
  workouts: [{ id: "44444444-4444-4444-8444-444444444444", date: "2026-11-10", sets: 12 }],
  comments: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      workoutId: "44444444-4444-4444-8444-444444444444",
      body: "¿Puedo subir el peso?",
      createdAt: "2026-11-10T15:00:00.000Z",
      authorKind: "student",
    },
  ],
};

async function asCoach(page: import("@playwright/test").Page) {
  await page.route(origin + "/api/mobile/v1/auth/**", (route) =>
    route.fulfill({
      json: {
        version: 1,
        accessToken: "synthetic-access",
        refreshToken: "synthetic-refresh",
        expiresAt: 4000000000,
        profile: {
          id: coachId,
          fullName: "Coach Prueba",
          email: "coach@example.test",
          role: "coach",
        },
      },
    }),
  );
  await page.reload();
  await page.getByLabel("Correo", { exact: true }).fill("coach@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Synthetic-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

for (const theme of ["dark", "light"] as const)
  test(`el coach ve sus alumnos con avisos desde Cuenta · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await page.route(origin + "/api/mobile/v1/students", (route) =>
      route.fulfill({ json: students }),
    );
    const posts: { id: string; workoutId: string; body: string }[] = [];
    await page.route(origin + "/api/mobile/v1/students/*", (route) =>
      route.fulfill({ json: detail }),
    );
    await page.route(origin + "/api/mobile/v1/students/*/comments", async (route) => {
      posts.push(route.request().postDataJSON());
      if (posts.length === 1)
        return route.fulfill({
          status: 503,
          json: { error: { code: "unavailable", message: "No pudimos confirmar tu respuesta." } },
        });
      return route.fulfill({
        status: 201,
        json: { version: 1, status: "created", id: posts[posts.length - 1].id },
      });
    });
    await asCoach(page);
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await page.getByRole("button", { name: "Mis alumnos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mis alumnos" })).toBeVisible();
    await expect(page.getByLabel(/Ana Prueba\. 1 comentario pendiente/)).toBeVisible();
    await expect(page.getByLabel(/Bruno Prueba\. Sin avisos/)).toBeVisible();
    await expect(page.getByText("Fuerza · 1 de 3 sesiones · último 10/11")).toBeVisible();
    await expect(page.getByText("Sin programa vigente")).toBeVisible();
    // Tocar a un alumno abre su ficha con el detalle de cada aviso.
    await page.getByLabel(/Ana Prueba\. 1 comentario pendiente/).click();
    await expect(page.getByRole("heading", { name: "Ana Prueba" })).toBeVisible();
    await expect(page.getByText("Revisa.")).toBeVisible();
    await expect(page.getByText("Fuerza · 1 de 3 sesiones", { exact: true })).toBeVisible();
    await expect(page.getByText("10/11/2026").first()).toBeVisible();
    await expect(page.getByText("Sueño 4/5 · Energía 3/5")).toBeVisible();
    await expect(page.getByText(/Motivación 5\/5 · Dormí poco/)).toBeVisible();
    await expect(page.getByText("12 series")).toBeVisible();
    const box = page.getByLabel("Responder a Ana Prueba", { exact: true });
    await box.fill("Sí, sube 2,5 kg.");
    await page.getByRole("button", { name: "Enviar respuesta", exact: true }).click();
    await expect(page.getByText("No pudimos completar la solicitud.")).toBeVisible();
    await expect(box).toHaveValue("Sí, sube 2,5 kg.");
    await page.getByRole("button", { name: "Enviar respuesta", exact: true }).click();
    await expect(box).toHaveValue("");
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    expect(posts[0]).toMatchObject({
      workoutId: "44444444-4444-4444-8444-444444444444",
      body: "Sí, sube 2,5 kg.",
    });
    await expect(page.getByText("¿Puedo subir el peso?")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

test("un alumno no ve la lista de alumnos", async ({ page }) => {
  await setupDownloadedWeek(page);
  // Navegación interna: una recarga completa cerraría la sesión de prueba en memoria.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/students");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByText("Esta lista es solo para tu coach.")).toBeVisible();
});
