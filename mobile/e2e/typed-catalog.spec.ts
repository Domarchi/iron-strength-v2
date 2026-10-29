import {
  buildTrainingProgress,
  type TrainingProgressSource,
} from "../../src/domain/training-progress";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupPersonalTraining } from "./support/personal-training-fixture";
import { enterWeekUser } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
import { trainingMetricCases } from "../../src/test/fixtures/training-metrics";
import { trainingTotals, formatTrainingMetrics } from "../../src/domain/training-metrics";
import {
  typedRecordingRequestSchema,
  typedWorkoutSchema,
  type TypedRecordingPayload,
} from "../../src/lib/mobile/typed-recording-contracts";
import {
  typedCatalogSchema,
  typedExerciseDetailSchema,
} from "../../src/lib/mobile/typed-exercise-contracts";
const api = "https://iron-strength-seven.vercel.app/api/mobile/v1",
  key = `is:native-training:v1:${downloadId(1)}`;
const catalog = typedCatalogSchema.parse({
  version: 2,
  exercises: trainingMetricCases.map((m, i) => ({
    id: downloadId(1800 + i),
    name: `Movimiento ${i}`,
    muscleGroup: "Core",
    equipment: null,
    isBodyweight: i === 2,
    progressionIncrementKg: 1,
    recordType: m.recordType,
  })),
});
async function setup(page: Page) {
  const fixture = await setupPersonalTraining(page);
  await page.route(api + "/training-catalog", (route) => route.fulfill({ json: catalog }));
  return fixture;
}
async function start(page: Page) {
  await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
  await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
}
async function pick(page: Page, indices: number[]) {
  await page
    .getByRole("button", { name: "Agregar ejercicios", exact: true })
    .filter({ visible: true })
    .click();
  for (const i of indices)
    await page.getByRole("checkbox", { name: `Seleccionar Movimiento ${i}`, exact: true }).check();
  await page
    .getByRole("button", {
      name: `Agregar ${indices.length} ${indices.length === 1 ? "ejercicio" : "ejercicios"}`,
      exact: true,
    })
    .click();
}
function result(p: TypedRecordingPayload) {
  const totals = trainingTotals(
    p.workout.sets.map((s) => ({ ...s.metrics, setType: s.setType, effort: s.effort })),
  );
  return typedWorkoutSchema.parse({
    version: 3,
    workout: {
      id: p.id,
      sourceKind: "free",
      title: p.source === "free" ? p.workout.title : null,
      personalRoutineId: null,
      personalRoutineRevision: null,
      programName: null,
      sessionLabel: null,
      startedAt: p.workout.startedAt,
      performedOn: "2026-10-27",
      durationSeconds: p.workout.durationSeconds,
      perceivedEffort: p.workout.perceivedEffort ?? null,
      note: p.workout.note ?? null,
      structure: p.structure,
      exercises: p.structure.exercises.map((row, position) => ({
        ...row,
        position,
        name: catalog.exercises.find((e) => e.id === row.exerciseId)!.name,
        prescribedExerciseName: null,
        athleteNote: p.workout.exerciseNotes[position].note,
        sets: p.workout.sets
          .filter((s) => s.position === position)
          .map((s) => ({
            id: downloadId(2100 + position * 20 + s.setNumber),
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
  test(`catálogo real de interfaz ${theme}: selección múltiple, nueve contratos, recuperación y cierre3`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setup(page);
    const received: TypedRecordingPayload[] = [];
    let saved: TypedRecordingPayload | null = null;
    await page.route(api + "/typed-recordings**", async (route) => {
      if (route.request().method() === "POST") {
        const p = typedRecordingRequestSchema.parse(route.request().postDataJSON()).payload;
        received.push(p);
        saved = p;
        return route.fulfill({
          json: { version: 3, ok: true, status: "created", workoutId: p.id },
        });
      }
      if (saved) return route.fulfill({ json: result(saved) });
      return route.fulfill({
        status: 404,
        json: { version: 1, error: { code: "not_found", message: "No disponible" } },
      });
    });
    await start(page);
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
    const before = await page.evaluate((k) => localStorage.getItem(k)!, key);
    await pick(
      page,
      trainingMetricCases.map((_, i) => i),
    );
    await expect(page.getByLabel("KG serie 1", { exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).version, key))
      .toBe(4);
    const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
    expect(after.previousFormat).toBe(before);
    expect(after.active.draft.workoutId).toBe(JSON.parse(before).active.draft.workoutId);
    for (const [i, m] of trainingMetricCases.entries()) {
      await page.getByRole("button", { name: `Ir a Movimiento ${i}`, exact: true }).click();
      if (m.weightKg !== null)
        await page
          .getByLabel(
            `${m.recordType === "assisted_bodyweight" ? "ASIST. KG" : m.recordType === "weighted_bodyweight" ? "KG EXTRA" : "KG"} serie 1`,
            { exact: true },
          )
          .fill(String(m.weightKg));
      if (m.reps !== null)
        await page.getByLabel("REPS serie 1", { exact: true }).fill(String(m.reps));
      else await expect(page.getByLabel("REPS serie 1", { exact: true })).toHaveCount(0);
      if (m.durationSeconds !== null)
        await page.getByLabel("SEGUNDOS serie 1", { exact: true }).fill(String(m.durationSeconds));
      if (m.distanceMeters !== null)
        await page.getByLabel("METROS serie 1", { exact: true }).fill(String(m.distanceMeters));
      await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    }
    await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
    await page.getByLabel("Nota del ejercicio", { exact: true }).fill("Nota de la sesión 💪");
    await expect
      .poll(() =>
        page.evaluate(
          (k) => JSON.parse(localStorage.getItem(k)!).active.draft.exercises[8].athleteNote,
          key,
        ),
      )
      .toBe("Nota de la sesión 💪");
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Ir a Movimiento 8", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
    await expect(page.getByLabel("Nota del ejercicio", { exact: true })).toHaveValue(
      "Nota de la sesión 💪",
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await expect(
      page.getByText("9 series realizadas · 18 pendientes", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar y guardar", exact: true }).click();
    await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
    expect(received).toHaveLength(1);
    expect(received[0].workout.sets.map((s) => s.metrics)).toEqual(
      trainingMetricCases.map((m) => ({ ...m })),
    );
    await expect(page.getByText("Nota de la sesión 💪", { exact: true })).toBeVisible();
  });
test("cuota al agregar tipos nuevos conserva las series anteriores y protege el mismo lote al reintentar", async ({
  page,
}) => {
  await setup(page);
  await start(page);
  await pick(page, [0]);
  await page.getByLabel("Peso serie 1", { exact: true }).fill("30");
  await page.getByLabel("Repeticiones serie 1", { exact: true }).fill("8");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Organizar ejercicios", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organizar", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Agregar ejercicios", exact: true })
    .filter({ visible: true })
    .click();
  for (const i of [5, 7])
    await page.getByRole("checkbox", { name: `Seleccionar Movimiento ${i}`, exact: true }).check();
  const before = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("is:native-training:") && !localStorage.getItem("allow-catalog-write"))
        throw Error("quota");
      return write.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "Agregar 2 ejercicios", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar guardado local", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(before);
  await expect(
    page.getByRole("checkbox", { name: "Seleccionar Movimiento 5", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => localStorage.setItem("allow-catalog-write", "1"));
  await page.getByRole("button", { name: "Reintentar guardado local", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organizar", exact: true })).toBeVisible();
  const protectedValue = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
  expect(protectedValue.active.draft.exercises).toHaveLength(3);
  expect(protectedValue.active.draft.exercises[0].sets[0]).toMatchObject({
    done: true,
    weight: "30",
    reps: "8",
  });
  expect(protectedValue.previousFormat).toBe(before);
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeChecked();
});
test("reemplazo moderno revisa la pérdida de series y conserva la identidad del registro", async ({
  page,
}) => {
  await setup(page);
  await start(page);
  await pick(page, [0]);
  await page.getByLabel("Peso serie 1", { exact: true }).fill("30");
  await page.getByLabel("Repeticiones serie 1", { exact: true }).fill("8");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  const old = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
  await page.getByRole("button", { name: "Organizar ejercicios", exact: true }).click();
  await page
    .getByRole("button", { name: "Opciones de Movimiento 0, ejercicio 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Reemplazar ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Elegir Movimiento 5", exact: true }).click();
  await page.getByRole("button", { name: "Reemplazar ejercicio", exact: true }).click();
  await expect(page.getByText("Se perderá 1 serie registrada.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar cambio", exact: true }).click();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).active.draft.exercises[0].sets[0].done,
      key,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Reemplazar ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar reemplazo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organizar", exact: true })).toBeVisible();
  const a = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
  expect(a.draft.workoutId).toBe(old.draft.workoutId);
  expect(a.draft.exercises[0].sessionExerciseId).toBe(old.draft.exercises[0].sessionExerciseId);
  expect(a.draft.exercises[0].prescribed.recordType).toBe("duration");
  expect(a.draft.exercises[0].sets.every((s: { done: boolean }) => !s.done)).toBe(true);
});
for (const theme of ["light", "dark"] as const)
  test(`ficha tipada ${theme}: historial paginado conserva notas, clase y métricas sin inventar reps`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setup(page);
    const entry = catalog.exercises[7],
      requests: string[] = [];
    await page.route(api + "/training-catalog/" + entry.id + "**", async (route) => {
      const url = new URL(route.request().url()),
        second = url.searchParams.has("cursor");
      requests.push(url.search);
      const n = second ? 1 : 2,
        date = `2026-10-0${n}`,
        startedAt = date + "T12:00:00Z",
        id = downloadId(2600 + n);
      return route.fulfill({
        json: typedExerciseDetailSchema.parse({
          version: 2,
          exercise: entry,
          history: {
            items: [
              {
                id,
                startedAt,
                date,
                sourceKind: "free",
                title: "Carrera",
                sessionLabel: null,
                exerciseNotes: [
                  { position: 0, note: second ? "Segunda sesión" : "Ritmo sostenido" },
                ],
                sets: [
                  {
                    id: downloadId(2700 + n),
                    position: 0,
                    setNumber: 1,
                    metrics: trainingMetricCases[7],
                    setType: "drop",
                    effort: 8.5,
                  },
                ],
              },
            ],
            nextCursor: second ? null : startedAt + "|" + id,
          },
        }),
      });
    });
    const progressSource: TrainingProgressSource = {
      version: 1,
      userId: downloadId(1),
      today: "2026-10-28",
      workouts: [1, 2].map((n) => ({
        id: downloadId(2600 + n),
        startedAt: `2026-10-0${n}T12:00:00Z`,
        date: `2026-10-0${n}`,
        sourceKind: "free",
        title: "Carrera",
        sessionLabel: null,
        durationSeconds: 600,
        perceivedEffort: null,
        note: null,
        sets: [
          {
            id: downloadId(2700 + n),
            exerciseId: entry.id,
            name: entry.name,
            muscleGroup: "Core",
            position: 0,
            setNumber: 1,
            metrics: trainingMetricCases[7],
            setType: "drop",
            effort: 8.5,
          },
        ],
      })),
    };
    await page.route(api + "/training-progress", (route) =>
      route.fulfill({
        json: {
          version: 2,
          userId: downloadId(1),
          today: progressSource.today,
          ...buildTrainingProgress(progressSource),
        },
      }),
    );
    await page.getByRole("button", { name: "Biblioteca de ejercicios", exact: true }).click();
    await page.getByRole("button", { name: "Ver ejercicio Movimiento 7", exact: true }).click();
    await expect(page.getByText("Distancia y tiempo", { exact: true })).toBeVisible();
    await expect(page.getByText("Ritmo sostenido", { exact: true })).toBeVisible();
    await expect(page.getByText("Descendente 1", { exact: true })).toBeVisible();
    await expect(
      page.getByText(`${formatTrainingMetrics(trainingMetricCases[7])} · Esfuerzo 8.5/10`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ver progreso de este ejercicio", exact: true }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Más entrenamientos", exact: true }).click();
    await expect(page.getByText("Segunda sesión", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await page.screenshot({
      path: test.info().outputPath(`typed-catalog-history-${theme}-360.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Ver progreso de este ejercicio", exact: true }).click();
    await expect(page.getByLabel("Valor del periodo")).toHaveText("1.000 m");
    await expect(page.getByRole("button", { name: "1RM estimado", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Volver a la ficha", exact: true }).click();
    await expect(page.getByText("Ritmo sostenido", { exact: true })).toBeVisible();
  });
