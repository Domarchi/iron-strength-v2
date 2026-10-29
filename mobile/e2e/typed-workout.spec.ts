import { recoverLegacyWeek } from "./support/week-fixture";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek, enterWeekUser, setWeekConnectivity } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
import { trainingMetricCases } from "../../src/test/fixtures/training-metrics";
import { createTypedDraft, typedContextSchema } from "../src/lib/typed-training";
import {
  typedRecordingRequestSchema,
  typedWorkoutSchema,
  type TypedRecordingPayload,
} from "../../src/lib/mobile/typed-recording-contracts";
import { trainingTotals } from "../../src/domain/training-metrics";
const userId = downloadId(1),
  workoutId = downloadId(600),
  key = `is:native-training:v1:${userId}`;
function context() {
  return typedContextSchema.parse({
    version: 3,
    origin: { kind: "free" },
    title: "Registro ampliado",
    sessionLabel: "Libre",
    exercises: trainingMetricCases.map((m, i) => ({
      sessionExerciseId: downloadId(700 + i),
      exerciseId: downloadId(800 + i),
      name: `Tipo ${i}`,
      isBodyweight: false,
      prescribed: {
        recordType: m.recordType,
        sets: 1,
        target: {
          repsMin: m.reps !== null ? 8 : null,
          repsMax: m.reps !== null ? 12 : null,
          targetWeightKg: m.weightKg,
          targetDurationSeconds: m.durationSeconds,
          targetDistanceMeters: m.distanceMeters,
        },
        series: null,
      },
      lastMetrics: null,
      note: "Indicación original",
      restSeconds: 90,
      supersetId: null,
      supersetRestSeconds: null,
      alternatives: [],
    })),
  });
}
function result(p: TypedRecordingPayload) {
  const c = context(),
    totals = trainingTotals(
      p.workout.sets.map((s) => ({ ...s.metrics, setType: s.setType, effort: s.effort })),
    );
  return typedWorkoutSchema.parse({
    version: 3,
    workout: {
      id: p.id,
      sourceKind: "free",
      title: "Registro ampliado",
      personalRoutineId: null,
      personalRoutineRevision: null,
      programName: null,
      sessionLabel: null,
      startedAt: p.workout.startedAt,
      performedOn: "2026-10-24",
      durationSeconds: p.workout.durationSeconds,
      perceivedEffort: p.workout.perceivedEffort ?? null,
      note: p.workout.note ?? null,
      structure: p.structure,
      exercises: p.structure.exercises.map((r, position) => ({
        ...r,
        position,
        name: c.exercises[position].name,
        prescribedExerciseName: null,
        athleteNote: p.workout.exerciseNotes[position].note,
        sets: p.workout.sets
          .filter((s) => s.position === position)
          .map((s) => ({
            id: downloadId(900 + position * 20 + s.setNumber),
            setNumber: s.setNumber,
            metrics: s.metrics,
            setType: s.setType,
            effort: s.effort,
          })),
      })),
      summary: {
        workingSets: totals.workingSets,
        volumeKg: totals.externalVolumeKg,
        bodyweightReps: totals.bodyweightReps,
        exerciseCount: new Set(p.workout.sets.map((s) => s.position)).size,
        recordedSeconds: totals.durationSeconds,
        distanceMeters: totals.distanceMeters,
      },
    },
  });
}
for (const theme of ["light", "dark"] as const)
  test(`registro ampliado ${theme}: ocho tipos, recarga, pausa, cierre y notas completas`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    const c = context(),
      draft = createTypedDraft({
        context: c,
        userId,
        workoutId,
        now: new Date("2026-10-24T15:00:00Z"),
      });
    const received: TypedRecordingPayload[] = [];
    let stored: TypedRecordingPayload | null = null;
    await page.route(
      "https://iron-strength-seven.vercel.app/api/mobile/v1/typed-recordings**",
      async (route) => {
        if (route.request().method() === "POST") {
          const p = typedRecordingRequestSchema.parse(route.request().postDataJSON()).payload;
          received.push(p);
          stored = p;
          await route.fulfill({
            json: { version: 3, ok: true, status: "created", workoutId: p.id },
          });
        } else if (stored) await route.fulfill({ json: result(stored) });
        else
          await route.fulfill({
            status: 404,
            json: { version: 1, error: { code: "not_found", message: "No disponible" } },
          });
      },
    );
    await page.evaluate(
      ({ key, c, draft }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 4,
            userId: draft.userId,
            active: { mode: "real", routine: c, draft, activeIndex: 0 },
            demos: [],
          }),
        ),
      { key, c, draft },
    );
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    const tools = await page
      .getByRole("button", { name: "Herramientas del ejercicio", exact: true })
      .boundingBox();
    const details = await page
      .getByRole("button", { name: "Detalles del ejercicio", exact: true })
      .boundingBox();
    expect(tools).not.toBeNull();
    expect(details).not.toBeNull();
    expect(Math.abs(tools!.y - details!.y)).toBeLessThan(2);
    for (const button of [tools!, details!]) {
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }
    for (const [i, m] of trainingMetricCases.entries()) {
      await page.getByRole("button", { name: `Ir a Tipo ${i}`, exact: true }).click();
      if (m.weightKg !== null)
        await page
          .getByLabel(
            `${m.recordType === "assisted_bodyweight" ? "ASIST. KG" : m.recordType === "weighted_bodyweight" ? "KG EXTRA" : "KG"} serie 1`,
            { exact: true },
          )
          .fill(String(m.weightKg));
      if (m.reps !== null)
        await page.getByLabel("REPS serie 1", { exact: true }).fill(String(m.reps));
      if (m.durationSeconds !== null)
        await page.getByLabel("SEGUNDOS serie 1", { exact: true }).fill(String(m.durationSeconds));
      if (m.distanceMeters !== null)
        await page.getByLabel("METROS serie 1", { exact: true }).fill(String(m.distanceMeters));
      if (i === 0) {
        await page.getByRole("button", { name: "Opciones de serie 1", exact: true }).click();
        await page.getByRole("button", { name: "Al fallo", exact: true }).click();
        await page.getByLabel("Esfuerzo de serie 1", { exact: true }).fill("8,5");
        await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
        await page.getByLabel("Nota del ejercicio", { exact: true }).fill("Nota propia 💪");
        await expect(page.getByText("Indicación original", { exact: true })).toBeVisible();
      }
      await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
      await expect(
        page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
      ).toBeChecked();
    }
    await page.getByRole("button", { name: "Pausar entrenamiento", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (k) => JSON.parse(localStorage.getItem(k)!).active.pause?.pausedAtMs ?? null,
          key,
        ),
      )
      .not.toBeNull();
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Ir a Tipo 0", exact: true }).click();
    await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
    await expect(page.getByLabel("Nota del ejercicio", { exact: true })).toHaveValue(
      "Nota propia 💪",
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`typed-workout-${theme}-360.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await expect(
      page.getByText("9 series realizadas · 0 pendientes", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar y guardar", exact: true }).click();
    await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
    expect(received).toHaveLength(1);
    expect(received[0].workout.sets.map((s) => s.metrics)).toEqual(
      trainingMetricCases.map((m) => ({ ...m })),
    );
    expect(received[0].workout.exerciseNotes[0].note).toBe("Nota propia 💪");
    expect(received[0].workout.sets[0]).toMatchObject({ setType: "failure", effort: 8.5 });
    await expect(page.getByText("Nota propia 💪", { exact: true })).toBeVisible();
  });
test("convierte explícitamente un registro anterior en curso y conserva sus series y origen", async ({
  page,
}) => {
  const control = await setupDownloadedWeek(page);
  await recoverLegacyWeek(page, control.pack);
  control.offline = true;
  await setWeekConnectivity(page, false);
  await expect(page.getByRole("button", { name: "Conectar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Consultar rutina descargada A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  const before = await page.evaluate((k) => localStorage.getItem(k)!, key);
  await page.getByRole("button", { name: "Indicaciones y alternativas", exact: true }).click();
  await page
    .getByRole("button", { name: "Añadir esfuerzo por serie y notas", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).version, key))
    .toBe(4);
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).previousFormat, key)).toBe(
    before,
  );
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
  expect(saved.draft.workoutId).toBe(JSON.parse(before).active.draft.workoutId);
  expect(saved.draft.exercises[0].sets[0].done).toBe(true);
});
