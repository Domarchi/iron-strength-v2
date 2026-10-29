import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test } from "./support/network";
import { admin, COACH, resetAll, seedCoach, seedProgram, seedWorkout } from "./support/db";
import { login } from "./support/ui";
let owner: string, sessionId: string;
test.beforeEach(async () => {
  await resetAll();
  owner = await seedCoach();
  sessionId = (await seedProgram({ coachId: owner, studentId: owner })).sessionId;
});
test.afterAll(async () => {
  await resetAll();
});
test("detalle por serie inicia offline con pesos prescritos, conserva la recuperación y confirma una vez", async ({
  page,
  context,
  network,
}) => {
  const targets = [
    { repsMin: 6, repsMax: 8, targetWeightKg: 75 },
    { repsMin: 8, repsMax: 10, targetWeightKg: 70 },
    { repsMin: 10, repsMax: 12, targetWeightKg: null },
  ];
  expect(
    (
      await admin()
        .from("session_exercises")
        .update({ reps_min: 6, reps_max: 12, prescription_sets: targets })
        .eq("program_session_id", sessionId)
        .eq("position", 0)
    ).error,
  ).toBeNull();
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  const card = page.getByRole("region", { name: "Entrenamientos sin conexión" });
  await card.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("Disponible sin conexión");
  await page.close();
  network.offline = true;
  const offline = await context.newPage();
  await offline.goto("/offline");
  await offline.getByRole("button", { name: "Ver sesión A", exact: true }).click();
  await expect(offline.getByRole("dialog")).toContainText("Serie 2 · 8–10 reps · 70 kg");
  await offline.getByRole("button", { name: "Empezar rutina descargada", exact: true }).click();
  let squat = offline.getByRole("region", { name: "Sentadilla", exact: true });
  await expect(squat.getByRole("textbox", { name: "KG serie 1", exact: true })).toHaveValue("75");
  await expect(squat.getByRole("textbox", { name: "KG serie 2", exact: true })).toHaveValue("70");
  await expect(squat.getByRole("textbox", { name: "REPS serie 1", exact: true })).toHaveValue("");
  await squat.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("6");
  await squat.getByRole("button", { name: "Completar serie 1", exact: true }).click();
  await offline.reload();
  squat = offline.getByRole("region", { name: "Sentadilla", exact: true });
  await expect(squat.getByRole("textbox", { name: "KG serie 1", exact: true })).toHaveValue("75");
  await expect(squat.getByRole("textbox", { name: "KG serie 2", exact: true })).toHaveValue("70");
  await expect(squat.getByRole("button", { name: "Desmarcar serie 1", exact: true })).toBeVisible();
  await offline.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  await expect(offline.getByRole("dialog")).toContainText(/1 series? realizadas?/);
  await offline.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  const pending = offline.getByRole("region", { name: "Registro tipado en este dispositivo" });
  await expect(pending).toContainText("pendiente de enviar");
  network.offline = false;
  await offline.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(pending).toContainText("Guardado en tu cuenta");
  await offline.reload();
  const saved = await admin()
    .from("workouts")
    .select("id,workout_sets(weight_kg,reps)")
    .eq("student_id", owner)
    .eq("program_session_id", sessionId);
  expect(saved.error).toBeNull();
  expect(saved.data).toHaveLength(1);
  expect(saved.data![0].workout_sets).toMatchObject([{ weight_kg: 75, reps: 6 }]);
});
test("descarga completa prepara el shell público y consulta su sesión vigente sin crear un registro", async ({
  page,
}) => {
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  const card = page.getByRole("region", { name: "Entrenamientos sin conexión", exact: true });
  await card.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("Disponible sin conexión");
  await card.getByRole("button", { name: "Abrir entrenamientos descargados" }).click();
  await expect(
    page.getByRole("heading", { name: "Entrena sin conexión", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver sesión A", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Sentadilla");
  expect(
    await page.evaluate((id) => localStorage.getItem(`is:native-training:v1:${id}`), owner),
  ).toBeNull();
  expect((await admin().from("workouts").select("id").eq("student_id", owner)).data).toEqual([]);
  expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
});

test("cierra y abre sin red, recupera rondas/descanso y sincroniza una sola vez tras una respuesta perdida", async ({
  page,
  context,
  network,
}) => {
  const rows = await admin()
    .from("session_exercises")
    .select("id,exercise_id")
    .eq("program_session_id", sessionId)
    .order("position");
  expect(rows.error).toBeNull();
  const group = crypto.randomUUID();
  expect(
    (
      await admin()
        .from("session_exercises")
        .update({ sets: 2, superset_id: group, superset_rest_seconds: 45 })
        .eq("program_session_id", sessionId)
    ).error,
  ).toBeNull();
  expect(
    (await admin().from("session_exercises").update({ sets: 1 }).eq("id", rows.data![1].id)).error,
  ).toBeNull();
  await seedWorkout({
    studentId: owner,
    exerciseId: rows.data![0].exercise_id,
    exerciseName: "Sentadilla",
    daysAgo: 1,
  });
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  const card = page.getByRole("region", { name: "Entrenamientos sin conexión" });
  await card.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("Disponible sin conexión");
  await page.close();
  network.offline = true;
  let offline = await context.newPage();
  await offline.goto("/week");
  await expect(
    offline.getByRole("heading", { name: "Entrena sin conexión", exact: true }),
  ).toBeVisible();
  await offline.getByRole("button", { name: "Ver sesión A", exact: true }).click();
  await offline.getByRole("button", { name: "Empezar rutina descargada", exact: true }).click();
  let squat = offline.getByRole("region", { name: "Sentadilla", exact: true });
  await squat.getByRole("textbox", { name: "KG serie 1", exact: true }).fill("70");
  await squat.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
  await squat.getByRole("button", { name: "Completar serie 1", exact: true }).click();
  await expect(offline.getByRole("timer")).toHaveCount(0);
  const press = offline.getByRole("region", { name: "Press de banca", exact: true });
  await press.getByRole("textbox", { name: "KG serie 1", exact: true }).fill("40");
  await press.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
  await press.getByRole("button", { name: "Completar serie 1", exact: true }).click();
  await expect(offline.getByRole("timer")).toBeVisible();
  const before = await offline.evaluate(
    (uid) =>
      JSON.parse(localStorage.getItem(`is:native-training:v1:${uid}`)!).active.draft.rest.endsAt,
    owner,
  );
  const url = offline.url();
  await offline.close();
  offline = await context.newPage();
  await offline.goto(url);
  await expect(offline.getByRole("timer")).toBeVisible();
  expect(
    await offline.evaluate(
      (uid) =>
        JSON.parse(localStorage.getItem(`is:native-training:v1:${uid}`)!).active.draft.rest.endsAt,
      owner,
    ),
  ).toBe(before);
  await offline.getByRole("button", { name: "Ir a Sentadilla", exact: true }).click();
  squat = offline.getByRole("region", { name: "Sentadilla", exact: true });
  await squat.getByRole("button", { name: "Detalles de Sentadilla", exact: true }).click();
  await expect(squat.getByRole("region", { name: "Historial descargado" })).toContainText("60 kg");
  await expect(offline.getByRole("timer")).toBeVisible();
  await squat.getByRole("textbox", { name: "KG serie 2", exact: true }).fill("72.5");
  await squat.getByRole("textbox", { name: "REPS serie 2", exact: true }).fill("8");
  await squat.getByRole("button", { name: "Completar serie 2", exact: true }).click();
  await offline.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  await expect(offline.getByRole("dialog")).toContainText("3 series realizadas");
  await offline.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  const pending = offline.getByRole("region", { name: "Registro tipado en este dispositivo" });
  await expect(pending).toContainText("pendiente de enviar");
  expect((await admin().from("workouts").select("id").eq("student_id", owner)).data).toHaveLength(
    1,
  );
  const frozen = await offline.evaluate(
    (uid) => JSON.parse(localStorage.getItem(`is:native-sync:v1:${uid}`)!).entries[0].payload,
    owner,
  );
  await offline.close();
  offline = await context.newPage();
  await offline.goto("/offline");
  expect(
    await offline.evaluate(
      (uid) => JSON.parse(localStorage.getItem(`is:native-sync:v1:${uid}`)!).entries[0].payload,
      owner,
    ),
  ).toEqual(frozen);
  network.offline = false;
  network.lostResponses.add("/api/workouts/training-sync");
  network.stopAfterLoss.add("/api/workouts/training-sync");
  const resumePending = offline.getByRole("region", {
    name: "Registro tipado en este dispositivo",
  });
  await resumePending.getByRole("button", { name: "Reintentar envío" }).click();
  await expect
    .poll(() =>
      network.apiEvents.some(
        (e) => e.path === "/api/workouts/training-sync" && e.outcome === "lost 200",
      ),
    )
    .toBe(true);
  await expect(resumePending).not.toContainText("Guardado en tu cuenta");
  await expect(resumePending.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
  expect(
    await offline.evaluate(
      (uid) => JSON.parse(localStorage.getItem(`is:native-sync:v1:${uid}`)!).entries[0].payload,
      owner,
    ),
  ).toEqual(frozen);
  network.blocked.delete("/api/workouts/training-sync");
  await offline.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(resumePending).toContainText("Guardado en tu cuenta");
  const saved = await admin().from("workouts").select("id").eq("student_id", owner);
  expect(saved.data).toHaveLength(2);
  expect(saved.data!.filter((w) => w.id === frozen.id)).toHaveLength(1);
  expect(
    (await admin().from("workout_sets").select("id").eq("workout_id", frozen.id)).data,
  ).toHaveLength(3);
});

test("rutina personal tipada y sesión libre sin programa conservan dos cierres offline y sus métricas reales", async ({
  page,
  context,
  network,
}) => {
  expect((await admin().from("programs").delete().eq("student_id", owner)).error).toBeNull();
  const eid = crypto.randomUUID(),
    rid = crypto.randomUUID();
  expect(
    (
      await admin().from("exercises").insert({
        id: eid,
        coach_id: owner,
        name: "Sostén con carga",
        muscle_group: "Core",
        record_type: "weight_duration",
      })
    ).error,
  ).toBeNull();
  const auth = await page.request.post("/api/mobile/v1/auth/login", {
    data: { email: COACH.email, password: COACH.password },
  });
  expect(auth.status()).toBe(200);
  const created = await page.request.post("/api/mobile/v1/training-library/mutations", {
    headers: { Authorization: `Bearer ${(await auth.json()).accessToken}` },
    data: {
      version: 2,
      requestId: crypto.randomUUID(),
      targetId: rid,
      expectedRevision: 0,
      operation: "routine_create",
      data: {
        name: "Tiempo personal",
        folderId: null,
        items: [
          {
            id: crypto.randomUUID(),
            exerciseId: eid,
            prescribed: {
              recordType: "weight_duration",
              sets: 1,
              target: {
                repsMin: null,
                repsMax: null,
                targetWeightKg: 12,
                targetDurationSeconds: 45,
                targetDistanceMeters: null,
              },
              series: null,
            },
            note: "Controlado",
            restSeconds: 30,
            supersetId: null,
            supersetRestSeconds: null,
          },
        ],
      },
    },
  });
  expect(created.status()).toBe(200);
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  const card = page.getByRole("region", { name: "Entrenamientos sin conexión" });
  await card.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("Disponible sin conexión");
  await page.close();
  network.offline = true;
  const offline = await context.newPage();
  await offline.goto("/offline");
  await offline.getByRole("button", { name: "Ver rutina Tiempo personal", exact: true }).click();
  await expect(offline.getByRole("dialog")).toContainText("45 s");
  await offline.getByRole("button", { name: "Empezar rutina descargada", exact: true }).click();
  let region = offline.getByRole("region", { name: "Sostén con carga", exact: true });
  await expect(region.getByRole("textbox", { name: "KG serie 1", exact: true })).toHaveValue("12");
  await expect(region.getByRole("textbox", { name: "SEGUNDOS serie 1", exact: true })).toHaveValue(
    "",
  );
  await region.getByRole("textbox", { name: "SEGUNDOS serie 1", exact: true }).fill("45");
  await region.getByRole("button", { name: "Completar serie 1", exact: true }).click();
  await offline.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  await offline.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  await offline.getByRole("button", { name: "Empezar entrenamiento libre", exact: true }).click();
  await offline.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  await offline
    .getByRole("textbox", { name: "Buscar ejercicio descargado" })
    .fill("Sostén con carga");
  await offline.getByRole("checkbox", { name: /Sostén con carga/ }).check();
  await offline.getByRole("button", { name: "Agregar selección (1)", exact: true }).click();
  region = offline.getByRole("region", { name: "Sostén con carga", exact: true });
  await region.getByRole("textbox", { name: "KG serie 1", exact: true }).fill("9");
  await region.getByRole("textbox", { name: "SEGUNDOS serie 1", exact: true }).fill("30");
  await region.getByRole("button", { name: "Completar serie 1", exact: true }).click();
  await offline.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  await offline.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  await expect(
    offline.getByText("Guardado en este dispositivo · pendiente de enviar", { exact: true }),
  ).toHaveCount(2);
  expect((await admin().from("workouts").select("id").eq("student_id", owner)).data).toHaveLength(
    0,
  );
  network.offline = false;
  await offline.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(offline.getByText("Guardado en tu cuenta", { exact: true })).toHaveCount(2);
  const results = await admin()
    .from("workouts")
    .select("id,source_kind,program_id")
    .eq("student_id", owner);
  expect(results.error).toBeNull();
  expect(results.data!.map((r) => r.source_kind).sort()).toEqual(["free", "personal"]);
  expect(results.data!.every((r) => r.program_id === null)).toBe(true);
  const sets = await admin()
    .from("workout_sets")
    .select("record_type,weight_kg,reps,duration_seconds,distance_meters")
    .eq("student_id", owner)
    .order("weight_kg");
  expect(sets.error).toBeNull();
  expect(sets.data).toEqual([
    {
      record_type: "weight_duration",
      weight_kg: 9,
      reps: null,
      duration_seconds: 30,
      distance_meters: null,
    },
    {
      record_type: "weight_duration",
      weight_kg: 12,
      reps: null,
      duration_seconds: 45,
      distance_meters: null,
    },
  ]);
});

test("reinicia el navegador completo y conserva interfaz, registro y cola sin conexión", async ({
  playwright,
  browserName,
  network,
}) => {
  const profile = await mkdtemp(join(tmpdir(), `iron-offline-${browserName}-`));
  const launch = () =>
    playwright[browserName].launchPersistentContext(profile, {
      headless: true,
      baseURL: network.url,
      viewport: { width: 360, height: 800 },
      locale: "es-CL",
      timezoneId: "America/Santiago",
    });
  let browser: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    browser = await launch();
    let page = await browser.newPage();
    await login(page, COACH.email, COACH.password);
    await page.goto("/week");
    const card = page.getByRole("region", { name: "Entrenamientos sin conexión" });
    await card.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
    await expect(card.getByRole("status")).toContainText("Disponible sin conexión");
    await browser.close();
    network.offline = true;
    browser = await launch();
    page = await browser.newPage();
    await page.goto("/offline");
    await expect(
      page.getByRole("heading", { name: "Entrena sin conexión", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ver sesión A", exact: true }).click();
    await page.getByRole("button", { name: "Empezar rutina descargada", exact: true }).click();
    const row = page.getByRole("region", { name: "Sentadilla", exact: true });
    await row.getByRole("textbox", { name: "KG serie 1", exact: true }).fill("65");
    await row.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("9");
    await row.getByRole("button", { name: "Completar serie 1", exact: true }).click();
    const url = page.url();
    await browser.close();
    browser = await launch();
    page = await browser.newPage();
    await page.goto(url);
    await expect(
      page
        .getByRole("region", { name: "Sentadilla", exact: true })
        .getByRole("textbox", { name: "KG serie 1", exact: true }),
    ).toHaveValue("65");
    await page.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
    await expect(
      page.getByText("Guardado en este dispositivo · pendiente de enviar", { exact: true }),
    ).toBeVisible();
    await browser.close();
    browser = await launch();
    page = await browser.newPage();
    await page.goto("/offline");
    await expect(
      page.getByText("Guardado en este dispositivo · pendiente de enviar", { exact: true }),
    ).toBeVisible();
    network.offline = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText("Guardado en tu cuenta", { exact: true })).toBeVisible();
    const saved = await admin().from("workouts").select("id").eq("student_id", owner);
    expect(saved.data).toHaveLength(1);
    expect(
      (
        await admin()
          .from("workout_sets")
          .select("weight_kg,reps")
          .eq("workout_id", saved.data![0].id)
      ).data,
    ).toEqual([{ weight_kg: 65, reps: 9 }]);
  } finally {
    await browser?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

for (const theme of ["light", "dark"] as const)
  test(`shell público y vista previa legibles a360px en ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript((theme) => localStorage.setItem("is:theme:v1", theme), theme);
    await login(page, COACH.email, COACH.password);
    await page.goto("/week");
    const card = page.getByRole("region", { name: "Entrenamientos sin conexión" });
    await card.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
    await expect(card.getByRole("status")).toContainText("Disponible sin conexión");
    await card
      .getByRole("button", { name: "Abrir entrenamientos descargados", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Entrena sin conexión", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`offline-home-${theme}-360.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Ver sesión A", exact: true }).click();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`offline-preview-${theme}-360.png`),
      fullPage: true,
    });
  });

test("sesión expirada conserva el cierre público y lo confirma después de volver a entrar", async ({
  page,
  context,
}) => {
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  const card = page.getByRole("region", { name: "Entrenamientos sin conexión" });
  await card.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("Disponible sin conexión");
  await card.getByRole("button", { name: "Abrir entrenamientos descargados", exact: true }).click();
  await page.getByRole("button", { name: "Ver sesión A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar rutina descargada", exact: true }).click();
  const row = page.getByRole("region", { name: "Sentadilla", exact: true });
  await row.getByRole("textbox", { name: "KG serie 1", exact: true }).fill("55");
  await row.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
  await row.getByRole("button", { name: "Completar serie 1", exact: true }).click();
  await context.clearCookies();
  await page.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  const pending = page.getByRole("region", { name: "Registro tipado en este dispositivo" });
  await expect(pending.getByRole("alert")).toContainText("Vuelve a iniciar sesión");
  const frozen = await page.evaluate(
    (uid) => JSON.parse(localStorage.getItem(`is:native-sync:v1:${uid}`)!).entries[0].payload,
    owner,
  );
  expect((await admin().from("workouts").select("id").eq("student_id", owner)).data).toHaveLength(
    0,
  );
  await login(page, COACH.email, COACH.password);
  await page.goto("/offline");
  await expect(page.getByText("Guardado en tu cuenta", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      (uid) => JSON.parse(localStorage.getItem(`is:native-sync:v1:${uid}`)!).entries[0].payload,
      owner,
    ),
  ).toEqual(frozen);
  expect((await admin().from("workouts").select("id").eq("student_id", owner)).data).toEqual([
    { id: frozen.id },
  ]);
});
