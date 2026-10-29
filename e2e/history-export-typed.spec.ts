import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { admin, resetAll, seedCoach, createUser, COACH } from "./support/db";
import { login } from "./support/ui";
import type { Database } from "../src/types/database";
import { isIsolatedTestBackend } from "../src/lib/testing/isolated-backend";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { typedRecordingPayloadSchema } from "../src/lib/mobile/typed-recording-contracts";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
const account = (i: number) => ({
  email: `export-${i}@iron-strength.e2e.test`,
  password: "Export-local-only-2026!",
  name: `Export Alumno ${i}`,
});
let ownerIds: string[] = [],
  workoutIds: string[] = [],
  exerciseIds: string[] = [];
async function client(email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  if (!isIsolatedTestBackend(url, process.env)) throw Error("isolated_backend_required");
  const db = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    session = await db.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return db;
}
test.beforeEach(async () => {
  await resetAll();
  const coachId = await seedCoach();
  ownerIds = [coachId];
  workoutIds = [];
  exerciseIds = [];
  for (let i = 0; i < 3; i++)
    ownerIds.push(await createUser(admin(), { ...account(i), role: "student", coachId }));
  for (const [i, m] of trainingMetricCases.entries()) {
    const id = randomUUID();
    expect(
      (
        await admin()
          .from("exercises")
          .insert({
            id,
            coach_id: coachId,
            name: `Export tipo ${i}`,
            muscle_group: "Core",
            record_type: m.recordType,
          })
      ).error,
    ).toBeNull();
    exerciseIds.push(id);
  }
  for (let owner = 0; owner < 4; owner++) {
    const credentials = owner === 0 ? COACH : account(owner - 1),
      db = await client(credentials.email, credentials.password),
      p = typedRecordingFixture();
    if (p.source !== "free") throw Error("fixture");
    p.id = randomUUID();
    p.workout.id = p.id;
    p.workout.title = "Exportación completa";
    p.workout.startedAt = new Date().toISOString();
    p.workout.finishedAt = p.workout.startedAt;
    p.workout.perceivedEffort = 8;
    p.workout.note = "=SUM(1;2)";
    p.structure.exercises = Array.from({ length: 10 }, (_, i) => {
      const m = trainingMetricCases[i % 9];
      return {
        id: randomUUID(),
        exerciseId: exerciseIds[i % 9],
        prescribedExerciseId: null,
        note: null,
        restSeconds: 60,
        supersetId: null,
        supersetRestSeconds: null,
        prescribed: {
          recordType: m.recordType,
          sets: 2,
          series: null,
          target: {
            repsMin: m.reps === null ? null : 8,
            repsMax: m.reps === null ? null : 12,
            targetWeightKg: m.weightKg,
            targetDurationSeconds: m.durationSeconds,
            targetDistanceMeters: m.distanceMeters,
          },
        },
      };
    });
    p.workout.exerciseNotes = p.structure.exercises.map((r, i) => ({
      sessionExerciseId: r.id,
      note: i === 9 ? "Nota sin series" : '=nota "propia"\nsegunda línea',
    }));
    p.workout.sets = trainingMetricCases.map((m, i) => ({
      exerciseId: exerciseIds[i],
      position: i,
      setNumber: 1,
      metrics: m,
      setType: i === 0 ? "drop" : i === 1 ? "warmup" : i === 2 ? "failure" : "working",
      effort: i === 1 ? null : 8.5,
    }));
    const result = await db.rpc("save_typed_workout_recording", {
      p_recording: typedRecordingPayloadSchema.parse(p),
    });
    expect(result.error).toBeNull();
    workoutIds.push(p.id);
  }
});
test.afterAll(async () => {
  await resetAll();
});
/** Independent test reader: handles quoted separators, quotes and multi-line notes. */
function readCsv(text: string) {
  const rows: string[][] = [],
    row: string[] = [];
  let field = "",
    quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === ";") {
      row.push(field);
      field = "";
    } else if (!quoted && c === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push([...row]);
      row.length = 0;
      field = "";
      i++;
    } else field += c;
  }
  if (row.length || field) {
    row.push(field);
    rows.push([...row]);
  }
  expect(quoted).toBe(false);
  return rows;
}
test("cuatro cuentas exportan nueve contratos y el coach conserva métricas y notas de sus tres alumnos", async ({
  browser,
}) => {
  const own: string[] = [];
  for (let owner = 0; owner < 4; owner++) {
    const page = await browser.newPage(),
      credentials = owner === 0 ? COACH : account(owner - 1);
    await login(page, credentials.email, credentials.password);
    const reply = await page.request.get("/export/history");
    expect(reply.status()).toBe(200);
    expect(reply.headers()["cache-control"]).toBe("no-store");
    expect(reply.headers()["content-disposition"]).toContain("attachment; filename=");
    const text = await reply.text();
    own.push(text);
    const rows = readCsv(text);
    expect(rows).toHaveLength(11);
    expect(rows.every((r) => r.length === 21)).toBe(true);
    expect(rows[0].slice(12)).toEqual([
      "Tipo de registro",
      "Duración (s)",
      "Distancia (m)",
      "Esfuerzo de serie (1–10)",
      "Nota del ejercicio",
      "Fila",
      "Entrenamiento ID",
      "Ejercicio ID",
      "Ejercicio prescrito ID",
    ]);
    for (const [i, m] of trainingMetricCases.entries()) {
      const r = rows[i + 1],
        number = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
      expect(r[5]).toBe(number(m.weightKg));
      expect(r[6]).toBe(number(m.reps));
      expect(r[7]).toBe("");
      expect(r[9]).toBe("'=SUM(1;2)");
      expect(r[12]).toBe(m.recordType ?? "");
      expect(r[13]).toBe(number(m.durationSeconds));
      expect(r[14]).toBe(number(m.distanceMeters));
      expect(r[15]).toBe(i === 1 ? "" : "8,5");
      expect(r[16]).toBe('\'=nota "propia"\nsegunda línea');
      expect(r[17]).toBe("Serie");
      expect(r[18]).toBe(workoutIds[owner]);
      expect(r[19]).toBe(exerciseIds[i]);
    }
    expect(rows[10].slice(3, 7)).toEqual(["", "", "", ""]);
    expect(rows[10][16]).toBe("Nota sin series");
    expect(rows[10][17]).toBe("Nota del ejercicio");
    await page.close();
  }
  const coach = await browser.newPage();
  await login(coach, COACH.email, COACH.password);
  for (let i = 0; i < 3; i++) {
    const response = await coach.request.get("/export/history?alumno=" + ownerIds[i + 1]);
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe(own[i + 1]);
  }
  await coach.close();
});
test("un alumno no exporta otro perfil y una cuenta inactiva no descarga datos", async ({
  page,
}) => {
  await login(page, account(0).email, account(0).password);
  for (const id of [ownerIds[0], ownerIds[2], randomUUID(), "bad"]) {
    const reply = await page.request.get("/export/history?alumno=" + id);
    expect(reply.status()).toBe(404);
    expect(reply.headers()["content-disposition"]).toBeUndefined();
    expect(reply.headers()["cache-control"]).toBe("no-store");
  }
  expect(
    (await admin().from("profiles").update({ is_active: false }).eq("id", ownerIds[1])).error,
  ).toBeNull();
  const reply = await page.request.get("/export/history");
  expect(reply.status()).toBe(401);
  expect(reply.headers()["content-disposition"]).toBeUndefined();
  expect(reply.headers()["cache-control"]).toBe("no-store");
});

test("descarga más de1000registros por HTTP y un límite excedido no produce un archivo parcial", async ({
  page,
}) => {
  const ids = Array.from({ length: 1001 }, () => randomUUID());
  for (let from = 0; from < ids.length; from += 250) {
    const batch = ids.slice(from, from + 250);
    expect(
      (
        await admin()
          .from("workouts")
          .insert(
            batch.map((id) => ({
              id,
              student_id: ownerIds[1],
              started_at: "2026-10-01T15:00:00Z",
              finished_at: "2026-10-01T16:00:00Z",
              duration_seconds: 3600,
            })),
          )
      ).error,
    ).toBeNull();
    expect(
      (
        await admin()
          .from("workout_sets")
          .insert(
            batch.map((id) => ({
              workout_id: id,
              student_id: ownerIds[1],
              exercise_id: exerciseIds[0],
              exercise_name: "Histórico completo",
              position: 0,
              set_number: 1,
              weight_kg: 30,
              reps: 8,
            })),
          )
      ).error,
    ).toBeNull();
  }
  await login(page, account(0).email, account(0).password);
  const complete = await page.request.get("/export/history");
  expect(complete.status()).toBe(200);
  const rows = readCsv(await complete.text());
  expect(rows).toHaveLength(1012);
  expect(new Set(rows.slice(1).map((r) => r[18]))).toEqual(new Set([workoutIds[1], ...ids]));
  for (let from = 0; from < 8999; from += 500) {
    const quantity = Math.min(500, 8999 - from);
    expect(
      (
        await admin()
          .from("workouts")
          .insert(
            Array.from({ length: quantity }, () => ({
              id: randomUUID(),
              student_id: ownerIds[1],
              started_at: "2026-10-01T15:00:00Z",
              finished_at: "2026-10-01T16:00:00Z",
              duration_seconds: 3600,
            })),
          )
      ).error,
    ).toBeNull();
  }
  const count = await admin()
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", ownerIds[1]);
  expect(count.error).toBeNull();
  expect(count.count).toBe(10001);
  const blocked = await page.request.get("/export/history");
  expect(blocked.status()).toBe(409);
  expect(blocked.headers()["content-disposition"]).toBeUndefined();
  expect(blocked.headers()["cache-control"]).toBe("no-store");
  expect(blocked.headers()["content-type"]).toContain("text/plain");
  const message = await blocked.text();
  expect(message).toContain("límite");
  expect(message).toContain("archivo parcial");
  expect(message).not.toContain("0A000");
  await page.goto("/week/summary");
  await expect(
    page.getByRole("alert").filter({ hasText: "No pudimos cargar el resumen" }),
  ).toContainText("límite");
  await expect(page.getByRole("link", { name: "Reintentar", exact: true })).toBeVisible();
  await expect(
    page.getByText("Todavía no registras entrenamientos esta semana.", { exact: true }),
  ).toHaveCount(0);
});

test("resumen semanal real para cuatro cuentas conserva tiempo, distancia y series sin repeticiones ficticias", async ({
  browser,
}, testInfo) => {
  for (let owner = 0; owner < 4; owner++) {
    const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
        colorScheme: owner % 2 ? "dark" : "light",
        reducedMotion: "reduce",
      }),
      page = await context.newPage(),
      credentials = owner === 0 ? COACH : account(owner - 1);
    await login(page, credentials.email, credentials.password);
    await page.goto("/week/summary");
    const current = page.getByRole("region", { name: "Esta semana", exact: true });
    await expect(page.getByRole("region", { name: "Semana anterior", exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Semana anterior", exact: true })
        .getByText("Series de trabajo", { exact: true }),
    ).toHaveCount(0);
    await expect(current.getByText("Series de trabajo", { exact: true })).toBeVisible();
    await expect(current.getByText("Tiempo registrado", { exact: true })).toBeVisible();
    await expect(current.getByText("Distancia registrada", { exact: true })).toBeVisible();
    await expect(current.getByText("420 s", { exact: true })).toBeVisible();
    await expect(current.getByText("1.030,5 m", { exact: true })).toBeVisible();
    await expect(current.getByText("320 kg", { exact: true })).toBeVisible();
    await expect(
      current.getByText("Además, 24 repeticiones con tu peso corporal.", { exact: true }),
    ).toBeVisible();
    await current.getByText("Ver entrenamientos", { exact: true }).click();
    const evidence = current.getByRole("link", {
      name: /^Ver entrenamiento del /,
    });
    await expect(evidence).toHaveCount(1);
    await expect(evidence).toHaveAttribute("href", `/history/${workoutIds[owner]}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    const box = await evidence.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
    await page.screenshot({
      path: `../work/t219-week-${testInfo.project.name}-${owner}.png`,
      fullPage: true,
    });
    await evidence.click();
    await expect(page).toHaveURL(new RegExp("/history/" + workoutIds[owner] + "$"));
    await expect(page.getByText("Nota sin series", { exact: true })).toBeVisible();
    await context.close();
  }
});

test("API tipada confirma un récord de tiempo y su logro una sola vez", async ({ request }) => {
  const db = await client(account(0).email, account(0).password),
    session = await db.auth.getSession(),
    token = session.data.session!.access_token,
    p = typedRecordingFixture();
  if (p.source !== "free") throw Error("fixture");
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = new Date().toISOString();
  p.workout.finishedAt = p.workout.startedAt;
  p.structure.exercises = [
    {
      ...p.structure.exercises[0],
      id: randomUUID(),
      exerciseId: exerciseIds[5],
      supersetId: null,
      supersetRestSeconds: null,
      prescribed: {
        recordType: "duration",
        sets: 2,
        series: null,
        target: {
          repsMin: null,
          repsMax: null,
          targetWeightKg: null,
          targetDurationSeconds: 60,
          targetDistanceMeters: null,
        },
      },
    },
  ];
  p.workout.exerciseNotes = [
    { sessionExerciseId: p.structure.exercises[0].id, note: "Mejor tiempo" },
  ];
  p.workout.sets = [
    {
      exerciseId: exerciseIds[5],
      position: 0,
      setNumber: 1,
      metrics: {
        recordType: "duration",
        weightKg: null,
        reps: null,
        durationSeconds: 90,
        distanceMeters: null,
      },
      setType: "working",
      effort: 8,
    },
  ];
  const data = { version: 3, payload: typedRecordingPayloadSchema.parse(p) },
    headers = { Authorization: `Bearer ${token}` };
  const first = await request.post("/api/mobile/v1/typed-recordings", { headers, data });
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({
    version: 3,
    ok: true,
    status: "created",
    workoutId: p.id,
  });
  const again = await request.post("/api/mobile/v1/typed-recordings", { headers, data });
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({
    version: 3,
    ok: true,
    status: "duplicate",
    workoutId: p.id,
  });
  const earned = await admin()
    .from("achievements")
    .select("kind")
    .eq("student_id", ownerIds[1])
    .eq("kind", "first_record");
  expect(earned.error).toBeNull();
  expect(earned.data).toEqual([{ kind: "first_record" }]);
  const saved = await admin()
    .from("workout_sets")
    .select("record_type,reps,weight_kg,duration_seconds")
    .eq("workout_id", p.id);
  expect(saved.error).toBeNull();
  expect(saved.data).toEqual([
    { record_type: "duration", reps: null, weight_kg: null, duration_seconds: 90 },
  ]);
});
