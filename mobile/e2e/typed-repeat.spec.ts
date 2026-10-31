import { openResultOptions } from "./support/result-options";
import { progressFromResults } from "./support/training-progress-results";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupPersonalTraining } from "./support/personal-training-fixture";
import { enterWeekUser } from "./support/week-fixture";
import { typedResultFixture } from "../../src/test/fixtures/typed-result";
import { downloadId } from "../../src/test/fixtures/week-download";
import {
  typedRecordingRequestSchema,
  typedWorkoutSchema,
  type TypedRecordingPayload,
} from "../../src/lib/mobile/typed-recording-contracts";
import { trainingTotals } from "../../src/domain/training-metrics";
const api = "https://iron-strength-seven.vercel.app/api/mobile/v1",
  key = `is:native-training:v1:${downloadId(1)}`;
async function setup(page: Page, orphanGroup = false) {
  await setupPersonalTraining(page);
  await page.clock.setFixedTime(new Date("2026-10-27T15:00:00Z"));
  const fixture = typedResultFixture(),
    control = { catalog: fixture.catalog, calls: [] as TypedRecordingPayload[] };
  fixture.result.workout.startedAt = "2026-10-27T12:00:00Z";
  fixture.result.workout.exercises[0].sets[0].setType = "warmup";
  fixture.result.workout.exercises[1].sets[0].setType = "failure";
  fixture.result.workout.exercises[2].sets[0].setType = "drop";
  if (orphanGroup) {
    for (let i = 0; i < 2; i++) {
      const layout = { supersetId: downloadId(3900), supersetRestSeconds: null, restSeconds: 0 };
      Object.assign(fixture.result.workout.structure.exercises[i], layout);
      Object.assign(fixture.result.workout.exercises[i], layout);
    }
    fixture.result.workout.exercises[0].sets[0].setType = "working";
    fixture.result.workout.exercises[1].sets = [];
  }
  const sourceTotals = trainingTotals(
    fixture.result.workout.exercises.flatMap((e) =>
      e.sets.map((s) => ({ ...s.metrics, setType: s.setType, effort: s.effort })),
    ),
  );
  Object.assign(fixture.result.workout.summary, {
    workingSets: sourceTotals.workingSets,
    volumeKg: sourceTotals.externalVolumeKg,
    bodyweightReps: sourceTotals.bodyweightReps,
    recordedSeconds: sourceTotals.durationSeconds,
    distanceMeters: sourceTotals.distanceMeters,
  });
  let saved = fixture.result;
  await page.route(api + "/training-catalog", (route) => route.fulfill({ json: control.catalog }));
  await page.route(api + "/typed-recordings**", async (route) => {
    if (route.request().method() === "POST") {
      const p = typedRecordingRequestSchema.parse(route.request().postDataJSON()).payload;
      control.calls.push(p);
      const totals = trainingTotals(
        p.workout.sets.map((s) => ({ ...s.metrics, setType: s.setType, effort: s.effort })),
      );
      saved = typedWorkoutSchema.parse({
        version: 3,
        workout: {
          ...fixture.result.workout,
          id: p.id,
          startedAt: p.workout.startedAt,
          durationSeconds: p.workout.durationSeconds,
          perceivedEffort: p.workout.perceivedEffort ?? null,
          note: p.workout.note ?? null,
          structure: p.structure,
          exercises: p.structure.exercises.map((r, position) => ({
            ...r,
            position,
            name: control.catalog.exercises.find((e) => e.id === r.exerciseId)!.name,
            prescribedExerciseName: null,
            athleteNote: p.workout.exerciseNotes[position].note,
            sets: p.workout.sets
              .filter((s) => s.position === position)
              .map((s) => ({
                id: downloadId(3100 + position * 20 + s.setNumber),
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
      return route.fulfill({ json: { version: 3, ok: true, status: "created", workoutId: p.id } });
    }
    return route.fulfill({ json: saved });
  });
  const w = fixture.result.workout;
  await page.route(api + "/training-progress", (route) =>
    route.fulfill({ json: progressFromResults(downloadId(1), [fixture.result], "2026-10-27") }),
  );
  await page.route(api + "/workouts", (route) =>
    route.fulfill({
      json: {
        version: 1,
        nextCursor: null,
        items: [
          {
            id: w.id,
            sourceKind: w.sourceKind,
            title: w.title,
            sessionLabel: null,
            startedAt: w.startedAt,
            performedOn: w.performedOn,
            durationSeconds: w.durationSeconds,
            perceivedEffort: w.perceivedEffort,
            note: w.note,
            workingSets: w.summary.workingSets,
            volumeKg: w.summary.volumeKg,
            bodyweightReps: w.summary.bodyweightReps,
            exerciseCount: w.summary.exerciseCount,
          },
        ],
      },
    }),
  );
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Ver entrenamiento del 27/10 · Registro de todos los tipos",
      exact: true,
    })
    .click();
  await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
  await openResultOptions(page);
  await page.getByRole("button", { name: "Repetir entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Repetir entrenamiento", exact: true }),
  ).toBeVisible();
  return { fixture, control };
}
for (const theme of ["light", "dark"] as const)
  test(`repetición ampliada ${theme}: vista previa, métricas recuperables, cierre nuevo sin notas o esfuerzo heredados`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const { fixture, control } = await setup(page);
    await expect(page.getByText("9 ejercicios · 9 series", { exact: true })).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    await expect(
      page.getByText("Nota propia 0", { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Nota global propia", { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Ver detalle de Movimiento 5", exact: true }).click();
    await expect(page.getByText("Indicación 5", { exact: true })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await page.screenshot({
      path: test.info().outputPath(`typed-repeat-${theme}-360.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await expect(page.getByLabel("KG serie 1", { exact: true })).toHaveValue("30");
    const a = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
    expect(a.draft.workoutId).not.toBe(fixture.result.workout.id);
    expect(a.draft.origin).toEqual({ kind: "free" });
    expect(
      a.draft.exercises.every(
        (e: { athleteNote: string | null; sets: { done: boolean; effort: string }[] }) =>
          e.athleteNote === null && e.sets.every((s) => !s.done && s.effort === ""),
      ),
    ).toBe(true);
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    for (let i = 0; i < 9; i++) {
      await page.getByRole("button", { name: `Ir a Movimiento ${i}`, exact: true }).click();
      await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    }
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar y guardar", exact: true }).click();
    await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
    expect(control.calls).toHaveLength(1);
    expect(control.calls[0].source).toBe("free");
    expect(control.calls[0].workout.exerciseNotes.every((n) => n.note === null)).toBe(true);
    expect(control.calls[0].workout.sets.every((s) => s.effort === null)).toBe(true);
    expect(control.calls[0].workout.sets.map((s) => s.metrics)).toEqual(
      fixture.result.workout.exercises.map((e) => e.sets[0].metrics),
    );
  });
test("repetición ampliada con cuota retoma y protege el mismo ID sin perder métricas", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("is:native-training:") && !localStorage.getItem("allow-typed-repeat"))
        throw Error("quota");
      return write.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(page.getByLabel("KG serie 1", { exact: true })).toHaveValue("30");
  const workoutId = new URL(page.url()).pathname.split("/").at(-1);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await page.evaluate(() => localStorage.setItem("allow-typed-repeat", "1"));
  await page
    .getByRole("button", { name: "Reintentar", exact: true })
    .filter({ visible: true })
    .click();
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).not.toBeNull();
  expect(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active.draft.workoutId, key),
  ).toBe(workoutId);
});
test("un cambio de tipo en el catálogo bloquea el inicio y exige revisar sin crear copia parcial", async ({
  page,
}) => {
  const { control } = await setup(page);
  control.catalog = structuredClone(control.catalog);
  control.catalog.exercises[5].recordType = "weight_reps";
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await expect(
    page.getByText("El catálogo cambió. Actualiza la vista previa antes de empezar.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toBeDisabled();
});
test("volver atrás durante la comprobación ampliada no crea un entrenamiento tardío", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(api + "/training-catalog", async (route) => {
    await waiting;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.goBack();
  release();
  await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});
test("descanso habitual de grupo incompleto ampliado se conserva al repetir y registrar", async ({
  page,
}) => {
  await setup(page, true);
  await expect(
    page.getByText("Una superserie queda individual y conserva el descanso de la ronda.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).active.draft.rest?.totalSeconds,
        key,
      ),
    )
    .toBe(90);
  const row = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).active.draft.exercises[0],
    key,
  );
  expect(row.supersetId).toBeNull();
  expect(row.restSeconds).toBe(90);
});
