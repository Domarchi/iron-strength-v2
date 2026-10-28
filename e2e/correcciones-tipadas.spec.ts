import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
import { workoutCorrectionSnapshotSchema } from "../src/lib/mobile/workout-correction-contracts";
let coachId: string, studentId: string, ids: string[];
const student = {
  email: "web-types@iron-strength.e2e.test",
  password: "Web-types-local-only-2026!",
};
test.beforeAll(async () => {
  await resetAll();
  coachId = await seedCoach();
  studentId = await createUser(admin(), {
    role: "student",
    name: "Alumno de prueba",
    ...student,
    coachId,
  });
  const exercises = await admin()
    .from("exercises")
    .insert(
      trainingMetricCases.map((m, i) => ({
        name: `T218 web tipo ${i}`,
        muscle_group: "Core" as const,
        record_type: m.recordType,
      })),
    )
    .select("id,name");
  if (exercises.error) throw exercises.error;
  ids = trainingMetricCases.map(
    (_, i) => exercises.data.find((row) => row.name === `T218 web tipo ${i}`)!.id,
  );
});
test.afterAll(async () => {
  await resetAll();
  if (ids?.length) {
    const deleted = await admin().from("exercises").delete().in("id", ids);
    if (deleted.error) throw deleted.error;
  }
});
function payload() {
  const p = typedRecordingFixture("free");
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = new Date(Date.now() - 600000).toISOString();
  p.workout.finishedAt = new Date().toISOString();
  p.workout.durationSeconds = 600;
  p.structure.exercises = [...trainingMetricCases, trainingMetricCases[0]].map((m, i) => ({
    id: randomUUID(),
    exerciseId: ids[i === 9 ? 0 : i],
    prescribedExerciseId: null,
    note: `Indicación ${i}`,
    restSeconds: 90,
    supersetId: null,
    supersetRestSeconds: null,
    prescribed: {
      recordType: m.recordType,
      sets: 1,
      target: {
        repsMin: m.reps === null ? null : 8,
        repsMax: m.reps === null ? null : 12,
        targetWeightKg: m.weightKg,
        targetDurationSeconds: m.durationSeconds,
        targetDistanceMeters: m.distanceMeters,
      },
      series: null,
    },
  }));
  p.workout.exerciseNotes = p.structure.exercises.map((row) => ({
    sessionExerciseId: row.id,
    note: null,
  }));
  p.workout.sets = trainingMetricCases.map((metrics, position) => ({
    exerciseId: ids[position],
    position,
    setNumber: 1,
    metrics,
    setType: "working",
    effort: 8,
  }));
  return p;
}
for (const [role, theme] of [
  ["student", "light"],
  ["coach", "dark"],
] as const) {
  test(`web conserva nueve contratos, notas y clases · ${role} ${theme}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const actor =
      role === "coach"
        ? { id: coachId, email: COACH.email, password: COACH.password }
        : { id: studentId, ...student };
    const session = await request.post("/api/mobile/v1/auth/login", {
      data: { email: actor.email, password: actor.password },
    });
    expect(session.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await session.json()).accessToken}` },
      p = payload();
    const created = await request.post("/api/mobile/v1/typed-recordings", {
      headers,
      data: { version: 3, payload: p },
    });
    expect(created.status()).toBe(200);
    const read = async () => {
      const response = await request.get(`/api/mobile/v1/workout-corrections/${p.id}`, { headers });
      expect(response.status()).toBe(200);
      return workoutCorrectionSnapshotSchema.parse(await response.json());
    };
    const before = await read();
    expect(before.userId).toBe(actor.id);
    await login(page, actor.email, actor.password);
    await page.goto(`/history/${p.id}/edit`);
    const text = (value: number) => String(value).replace(".", ",");
    for (const [i, m] of trainingMetricCases.entries()) {
      const name = `T218 web tipo ${i}`;
      const fields = [
        ["weightKg", `Peso de la serie 1 de ${name} (kg)`],
        ["reps", `Repeticiones de la serie 1 de ${name}`],
        ["durationSeconds", `Segundos de la serie 1 de ${name}`],
        ["distanceMeters", `Metros de la serie 1 de ${name}`],
      ] as const;
      for (const [dimension, label] of fields) {
        const value = m[dimension];
        if (value === null) await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
        else await expect(page.getByLabel(label, { exact: true })).toHaveValue(text(value));
      }
    }
    await page.getByLabel("Segundos de la serie 1 de T218 web tipo 5", { exact: true }).fill("95");
    await page
      .getByLabel("Tipo de serie 1 de T218 web tipo 5", { exact: true })
      .selectOption("warmup");
    await page.getByLabel("Metros de la serie 1 de T218 web tipo 8", { exact: true }).fill("45,5");
    await page.getByLabel("Esfuerzo de la serie 1 de T218 web tipo 8", { exact: true }).fill("7,5");
    await page.getByLabel("Nota del ejercicio 10", { exact: true }).fill("Nota de fila sin series");
    await page
      .getByLabel("Nota del entrenamiento", { exact: true })
      .fill("Controlado desde la web");
    await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
      "Guardado en este dispositivo",
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`typed-correction-${theme}-360.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
    await expect(page.getByText("Nota de fila sin series", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
    await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
    const after = await read();
    expect(after.workout.revision).toBeGreaterThan(before.workout.revision);
    expect(after.workout.structure).toEqual(before.workout.structure);
    expect(after.workout.note).toBe("Controlado desde la web");
    expect(
      after.workout.exerciseNotes?.find((n) => n.sessionExerciseId === p.structure.exercises[9].id)
        ?.note,
    ).toBe("Nota de fila sin series");
    for (const [i, m] of trainingMetricCases.entries()) {
      const row = after.workout.sets[i];
      expect(row.metrics).toEqual({
        ...m,
        ...(i === 5 ? { durationSeconds: 95 } : {}),
        ...(i === 8 ? { distanceMeters: 45.5 } : {}),
      });
      expect(row.setType).toBe(i === 5 ? "warmup" : "working");
      expect(row.isWarmup).toBe(i === 5);
      expect(row.effort).toBe(i === 8 ? 7.5 : 8);
    }
    // The review must expose the local note even when the exercise has no recorded sets.
    await page.goto(`/history/${p.id}/edit`);
    await page
      .getByLabel("Nota del ejercicio 10", { exact: true })
      .fill("Propuesta local sin series");
    await page.getByLabel("Esfuerzo del entrenamiento (1 a 10)", { exact: true }).fill("7");
    await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
    await expect(page.getByText("Propuesta local sin series", { exact: true })).toBeVisible();
    const remote = await admin()
      .from("workouts")
      .update({
        perceived_effort: 9,
        exercise_notes: after.workout.exerciseNotes!.map((note, i) => ({
          ...note,
          note: i === 9 ? "Nota remota sin series" : note.note,
        })),
      })
      .eq("id", p.id)
      .eq("student_id", actor.id);
    if (remote.error) throw remote.error;
    await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
    await page.getByRole("button", { name: "Comparar con versión actual", exact: true }).click();
    await expect(page.getByText("Esfuerzo actual: 9", { exact: true })).toBeVisible();
    await expect(page.getByText("Esfuerzo propuesto: 7", { exact: true })).toBeVisible();
    await expect(page.getByText("Actual: Nota remota sin series", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Propuesta: Propuesta local sin series", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Aceptar versión revisada", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
    await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
    const resolved = await read();
    expect(resolved.workout.perceivedEffort).toBe(7);
    expect(resolved.workout.exerciseNotes?.[9].note).toBe("Propuesta local sin series");
    expect(resolved.workout.sets).toEqual(after.workout.sets);
    await page.getByRole("button", { name: "Ver resultado", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/history/${p.id}$`));
    await expect(page.getByRole("heading", { name: "Superior", exact: true })).toBeVisible();
    await expect(page.getByText("Propuesta local sin series", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "T218 web tipo 8", exact: true }).getByText(/45,5 m/),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "T218 web tipo 5", exact: true }).getByRole("listitem"),
    ).toContainText("95 s");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`typed-result-${theme}-360.png`),
      fullPage: true,
    });
  });
}
