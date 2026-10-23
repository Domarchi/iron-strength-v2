import { test, expect, type Page } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
const exercise = "22222222-2222-4222-8222-222222222222";
const group = "33333333-3333-4333-8333-333333333333";
const session = {
  version: 1,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4000000000,
  profile: { id, fullName: "Ana Prueba", email: "ana@example.test", role: "student" },
};
const program = {
  id,
  name: "Fuerza · cuatro semanas",
  weeksCount: 4,
  startDate: "2026-10-19",
  endsOn: "2026-11-15",
};
const uniform = { sets: 2, repsMin: 8, repsMax: 10, targetWeightKg: 40 };
const routine = {
  version: 1,
  session: {
    id,
    programId: id,
    label: "A",
    title: "Tren inferior",
    programName: program.name,
    weekNumber: 1,
    weeksCount: 4,
  },
  exercises: [
    {
      exerciseId: exercise,
      sessionExerciseId: exercise,
      name: "Sentadilla",
      isBodyweight: false,
      prescribed: {
        sets: 2,
        repsMin: 6,
        repsMax: 10,
        targetWeightKg: null,
        series: [
          { repsMin: 6, repsMax: 6, targetWeightKg: 50 },
          { repsMin: 8, repsMax: 10, targetWeightKg: 45 },
        ],
      },
      note: "Baja con control",
      restSeconds: null,
      supersetId: group,
      supersetRestSeconds: 90,
      alternatives: [{ exerciseId: id, name: "Prensa", isBodyweight: false, prescribed: uniform }],
    },
    {
      exerciseId: id,
      sessionExerciseId: id,
      name: "Peso muerto rumano",
      isBodyweight: false,
      prescribed: uniform,
      note: null,
      restSeconds: null,
      supersetId: group,
      supersetRestSeconds: 90,
      alternatives: [],
    },
  ],
};
async function enter(page: Page) {
  await page.goto("/");
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
test("acceso → semana → rutina y alternativas; consulta sin escrituras ni tokens web persistidos", async ({
  page,
}) => {
  const seen: string[] = [];
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    seen.push(route.request().method() + " " + path);
    const data = path.endsWith("auth/login")
      ? session
      : path.endsWith("auth/logout")
        ? { version: 1, ok: true }
        : path.endsWith("week")
          ? {
              version: 1,
              kind: "active",
              program,
              weekNumber: 1,
              weekStart: "2026-10-19",
              weekEnd: "2026-10-25",
              sessions: [
                {
                  sessionId: id,
                  label: "A",
                  title: "Tren inferior",
                  status: "pending",
                  exerciseCount: 2,
                  setCount: 4,
                  exerciseNames: ["Sentadilla", "Peso muerto rumano"],
                  scheduledOn: "2026-10-23",
                },
              ],
            }
          : routine;
    await route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await enter(page);
  await expect(page.getByText("Hola, Ana")).toBeVisible();
  await expect(page.getByText("0 de 1 sesiones completadas")).toBeVisible();
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await expect(page.getByText("SUPERSERIE · 90 s al terminar la ronda")).toBeVisible();
  await expect(page.getByText("1. 6 reps · 50 kg", { exact: true })).toBeVisible();
  await expect(page.getByText("2. 8–10 reps · 45 kg", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver alternativas de Sentadilla", exact: true }).click();
  await expect(page.getByText("Prensa", { exact: true })).toBeVisible();
  await expect(page.getByText("Baja con control", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(seen.filter((x) => x.startsWith("POST") && !x.endsWith("auth/login"))).toEqual([]);
  await expect(page.getByRole("button", { name: /Empezar|Finalizar/ })).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("routine.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
});
test("error de red conserva el recorrido y permite reintentar; estados vacíos y tema oscuro desde 360 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  let attempt = 0;
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/**", async (route) => {
    if (route.request().url().endsWith("auth/login"))
      return route.fulfill({ json: session, headers: { "Access-Control-Allow-Origin": "*" } });
    if (++attempt === 1) return route.abort("internetdisconnected");
    await route.fulfill({
      json: { version: 1, kind: "no_program" },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await enter(page);
  await expect(
    page.getByText("No pudimos conectar. Revisa tu conexión y reintenta."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByText("Tu próximo comienzo")).toBeVisible();
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  const rects = await page
    .getByRole("button")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
  expect(rects.every((h) => h >= 44)).toBe(true);
});
