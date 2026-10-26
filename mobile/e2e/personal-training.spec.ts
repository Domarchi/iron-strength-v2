import { personalRoutineFixture } from "../src/test/fixtures/personal-routine";
import { enterWeekUser } from "./support/week-fixture";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setupPersonalLibrary, libraryExercises } from "./support/library-fixture";
import {
  personalWorkoutPayloadSchema,
  type PersonalWorkoutPayload,
} from "../../src/lib/mobile/personal-workout-contracts";
import { santiagoDate } from "../../src/domain/dates";
import { downloadId } from "../../src/test/fixtures/week-download";
import type { MobileWorkout } from "../../src/lib/mobile/contracts";
async function setup(page: Page) {
  const library = await setupPersonalLibrary(page),
    records = new Map<string, PersonalWorkoutPayload>();
  const control = { records, calls: [] as PersonalWorkoutPayload[], loseResponse: false };
  const api = "https://iron-strength-seven.vercel.app/api/mobile/v1";
  const result = (payload: PersonalWorkoutPayload): MobileWorkout => {
    const groups = new Map<number, MobileWorkout["workout"]["exercises"][number]>();
    payload.sets.forEach((set, i) => {
      const row = groups.get(set.position) ?? {
        position: set.position,
        exerciseId: set.exerciseId,
        name: libraryExercises.find((e) => e.id === set.exerciseId)?.name ?? "Ejercicio",
        sets: [],
      };
      row.sets.push({
        id: downloadId(950 + i),
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        isWarmup: set.isWarmup,
      });
      groups.set(set.position, row);
    });
    return {
      version: 1,
      workout: {
        id: payload.id,
        sourceKind: payload.origin.kind,
        title: payload.title,
        programName: null,
        sessionLabel: null,
        startedAt: payload.startedAt,
        performedOn: santiagoDate(new Date(payload.startedAt)),
        durationSeconds: payload.durationSeconds,
        perceivedEffort: payload.perceivedEffort ?? null,
        note: payload.note ?? null,
        summary: {
          workingSets: payload.sets.filter((s) => !s.isWarmup).length,
          volumeKg: payload.sets
            .filter((s) => !s.isWarmup)
            .reduce((n, s) => n + s.weightKg * s.reps, 0),
          bodyweightReps: 0,
          exerciseCount: groups.size,
        },
        exercises: [...groups.values()],
      },
    };
  };
  await page.route(api + "/personal-workouts", async (route) => {
    const body = route.request().postDataJSON(),
      payload = personalWorkoutPayloadSchema.parse(body.payload);
    control.calls.push(payload);
    const duplicate = records.has(payload.id);
    records.set(payload.id, payload);
    if (control.loseResponse) {
      control.loseResponse = false;
      return route.fulfill({
        status: 503,
        json: {
          version: 1,
          error: { code: "unavailable", message: "Respuesta perdida; conservamos el registro." },
        },
      });
    }
    return route.fulfill({
      json: {
        version: 1,
        ok: true,
        status: duplicate ? "duplicate" : "created",
        workoutId: payload.id,
      },
    });
  });
  await page.route(api + "/workouts/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!,
      payload = records.get(id);
    if (!payload) return route.fallback();
    return route.fulfill({ json: result(payload) });
  });
  await page.route(api + "/workouts", (route) =>
    route.fulfill({
      json: {
        version: 1,
        nextCursor: null,
        items: [...records.values()].map((payload) => {
          const w = result(payload).workout;
          return {
            id: w.id,
            sourceKind: w.sourceKind,
            title: w.title,
            sessionLabel: null,
            startedAt: w.startedAt,
            performedOn: w.performedOn,
            durationSeconds: w.durationSeconds,
            perceivedEffort: w.perceivedEffort,
            note: w.note,
            ...w.summary,
          };
        }),
      },
    }),
  );
  await page.getByRole("button", { name: "Volver a Entrenar", exact: true }).click();
  return { ...library, control };
}
for (const theme of ["light", "dark"] as const) {
  test(`libre real ${theme}: vacío → catálogo → series → cierre con resultado propio`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "is:native-appearance:v1",
          JSON.stringify({ version: 1, preference: theme }),
        ),
      theme,
    );
    await page.setViewportSize({ width: 360, height: 800 });
    const { control } = await setup(page);
    await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Nombre del entrenamiento", exact: true })
      .fill("Mi libre");
    await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mi libre", exact: true })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
    await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
    await page
      .getByRole("checkbox", { name: "Seleccionar Remo con mancuerna", exact: true })
      .check();
    await page.getByRole("button", { name: "Agregar 2 ejercicios", exact: true }).click();
    await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("30");
    await page.getByRole("textbox", { name: "Repeticiones serie 1", exact: true }).fill("8");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath("free-workout.png"), fullPage: true });
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
    await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible();
    await expect(page.getByText(/Mi libre ·/).filter({ visible: true })).toBeVisible();
    expect(control.records.size).toBe(1);
    expect(control.calls[0]).not.toHaveProperty("programId");
    expect(control.calls[0].sets).toHaveLength(1);
    expect(control.calls[0].origin).toEqual({ kind: "free" });
  });
}

test("sin espacio al iniciar libre conserva el registro vacío y permite protegerlo sin empezar otro", async ({
  page,
}) => {
  const { control } = await setup(page);
  await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:native-training:") && !localStorage.getItem("allow-training-write"))
        throw Error("quota");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Entrenamiento libre", exact: true }),
  ).toBeVisible();
  const workoutId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(
    page.getByRole("button", { name: "Agregar ejercicios", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => localStorage.setItem("allow-training-write", "1"));
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Agregar ejercicios", exact: true })).toBeEnabled();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).active.draft.workoutId,
      `is:native-training:v1:${downloadId(1)}`,
    ),
  ).toBe(workoutId);
  expect(control.calls).toHaveLength(0);
});

test("rutina personal → ronda recuperada → respuesta perdida → resultado único", async ({
  page,
}) => {
  const { state, control } = await setup(page);
  const base = personalRoutineFixture();
  base.items = base.items.map((item, index) => {
    const { id: exerciseId, ...metadata } = libraryExercises[index];
    return { ...item, ...metadata, exerciseId };
  });
  state.value.routines = [base];
  await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
  const preview = page.getByRole("button", { name: "Ver rutina Superior", exact: true });
  await expect(preview).toBeVisible({ timeout: 5000 });
  await preview.click();
  await expect(page.getByRole("heading", { name: "Superior", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      `is:native-training:v1:${downloadId(1)}`,
    ),
  ).toBeNull();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("personal-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ir a Remo con mancuerna", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  const key = `is:native-training:v1:${downloadId(1)}`;
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.active?.draft?.rest?.endsAt ?? 0,
        key,
      ),
    )
    .toBeGreaterThan(0);
  const endsAt = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).active.draft.rest.endsAt,
    key,
  );
  await page.clock.setFixedTime(new Date(endsAt - 40000));
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).active.draft.rest.endsAt,
      key,
    ),
  ).toBe(endsAt);
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeChecked();
  control.loseResponse = true;
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  expect(control.records.size).toBe(1);
  expect(control.calls).toHaveLength(2);
  expect(control.calls[1]).toEqual(control.calls[0]);
  expect(control.calls[0].origin).toEqual({
    kind: "personal",
    routineId: base.id,
    revision: base.revision,
  });
  expect(control.calls[0].sets).toHaveLength(2);
  expect(state.value.routines[0]).toEqual(base);
});

for (const theme of ["light", "dark"] as const) {
  test(`pausa libre ${theme}: conserva duración, descanso y edición al recuperar y cerrar`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "is:native-appearance:v1",
          JSON.stringify({ version: 1, preference: theme }),
        ),
      theme,
    );
    await page.setViewportSize({ width: 360, height: 800 });
    const { control } = await setup(page);
    await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
    await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
    await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
    await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
    await page.getByRole("button", { name: "Agregar 1 ejercicio", exact: true }).click();
    await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("30");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    const key = `is:native-training:v1:${downloadId(1)}`;
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)!)?.active?.draft?.rest?.endsAt ?? 0,
          key,
        ),
      )
      .toBeGreaterThan(0);
    const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
    const start = Date.parse(before.active.draft.startedAt);
    await page.clock.setFixedTime(new Date(start + 10000));
    const pause = page.getByRole("button", { name: "Pausar entrenamiento", exact: true });
    await expect(pause).toBeVisible({ timeout: 5000 });
    await pause.click();
    await expect(
      page.getByText("En pausa", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Duración del entrenamiento", { exact: true })).toHaveText("0:10");
    await expect(
      page.getByRole("textbox", { name: "Peso serie 2", exact: true }),
    ).not.toBeEditable();
    await expect(
      page.getByRole("checkbox", { name: "Completar serie 2", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "Añadir serie", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Agregar ejercicios", exact: true }),
    ).toBeDisabled();
    await page.clock.setFixedTime(new Date(start + 30000));
    await expect(page.getByLabel("Duración del entrenamiento", { exact: true })).toHaveText("0:10");
    await page.getByRole("button", { name: "Sumar 15 segundos", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)!).active.draft.rest.endsAt,
          key,
        ),
      )
      .toBe(before.active.draft.rest.endsAt + 15000);
    await page.getByRole("button", { name: "Omitir descanso", exact: true }).click();
    await page.reload();
    await enterWeekUser(page);
    await expect(page.getByText("ENTRENAMIENTO EN PAUSA", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await expect(page.getByLabel("Duración del entrenamiento", { exact: true })).toHaveText("0:10");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("paused-workout.png"), fullPage: true });
    await page.clock.setFixedTime(new Date(start + 45000));
    await page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Peso serie 2", exact: true })).toBeEditable();
    await page.clock.setFixedTime(new Date(start + 55000));
    await expect(page.getByLabel("Duración del entrenamiento", { exact: true })).toHaveText("0:20");
    await page.getByRole("button", { name: "Pausar entrenamiento", exact: true }).click();
    await page.clock.setFixedTime(new Date(start + 75000));
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
    await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible();
    expect(control.calls[0]).toMatchObject({
      startedAt: before.active.draft.startedAt,
      finishedAt: new Date(start + 75000).toISOString(),
      durationSeconds: 20,
    });
    expect(control.records.size).toBe(1);
  });
}

test("pausa libre vacía con cuota: protege el mismo registro antes de reanudar", async ({
  page,
}) => {
  const { control } = await setup(page);
  await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
  await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Entrenamiento libre", exact: true }),
  ).toBeVisible();
  const key = `is:native-training:v1:${downloadId(1)}`;
  const before = await page.evaluate((key) => localStorage.getItem(key), key);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:native-training:") && !localStorage.getItem("allow-pause-write"))
        throw Error("quota");
      return original.call(this, key, value);
    };
  });
  const pause = page.getByRole("button", { name: "Pausar entrenamiento", exact: true });
  await expect(pause).toBeVisible({ timeout: 5000 });
  await pause.click();
  await expect(
    page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(before);
  await page.evaluate(() => localStorage.setItem("allow-pause-write", "1"));
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).previousFormat, key),
  ).toBe(before);
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Agregar ejercicios", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }).click();
  await expect(page.getByRole("button", { name: "Agregar ejercicios", exact: true })).toBeEnabled();
  expect(control.calls).toHaveLength(0);
});
