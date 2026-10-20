// T115 · Experiencia móvil (spec 002): modo enfoque, "anterior", marcar sin bloqueo, descanso,
// Mi semana, objetivos táctiles de 44 px y app instalable. Corre con el viewport de móvil de la config.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { admin, createUser, resetAll, seedCoach, seedProgram, seedWorkout } from "./support/db";
import { login } from "./support/ui";

const LUIS = {
  email: "luis-movil@iron-strength.e2e.test",
  name: "Luis",
  password: "Contraseña-E2E-2026!",
};
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
  await expect(page.getByRole("status").filter({ hasText: /^Llevas/ })).toHaveText(
    "Llevas 0 de 1 sesiones",
  );
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

test("superserie: calentamiento, rondas desiguales, recuperación y descanso compartido (T147)", async ({
  page,
}) => {
  const db = admin();
  const { data: parent } = await db
    .from("program_sessions")
    .select("program_id")
    .eq("id", sessionId)
    .single();
  const { data: session, error } = await db
    .from("program_sessions")
    .insert({ program_id: parent!.program_id, week_number: 1, label: "B" })
    .select("id")
    .single();
  expect(error).toBeNull();
  const { data: exercises } = await db
    .from("exercises")
    .select("id, name")
    .in("name", ["Sentadilla", "Press de banca"])
    .is("coach_id", null);
  const group = crypto.randomUUID();
  const { error: insertError } = await db.from("session_exercises").insert(
    ["Sentadilla", "Press de banca"].map((name, position) => ({
      program_session_id: session!.id,
      exercise_id: exercises!.find((e) => e.name === name)!.id,
      position,
      sets: position === 0 ? 3 : 2,
      reps_min: 8,
      reps_max: 12,
      target_weight_kg: 60,
      superset_id: group,
      superset_rest_seconds: 120,
    })),
  );
  expect(insertError).toBeNull();
  await login(page, LUIS.email, LUIS.password);
  await page.goto(`/workout/${session!.id}`);
  const squat = page.getByRole("region", { name: "Sentadilla", exact: true });
  const bench = page.getByRole("region", { name: "Press de banca", exact: true });
  await expect(squat.getByText("Superserie 1", { exact: true })).toBeVisible();
  await squat.getByRole("button", { name: "Agregar serie" }).click();
  await page.getByRole("button", { name: "Serie 4 de Sentadilla, opciones", exact: true }).click();
  await page
    .getByRole("button", { name: "Serie 4 de Sentadilla como calentamiento", exact: true })
    .click();
  await page.getByLabel("Repeticiones de la serie 4 de Sentadilla").press("Enter");
  expect(await clockSeconds(page)).toBeGreaterThan(50);
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toBeFocused();
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla").press("Enter");
  await expect(page.getByLabel("Peso de la serie 1 de Press de banca (kg)")).toBeFocused();
  await expect(page.getByRole("timer")).toHaveCount(0);
  await page.reload();
  await expect(bench).toHaveAttribute("data-active", "true");
  await page.getByLabel("Repeticiones de la serie 1 de Press de banca").press("Enter");
  await expect(page.getByLabel("Peso de la serie 2 de Sentadilla (kg)")).toBeFocused();
  const remaining = await clockSeconds(page);
  expect(remaining).toBeGreaterThan(110);
  await page.reload();
  expect(await clockSeconds(page)).toBeLessThanOrEqual(remaining);
  expect(await clockSeconds(page)).toBeGreaterThan(100);
  await page.getByLabel("Descanso automático de Sentadilla").selectOption("180");
  await expect(page.getByLabel("Descanso automático de Press de banca")).toHaveValue("180");
  await page.getByLabel("Repeticiones de la serie 2 de Sentadilla").press("Enter");
  await expect(page.getByRole("timer")).toHaveCount(0);
  await page.getByLabel("Repeticiones de la serie 2 de Press de banca").press("Enter");
  await expect(page.getByLabel("Peso de la serie 3 de Sentadilla (kg)")).toBeFocused();
  expect(await clockSeconds(page)).toBeGreaterThan(170);
  await page.getByLabel("Repeticiones de la serie 3 de Sentadilla").press("Enter");
  await expect(squat.getByRole("button", { name: /completado/ })).toBeVisible();
  await expect(bench.getByRole("button", { name: /completado/ })).toBeVisible();
  await page.getByRole("button", { name: "Terminar entrenamiento" }).click();
  await page.getByRole("button", { name: "Sí, finalizar" }).click();
  await expect(page.getByText("¡Entrenamiento guardado!")).toBeVisible();
  const { data: saved } = await db
    .from("workouts")
    .select("id, workout_sets(id)")
    .eq("program_session_id", session!.id);
  expect(saved).toHaveLength(1);
  expect(saved![0].workout_sets).toHaveLength(6);
});

test("historial del ejercicio pagina sin perder el registro ni detener el descanso (T149)", async ({
  page,
}) => {
  const db = admin();
  const { data: program } = await db
    .from("program_sessions")
    .select("programs(student_id),session_exercises(exercise_id,exercises(name))")
    .eq("id", sessionId)
    .single();
  const squat = program!.session_exercises.find((e) => e.exercises.name === "Sentadilla")!;
  for (let i = 1; i <= 12; i++)
    await seedWorkout({
      studentId: program!.programs.student_id!,
      exerciseId: squat.exercise_id,
      exerciseName: "Sentadilla",
      daysAgo: i + 10,
    });
  await openSession(page);
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("11");
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  const before = await clockSeconds(page);
  const opener = page.getByRole("button", { name: "Ver historial de Sentadilla", exact: true });
  await opener.click();
  const panel = page.getByRole("dialog", { name: "Historial de Sentadilla", exact: true });
  await expect(panel.getByRole("article")).toHaveCount(10);
  const marks = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(marks.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
  await panel.getByRole("button", { name: "Ver más resultados" }).click();
  await expect.poll(() => panel.getByRole("article").count()).toBeGreaterThan(10);
  await expect(panel.getByRole("link", { name: /Ver entrenamiento/ }).first()).toHaveAttribute(
    "target",
    "_blank",
  );
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.getByLabel("Repeticiones de la serie 1 de Sentadilla")).toHaveValue("11");
  await expect(
    page.getByRole("button", { name: "Desmarcar la serie 1 de Sentadilla" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await clockSeconds(page)).toBeLessThanOrEqual(before);
  expect(await clockSeconds(page)).toBeGreaterThan(0);
  await page.route("**/*", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
  await opener.click();
  await expect(panel.getByRole("alert")).toContainText("No se pudo cargar el historial");
  await page.unroute("**/*");
  await panel.getByRole("button", { name: "Reintentar historial" }).click();
  await expect(panel.getByRole("article")).toHaveCount(10);
  await panel.getByRole("button", { name: "Cerrar historial" }).click();
  await expect(page.getByLabel("Repeticiones de la serie 1 de Sentadilla")).toHaveValue("11");
});

test("comparación explica la progresión y copiar no modifica series hechas (T150)", async ({
  page,
}) => {
  const db = admin();
  const { data: session } = await db
    .from("program_sessions")
    .select("programs(student_id),session_exercises(exercise_id,exercises(name))")
    .eq("id", sessionId)
    .single();
  const studentId = session!.programs.student_id!,
    exerciseId = session!.session_exercises.find(
      (e) => e.exercises.name === "Sentadilla",
    )!.exercise_id;
  expect((await db.from("workouts").delete().eq("student_id", studentId)).error).toBeNull();
  const workoutId = await seedWorkout({
    studentId,
    exerciseId,
    exerciseName: "Sentadilla",
    daysAgo: 1,
  });
  expect(
    (
      await db.from("workout_sets").insert({
        workout_id: workoutId,
        student_id: studentId,
        exercise_id: exerciseId,
        exercise_name: "Sentadilla",
        position: 0,
        set_number: 2,
        weight_kg: 55,
        reps: 9,
        is_warmup: false,
      })
    ).error,
  ).toBeNull();
  await openSession(page);
  const exercise = page.getByRole("region", { name: "Sentadilla", exact: true });
  const comparison = page.getByRole("region", { name: "Comparación de Sentadilla", exact: true });
  await comparison.getByText("Comparar prescripción y progreso", { exact: true }).click();
  await expect(comparison.getByText("Prescripción", { exact: true })).toBeVisible();
  await expect(comparison.getByText(/Última ejecución/)).toBeVisible();
  await expect(comparison.getByText("Sugerencia", { exact: true })).toBeVisible();
  await expect(comparison.getByText(/Mantén la carga y completa las series/)).toBeVisible();
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("70");
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("7");
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await expect(
    exercise.getByRole("button", { name: /Copiar lo anterior en la serie 1/ }),
  ).toBeDisabled();
  await exercise.getByRole("button", { name: "Copiar sugerencia a pendientes" }).click();
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("70");
  await expect(page.getByLabel("Repeticiones de la serie 1 de Sentadilla")).toHaveValue("7");
  await expect(page.getByLabel("Repeticiones de la serie 2 de Sentadilla")).toHaveValue("12");
  await page.getByRole("button", { name: "Deshacer última acción" }).click();
  await expect(page.getByLabel("Repeticiones de la serie 2 de Sentadilla")).toHaveValue("");
  await page.getByRole("button", { name: "Copiar anterior a pendientes" }).click();
  await expect(page.getByLabel("Repeticiones de la serie 2 de Sentadilla")).toHaveValue("9");
  await expect(page.getByLabel("Repeticiones de la serie 1 de Sentadilla")).toHaveValue("7");
  await expect(page.getByRole("timer")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("70");
  await expect(
    page.getByRole("button", { name: "Desmarcar la serie 1 de Sentadilla" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("esfuerzo y nota se recuperan y se guardan una sola vez tras perder la respuesta (T156)", async ({
  page,
}) => {
  await openSession(page);
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await page.getByRole("button", { name: "Terminar entrenamiento" }).click();
  await page.getByLabel("Esfuerzo percibido (opcional)", { exact: true }).selectOption("8");
  await page
    .getByLabel("Nota del entrenamiento (opcional)", { exact: true })
    .fill("Buen ritmo, última serie exigente.");
  await page.getByRole("button", { name: "Seguir entrenando", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Terminar entrenamiento" }).click();
  await expect(page.getByLabel("Esfuerzo percibido (opcional)", { exact: true })).toHaveValue("8");
  await expect(page.getByLabel("Nota del entrenamiento (opcional)", { exact: true })).toHaveValue(
    "Buen ritmo, última serie exigente.",
  );
  await page.setViewportSize({ width: 360, height: 640 });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
  let intercepted = false;
  await page.route("**/api/workouts/sync", async (route) => {
    if (!intercepted && route.request().method() === "POST") {
      intercepted = true;
      await route.fetch();
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Sí, finalizar", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Entrenamiento pendiente de guardar" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("¡Entrenamiento guardado!", { exact: true })).toBeVisible();
  await expect(page.getByText("8/10", { exact: true })).toBeVisible();
  await expect(page.getByText("Buen ritmo, última serie exigente.", { exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const { data, error } = await admin()
    .from("workouts")
    .select("perceived_effort,note,workout_sets(count)")
    .eq("id", id)
    .single();
  expect(error).toBeNull();
  expect(data).toMatchObject({
    perceived_effort: 8,
    note: "Buen ritmo, última serie exigente.",
    workout_sets: [{ count: 1 }],
  });
});
