import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import { admin, COACH, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";
import { RECORD_TYPES, type RecordType } from "../src/domain/training-metrics";
import {
  defaultPrescriptionInput,
  parsePrescriptionInput,
  prescriptionInputFields,
} from "../src/domain/prescription-input";
import { readStoredTrainingPrescription } from "../src/domain/stored-prescription";
import { saveSessionPrescriptions } from "../src/lib/data/programs";
import { isIsolatedTestBackend } from "../src/lib/testing/isolated-backend";
test.setTimeout(150_000);
async function fixture(kinds: RecordType[] = [null, ...RECORD_TYPES]) {
  await resetAll();
  const coachId = await seedCoach(),
    programId = crypto.randomUUID(),
    sessionId = crypto.randomUUID();
  const exercises = kinds.map((recordType, i) => ({
    id: crypto.randomUUID(),
    coach_id: coachId,
    name: `Contrato ${i}`,
    muscle_group: "Core",
    record_type: recordType,
  }));
  expect((await admin().from("exercises").insert(exercises)).error).toBeNull();
  expect(
    (
      await admin()
        .from("programs")
        .insert({ id: programId, coach_id: coachId, name: "Planificación tipada", weeks_count: 4 })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin().from("program_sessions").insert({
        id: sessionId,
        program_id: programId,
        label: "A",
        week_number: 1,
        title: "Tipos reales",
      })
    ).error,
  ).toBeNull();
  const rows = kinds.map((kind, i) => ({
    id: crypto.randomUUID(),
    program_session_id: sessionId,
    exercise_id: exercises[i].id,
    position: i,
    sets: 3,
    reps_min: kind === null ? 8 : null,
    reps_max: kind === null ? 12 : null,
    target_weight_kg: null,
    typed_prescription:
      kind === null ? null : parsePrescriptionInput(defaultPrescriptionInput(kind)),
    note: "Indicación conservada",
    rest_seconds: 90,
  }));
  expect((await admin().from("session_exercises").insert(rows)).error).toBeNull();
  return { coachId, programId, sessionId, exercises, rows };
}
test("el coach prescribe los nueve contratos, detalle y alternativas y copia semanas independientes", async ({
  page,
}, info) => {
  const f = await fixture();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/programs/${f.programId}`);
  const labels = {
    repsMin: "Reps mín.",
    repsMax: "Reps máx.",
    targetWeightKg: "Peso (kg)",
    targetDurationSeconds: "Tiempo (s)",
    targetDistanceMeters: "Distancia (m)",
  };
  const expected = [];
  for (const [i, kind] of [null, ...RECORD_TYPES].entries()) {
    const input = defaultPrescriptionInput(kind),
      fields = prescriptionInputFields(kind);
    for (const field of fields) {
      const value =
        field === "repsMin"
          ? "6"
          : field === "repsMax"
            ? "10"
            : field === "targetWeightKg"
              ? kind === null
                ? "0"
                : "12,35"
              : field === "targetDurationSeconds"
                ? "45"
                : "250,5";
      input.target[field] = value;
      await page.getByLabel(`${labels[field]} de Contrato ${i}`, { exact: true }).fill(value);
    }
    for (const field of Object.keys(labels) as (keyof typeof labels)[])
      if (!fields.includes(field))
        await expect(
          page.getByLabel(`${labels[field]} de Contrato ${i}`, { exact: true }),
        ).toHaveCount(0);
    expected.push(parsePrescriptionInput(input));
  }
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.reload();
  const stored = await admin()
    .from("session_exercises")
    .select("*")
    .eq("program_session_id", f.sessionId)
    .order("position");
  expect(stored.error).toBeNull();
  expect(stored.data!.map(readStoredTrainingPrescription)).toEqual(expected);
  await page.getByLabel("Prescripción de Contrato 6", { exact: true }).selectOption("series");
  await page.getByLabel("Tiempo (s) de serie 1 de Contrato 6", { exact: true }).fill("60");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.getByText("Alternativas de Contrato 6 (0/3)", { exact: true }).click();
  await page
    .getByRole("button", { name: "Agregar alternativa de Contrato 6", exact: true })
    .click();
  await page
    .getByLabel("Alternativa 1 de Contrato 6", { exact: true })
    .selectOption(f.exercises[7].id);
  await page.getByLabel("Tiempo (s) de alternativa 1 de Contrato 6", { exact: true }).fill("30");
  await page
    .getByLabel("Distancia (m) de alternativa 1 de Contrato 6", { exact: true })
    .fill("500");
  await page
    .getByRole("button", { name: "Guardar alternativas de Contrato 6", exact: true })
    .click();
  await expect(page.getByText("Alternativas guardadas.", { exact: true })).toBeVisible();
  const before = await admin()
    .from("session_exercises")
    .select("*,session_exercise_alternatives(*)")
    .eq("program_session_id", f.sessionId)
    .order("position");
  expect(before.error).toBeNull();
  expect(
    readStoredTrainingPrescription(before.data![6]).series?.map(
      (target) => target.targetDurationSeconds,
    ),
  ).toEqual([60, 45, 45]);
  expect(
    readStoredTrainingPrescription(before.data![6].session_exercise_alternatives[0]).target,
  ).toMatchObject({
    repsMin: null,
    repsMax: null,
    targetDurationSeconds: 30,
    targetDistanceMeters: 500,
  });
  await page.getByText("Copiar semana a varias", { exact: true }).click();
  for (const week of [2, 3])
    await page.getByRole("checkbox", { name: `Semana ${week}`, exact: true }).check();
  await page.getByRole("button", { name: "Revisar copia", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar copia de semanas", exact: true }).click();
  await expect(page.getByText("Copia de semanas confirmada.", { exact: true })).toBeVisible();
  const copies = await admin()
    .from("program_sessions")
    .select("id,week_number,session_exercises(*,session_exercise_alternatives(*))")
    .eq("program_id", f.programId)
    .order("week_number");
  expect(copies.error).toBeNull();
  expect(copies.data!.map((session) => session.week_number)).toEqual([1, 2, 3]);
  for (const copy of copies.data!.slice(1)) {
    const rows = copy.session_exercises.sort((a, b) => a.position - b.position);
    expect(rows.map(readStoredTrainingPrescription)).toEqual(
      before.data!.map(readStoredTrainingPrescription),
    );
    expect(rows.every((row) => !f.rows.some((original) => original.id === row.id))).toBe(true);
    expect(readStoredTrainingPrescription(rows[6].session_exercise_alternatives[0])).toEqual(
      readStoredTrainingPrescription(before.data![6].session_exercise_alternatives[0]),
    );
  }
  await page.getByRole("button", { name: /Semana 1/ }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBe(0);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`typed-coach-${colorScheme}-360.png`),
      fullPage: true,
    });
  }
});
test("una respuesta perdida recupera la operación canónica original y no repite el commit", async ({
  page,
}) => {
  const f = await fixture(["weight_duration"]);
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/programs/${f.programId}`);
  await page.getByLabel("Peso (kg) de Contrato 0", { exact: true }).fill("20,5");
  let lost = false;
  const url = page.url();
  await page.route(url, async (route) => {
    if (!lost && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      lost = true;
      await route.fetch();
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "confirmación" })).toBeVisible();
  const pending = await page.evaluate(({ coachId, programId, sessionId }) => {
    const key = Object.keys(localStorage).find((key) =>
      key.startsWith(`is:coach-draft:v1:${coachId}:${programId}:${sessionId}:`),
    )!;
    return JSON.parse(localStorage.getItem(key)!).pending;
  }, f);
  expect(pending.operation).toBe("prescribe");
  const revision = (
    await admin().from("program_sessions").select("revision").eq("id", f.sessionId).single()
  ).data!.revision;
  await page.reload();
  await page.getByRole("button", { name: "Reintentar operación", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  expect(lost).toBe(true);
  expect(
    (await admin().from("program_sessions").select("revision").eq("id", f.sessionId).single()).data!
      .revision,
  ).toBe(revision);
  expect(
    (
      await admin()
        .from("coach_training_receipts")
        .select("request_id", { count: "exact" })
        .eq("request_id", pending.id)
    ).count,
  ).toBe(1);
  await expect(page.getByLabel("Peso (kg) de Contrato 0", { exact: true })).toHaveValue("20,5");
});
test("un guardado anterior confirmado se reconcilia con su contrato original y conserva el mismo recibo", async ({
  page,
}) => {
  const f = await fixture([null]),
    row = f.rows[0];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(isIsolatedTestBackend(url, process.env)).toBe(true);
  const coach = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await coach.auth.signInWithPassword({ email: COACH.email, password: COACH.password })).error,
  ).toBeNull();
  const revision = (
      await admin().from("program_sessions").select("revision").eq("id", f.sessionId).single()
    ).data!.revision,
    requestId = crypto.randomUUID();
  const rows = [
    {
      id: row.id,
      exerciseId: row.exercise_id,
      sets: "4",
      repsMin: "6",
      repsMax: "8",
      targetWeightKg: "20,5",
      note: "Borrador anterior",
    },
  ];
  expect(
    (
      await saveSessionPrescriptions({
        db: coach,
        sessionId: f.sessionId,
        requestId,
        expectedRevision: revision,
        rows,
      })
    ).ok,
  ).toBe(true);
  const draft = {
    version: 3,
    id: crypto.randomUUID(),
    userId: f.coachId,
    programId: f.programId,
    sessionId: f.sessionId,
    revision,
    updatedAt: new Date().toISOString(),
    edits: { [row.id]: rows[0] },
    order: null,
    orderRequest: null,
    saveRequest: { id: requestId, revision, rows },
    copyRequest: null,
  };
  await login(page, COACH.email, COACH.password);
  await page.evaluate(
    (draft) =>
      localStorage.setItem(
        `is:coach-draft:v1:${draft.userId}:${draft.programId}:${draft.sessionId}:${draft.id}`,
        JSON.stringify(draft),
      ),
    draft,
  );
  await page.goto(`/coach/programs/${f.programId}`);
  await expect(page.getByText("Borrador de una versión anterior", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar guardado anterior", exact: true }).click();
  await expect(page.getByLabel("Series de Contrato 0", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Peso (kg) de Contrato 0", { exact: true })).toHaveValue("20,5");
  expect(
    (await admin().from("routine_mutations").select("id", { count: "exact" }).eq("id", requestId))
      .count,
  ).toBe(1);
  expect(
    (
      await admin()
        .from("coach_training_receipts")
        .select("request_id", { count: "exact" })
        .eq("request_id", requestId)
    ).count,
  ).toBe(0);
});
for (const removed of ["session", "program"] as const)
  test(`recupera un intento confirmado después de eliminar ${removed} sin recrear el origen`, async ({
    page,
  }) => {
    const f = await fixture(["weight_duration"]);
    await login(page, COACH.email, COACH.password);
    await page.goto(`/coach/programs/${f.programId}`);
    await page.getByLabel("Tiempo (s) de Contrato 0", { exact: true }).fill("70");
    let lost = false;
    await page.route(page.url(), async (route) => {
      if (
        !lost &&
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        lost = true;
        await route.fetch();
        await route.abort("internetdisconnected");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Reintentar operación", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "No recibimos confirmación" }),
    ).toBeVisible();
    const frozen = await page.evaluate(() =>
      Object.entries(localStorage).filter(([key]) => key.startsWith("is:coach-draft:v1:")),
    );
    expect(frozen).toHaveLength(1);
    const original = JSON.parse(frozen[0][1]).pending;
    expect(lost).toBe(true);
    const committed = await admin()
      .from("coach_training_receipts")
      .select("request_id")
      .eq("request_id", original.id);
    expect(committed.error).toBeNull();
    expect(committed.data).toHaveLength(1);
    expect(
      (removed === "session"
        ? await admin().from("program_sessions").delete().eq("id", f.sessionId)
        : await admin().from("programs").delete().eq("id", f.programId)
      ).error,
    ).toBeNull();
    await page.reload();
    const recovery = page.getByRole("region", {
      name: "Borradores de sesiones no disponibles",
      exact: true,
    });
    await expect(recovery).toBeVisible();
    await recovery
      .getByRole("button", { name: "Verificar operación pendiente", exact: true })
      .click();
    await expect(recovery.getByRole("status")).toHaveText(
      "Operación confirmada por el servidor. La sesión de origen no está disponible.",
    );
    expect(await page.evaluate((key) => localStorage.getItem(key), frozen[0][0])).toBe(
      frozen[0][1],
    );
    const receipt = await admin()
      .from("coach_training_receipts")
      .select("request_id")
      .eq("request_id", original.id);
    expect(receipt.error).toBeNull();
    expect(receipt.data).toHaveLength(1);
    expect(
      (await admin().from("program_sessions").select("id").eq("id", f.sessionId)).data,
    ).toEqual([]);
    page.once("dialog", (dialog) => dialog.accept());
    await recovery
      .getByRole("button", { name: "Retirar borrador confirmado", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), frozen[0][0]))
      .toBeNull();
  });
