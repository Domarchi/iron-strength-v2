// T115 · Experiencia móvil (spec 002): modo enfoque, "anterior", marcar sin bloqueo, descanso,
// Mi semana, objetivos táctiles de 44 px y app instalable. Corre con el viewport de móvil de la config.
import { expect, test, type Page } from "@playwright/test";
import { admin, createUser, resetAll, seedCoach, seedProgram, seedWorkout } from "./support/db";
import { login } from "./support/ui";

const LUIS = { email: "luis-movil@e2e.test", name: "Luis", password: "Contraseña-E2E-2026!" };
let sessionId: string;

test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  const studentId = await createUser(admin(), { role: "student", ...LUIS, coachId });
  const seeded = await seedProgram({ coachId, studentId });
  sessionId = seeded.sessionId;
  // Última vez: Sentadilla 60 kg × 10 en la serie 1 (el "anterior" de la fila).
  await seedWorkout({
    studentId,
    exerciseId: seeded.exercises.get("Sentadilla")!,
    exerciseName: "Sentadilla",
    daysAgo: 3,
  });
});

async function openSession(page: Page) {
  await login(page, LUIS.email, LUIS.password);
  await page.goto(`/workout/${sessionId}`);
  await expect(page.getByRole("heading", { name: /Sesión A/ })).toBeVisible();
}

const clockSeconds = async (page: Page) => {
  const text = (await page.getByTestId("rest-clock").textContent()) ?? "";
  const [m, s] = text.split(":").map(Number);
  return m * 60 + s;
};

test("Mi semana muestra la tira de la semana y qué toca hoy (RF-61, RF-62)", async ({ page }) => {
  await login(page, LUIS.email, LUIS.password);
  await page.goto("/week");

  await expect(
    page.getByRole("list", { name: "Días de la semana" }).getByRole("listitem"),
  ).toHaveCount(7);
  await expect(page.getByText("Hoy toca")).toBeVisible();
  await expect(page.getByRole("region", { name: "Próxima sesión" })).toContainText("Sentadilla");
  await expect(page.getByRole("status")).toHaveText("Llevas 0 de 1 sesiones");
  await expect(page.getByRole("link", { name: /Aún sin racha|Racha/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
});

test("durante la sesión no hay navegación global (RF-52)", async ({ page }) => {
  await login(page, LUIS.email, LUIS.password);
  await page.goto("/week");
  await page
    .getByRole("region", { name: "Próxima sesión" })
    .getByRole("button", { name: "Empezar" })
    .click();

  await expect(page.getByRole("heading", { name: /Sesión A/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Terminar entrenamiento" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Avance de la sesión" })).toBeVisible();
});

test("anterior, copiar y descanso entre series (RF-53, RF-54, RF-27, RF-60)", async ({ page }) => {
  await openSession(page);

  // "Anterior" de la serie 1 es 60 kg × 10; tocarlo copia los valores.
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("50");
  await page
    .getByRole("button", { name: "Copiar lo anterior en la serie 1 de Sentadilla" })
    .click();
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("60");
  await expect(page.getByLabel("Repeticiones de la serie 1 de Sentadilla")).toHaveValue("10");

  // Marcar la serie inicia el descanso de 90 s.
  await expect(page.getByRole("timer")).toHaveCount(0);
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  const before = await clockSeconds(page);
  expect(before).toBeGreaterThan(80);
  expect(before).toBeLessThanOrEqual(90);

  // +15 s y −15 s ajustan el descanso.
  await page.getByRole("button", { name: "Sumar 15 segundos al descanso" }).click();
  expect(await clockSeconds(page)).toBeGreaterThan(before + 10);
  await page.getByRole("button", { name: "Restar 15 segundos al descanso" }).click();
  expect(await clockSeconds(page)).toBeLessThanOrEqual(before + 1);

  // Saltar lo cierra.
  await page.getByRole("button", { name: "Saltar", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveCount(0);

  // Desmarcar no inicia descanso (RF-60).
  await page.getByRole("button", { name: "Desmarcar la serie 1 de Sentadilla" }).click();
  await expect(page.getByRole("timer")).toHaveCount(0);
});

test("marcar con campos vacíos usa el valor de referencia (RF-55)", async ({ page }) => {
  await openSession(page);

  // Serie 2: no hay "anterior"; las repeticiones salen del mínimo prescrito (8) y el peso del último usado.
  await page.getByRole("button", { name: "Marcar como hecha la serie 2 de Sentadilla" }).click();
  await expect(page.getByLabel("Repeticiones de la serie 2 de Sentadilla")).toHaveValue("8");
  await expect(page.getByLabel("Peso de la serie 2 de Sentadilla (kg)")).toHaveValue("60");
  await expect(
    page.getByRole("button", { name: "Desmarcar la serie 2 de Sentadilla" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("descanso por ejercicio, volumen en vivo y edición inválida (T135)", async ({ page }) => {
  await openSession(page);
  const rest = page.getByLabel("Descanso automático de Sentadilla");
  await rest.selectOption("120");
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await expect(page.getByLabel("Volumen de trabajo")).toHaveText("600 kg");
  expect(await clockSeconds(page)).toBeGreaterThan(110);
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("0");
  await expect(
    page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Volumen de trabajo")).toHaveText("0 kg");
  await rest.selectOption("0");
  await page.reload();
  await expect(rest).toHaveValue("0");
  await page.getByRole("button", { name: "Marcar como hecha la serie 2 de Sentadilla" }).click();
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(page.getByLabel("Volumen de trabajo")).toHaveText("480 kg");
});

test("un ejercicio completo se pliega y se puede volver a abrir (RF-56)", async ({ page }) => {
  await openSession(page);
  for (const n of [1, 2, 3]) {
    await page
      .getByRole("button", { name: `Marcar como hecha la serie ${n} de Sentadilla` })
      .click();
  }
  const folded = page.getByRole("button", { name: "Sentadilla, completado. Ver las series" });
  await expect(folded).toBeVisible();
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveCount(0);

  await folded.click();
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toBeVisible();
});

test("teclado, deshacer y descanso recuperado al recargar (T137)", async ({ page }) => {
  await openSession(page);
  await page.getByLabel("Descanso automático de Sentadilla").selectOption("120");
  const weight = page.getByLabel("Peso de la serie 1 de Sentadilla (kg)");
  const reps = page.getByLabel("Repeticiones de la serie 1 de Sentadilla");
  await weight.fill("62,5");
  await weight.press("Enter");
  await expect(reps).toBeFocused();
  await reps.fill("10");
  await reps.press("Enter");
  await expect(page.getByLabel("Peso de la serie 2 de Sentadilla (kg)")).toBeFocused();
  await expect(page.getByLabel("Volumen de trabajo")).toHaveText("625 kg");
  const undo = page.getByRole("button", { name: "Deshacer última acción" });
  await undo.click();
  await expect(page.getByLabel("Volumen de trabajo")).toHaveText("0 kg");
  await expect(page.getByRole("timer")).toHaveCount(0);
  await reps.press("Enter");
  await page.getByRole("button", { name: "Serie 1 de Sentadilla, opciones", exact: true }).click();
  await page.getByRole("button", { name: "Quitar la serie 1 de Sentadilla", exact: true }).click();
  await undo.click();
  await expect(weight).toHaveValue("62,5");
  await expect(reps).toHaveValue("10");
  const before = await clockSeconds(page);
  await page.reload();
  await expect(page.getByRole("timer")).toBeVisible();
  expect(await clockSeconds(page)).toBeLessThanOrEqual(before);
  expect(await clockSeconds(page)).toBeGreaterThan(0);
  await expect(page.getByLabel("Volumen de trabajo")).toHaveText("625 kg");
  await expect(page.getByText("Guardado en este dispositivo", { exact: true })).toBeVisible();
  await expect(undo).toHaveCount(0);
});

test("Terminar guarda la sesión desde la barra superior (RF-59)", async ({ page }) => {
  await openSession(page);
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await page.getByRole("button", { name: "Terminar entrenamiento" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Confirmar el fin del entrenamiento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sí, finalizar" }).click();
  await expect(page.getByText("¡Entrenamiento guardado!")).toBeVisible();
});

test("sin scroll horizontal y con objetivos táctiles de 44 px (RF-50)", async ({ page }) => {
  await login(page, LUIS.email, LUIS.password);

  for (const path of ["/week", `/workout/${sessionId}`, "/history", "/progress", "/body"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} se desborda a lo ancho`).toBeLessThanOrEqual(0);
  }

  await page.goto(`/workout/${sessionId}`);
  await expect(page.getByRole("heading", { name: /Sesión A/ })).toBeVisible();
  const targets = page.getByRole("button", {
    name: /Marcar como hecha|Terminar entrenamiento|Agregar serie/,
  });
  const count = await targets.count();
  expect(count).toBeGreaterThan(3);
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox();
    expect(box?.width ?? 0, `objetivo ${i} angosto`).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, `objetivo ${i} bajo`).toBeGreaterThanOrEqual(44);
  }
});

test("la app se puede instalar: manifiesto e iconos públicos (RF-45)", async ({
  page,
  request,
}) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const json = await manifest.json();
  expect(json).toMatchObject({ display: "standalone", lang: "es-CL", start_url: "/" });

  for (const icon of ["192", "512", "maskable"]) {
    const res = await request.get(`/icons/${icon}`);
    expect(res.ok(), `icono ${icon}`).toBe(true);
    expect(res.headers()["content-type"]).toContain("image/png");
  }

  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", /#/);
});
