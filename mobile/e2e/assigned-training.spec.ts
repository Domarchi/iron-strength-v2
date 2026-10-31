import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek, enterWeekUser } from "./support/week-fixture";
import { assignedFixtureResult } from "./support/assigned-context";
import { assignedTrainingFixture } from "../../src/test/fixtures/assigned-training";
import { downloadId as id } from "../../src/test/fixtures/week-download";
import { assignedContextSchema } from "../../src/lib/workout/training-context";
import { trainingMetricCases } from "../../src/test/fixtures/training-metrics";
import {
  typedRecordingRequestSchema,
  type TypedRecordingPayload,
} from "../../src/lib/mobile/typed-recording-contracts";
const origin = "https://iron-strength-seven.vercel.app/api/mobile/v1/",
  key = `is:native-training:v1:${id(1)}`;
function context() {
  const base = assignedTrainingFixture();
  return assignedContextSchema.parse({
    ...base,
    userId: id(1),
    origin: { kind: "assigned", programId: id(2), programSessionId: id(3) },
    session: {
      ...base.session,
      id: id(3),
      programId: id(2),
      startDate: "2026-10-19",
      endsOn: "2026-11-01",
      weekNumber: 1,
      weeksCount: 2,
      programName: "Fuerza",
    },
    exercises: trainingMetricCases.map((m, i) => ({
      ...base.exercises[0],
      sessionExerciseId: id(100 + i),
      exerciseId: id(200 + i),
      name: `Asignado ${i}`,
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
      note: `Indicación ${i}`,
    })),
  });
}
for (const theme of ["light", "dark"] as const)
  test(`asignada ${theme}: consulta, nueve métricas, recarga, pausa y cierre protegido`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    const c = context(),
      received: TypedRecordingPayload[] = [];
    let stored: TypedRecordingPayload | null = null;
    await page.route(origin + "training-sessions/**", (r) => r.fulfill({ json: c }));
    await page.route(origin + "typed-recordings**", async (r) => {
      if (r.request().method() === "POST") {
        const p = typedRecordingRequestSchema.parse(r.request().postDataJSON()).payload;
        received.push(p);
        stored = p;
        if (received.length === 1) return r.abort("failed");
        return r.fulfill({ json: { version: 3, ok: true, status: "duplicate", workoutId: p.id } });
      }
      if (stored) return r.fulfill({ json: assignedFixtureResult(c, stored) });
      return r.fulfill({
        status: 404,
        json: { version: 1, error: { code: "not_found", message: "Sin resultado" } },
      });
    });
    await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    await expect(page.getByText("1 × 60 s", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    for (const [i, m] of trainingMetricCases.entries()) {
      await page.getByRole("button", { name: `Ir a Asignado ${i}`, exact: true }).click();
      const weight =
        m.recordType === "assisted_bodyweight"
          ? "ASIST. KG"
          : m.recordType === "weighted_bodyweight"
            ? "KG EXTRA"
            : "KG";
      if (m.weightKg !== null)
        await expect(page.getByLabel(`${weight} serie 1`, { exact: true })).toHaveValue(
          String(m.weightKg).replace(".", ","),
        );
      if (m.reps !== null)
        await page.getByLabel("REPS serie 1", { exact: true }).fill(String(m.reps));
      else await expect(page.getByLabel("REPS serie 1", { exact: true })).toHaveCount(0);
      if (m.durationSeconds !== null)
        await page.getByLabel("SEGUNDOS serie 1", { exact: true }).fill(String(m.durationSeconds));
      if (m.distanceMeters !== null)
        await page.getByLabel("METROS serie 1", { exact: true }).fill(String(m.distanceMeters));
      await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
      await expect(
        page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
      ).toBeChecked();
    }
    await page.getByRole("button", { name: "Pausar entrenamiento", exact: true }).click();
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active.routine, key),
    ).toEqual(c);
    await page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }).click();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await page.screenshot({ path: test.info().outputPath(`assigned-${theme}-360.png`) });
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar y guardar", exact: true }).click();
    await expect.poll(() => received.length).toBe(1);
    await expect(
      page.getByRole("button", { name: "Reintentar envío", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Conectar", exact: true }).first().click();
    await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible({
      timeout: 30000,
    });
    expect(received).toHaveLength(2);
    expect(received[0]).toEqual(received[1]);
    expect(received[0].source).toBe("assigned");
    expect(received[0].workout.sets.map((s) => s.metrics)).toEqual(trainingMetricCases);
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key)).toBeNull();
  });

test("alternativa de otro tipo conserva grupo, avanza rondas desiguales y recupera descanso", async ({
  page,
}) => {
  await setupDownloadedWeek(page);
  const base = context(),
    first = structuredClone(base.exercises[0]),
    second = structuredClone(base.exercises[5]),
    alternative = structuredClone(base.exercises[6]);
  first.prescribed.sets = 2;
  first.supersetId = id(990);
  first.supersetRestSeconds = 45;
  first.alternatives = [
    {
      exerciseId: alternative.exerciseId,
      name: alternative.name,
      isBodyweight: alternative.isBodyweight,
      prescribed: { ...alternative.prescribed, sets: 2 },
      lastMetrics: null,
    },
  ];
  second.supersetId = id(990);
  second.supersetRestSeconds = 45;
  const c = assignedContextSchema.parse({ ...base, exercises: [first, second] });
  await page.route(origin + "training-sessions/**", (r) => r.fulfill({ json: c }));
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Cambiar a Asignado 6", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar panel", exact: true }).click();
  await page.getByLabel("SEGUNDOS serie 1", { exact: true }).fill("60");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ir a Asignado 5", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Tiempo de descanso restante")).toHaveCount(0);
  await page.getByLabel("SEGUNDOS serie 1", { exact: true }).fill("60");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(page.getByLabel("Tiempo de descanso restante")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ir a Asignado 6", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
  expect(before.draft.exercises[0].exerciseId).toBe(alternative.exerciseId);
  expect(before.draft.exercises[0].prescribed.recordType).toBe("weight_duration");
  expect(before.draft.rest.totalSeconds).toBe(45);
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(page.getByLabel("Tiempo de descanso restante")).toBeVisible();
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key)).toEqual(
    before,
  );
  await page.getByLabel("SEGUNDOS serie 2", { exact: true }).fill("45");
  await page.getByRole("checkbox", { name: "Completar serie 2", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((k) => {
        const active = JSON.parse(localStorage.getItem(k)!).active;
        return active.draft.exercises.map(
          (e: { sets: { done: boolean }[] }) => e.sets.filter((set) => set.done).length,
        );
      }, key),
    )
    .toEqual([2, 1]);
  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
  expect(
    after.draft.exercises.map(
      (e: { sets: { done: boolean }[] }) => e.sets.filter((s) => s.done).length,
    ),
  ).toEqual([2, 1]);
  expect(after.routine).toEqual(c);
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key)).toEqual(
    after,
  );
});
test("una respuesta de inicio recibida después de salir no crea un entrenamiento", async ({
  page,
}) => {
  await setupDownloadedWeek(page);
  let calls = 0,
    release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(origin + "training-sessions/**", async (r) => {
    calls++;
    if (calls > 1) await waiting;
    await r.fulfill({ json: context() });
  });
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await expect.poll(() => calls).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  release();
  await expect(page.getByText("Hola, Ana", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});
