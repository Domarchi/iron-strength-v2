import { defaultTrainingPreferences } from "../src/lib/training-preferences";
import { trainingMetricCases } from "../../src/test/fixtures/training-metrics";
import { trainingFields } from "../src/lib/training-fields";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek, enterWeekUser } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
import { createTypedDraft, typedContextSchema } from "../src/lib/typed-training";
const userId = downloadId(1),
  workoutId = downloadId(216),
  key = `is:native-training:v1:${userId}`,
  prefKey = `is:native-training-preferences:v1:${userId}`;
async function start(page: Page, legacy = false, metric?: (typeof trainingMetricCases)[number]) {
  const f = await setupDownloadedWeek(page);
  if (legacy) {
    await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
    await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
    await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  } else {
    const routine = typedContextSchema.parse({
      version: 3,
      origin: { kind: "free" },
      title: "Herramientas",
      sessionLabel: "Libre",
      exercises: [
        {
          sessionExerciseId: downloadId(217),
          exerciseId: downloadId(218),
          name: "Press",
          isBodyweight: false,
          prescribed: {
            recordType: metric ? metric.recordType : "weight_reps",
            sets: 1,
            target: {
              repsMin: metric?.reps === null ? null : 8,
              repsMax: metric?.reps === null ? null : 10,
              targetWeightKg: metric ? metric.weightKg : 60,
              targetDurationSeconds: metric?.durationSeconds ?? null,
              targetDistanceMeters: metric?.distanceMeters ?? null,
            },
            series: null,
          },
          lastMetrics: null,
          restSeconds: 90,
          note: null,
          supersetId: null,
          supersetRestSeconds: null,
          alternatives: [],
        },
      ],
    });
    const draft = createTypedDraft({
      context: routine,
      userId,
      workoutId,
      now: new Date("2026-10-24T15:00:00Z"),
    });
    draft.exercises[0].sets[0].reps = metric?.reps === null ? "" : "8";
    draft.exercises[0].sets[0].duration =
      metric?.durationSeconds == null ? "" : String(metric.durationSeconds);
    draft.exercises[0].sets[0].distance =
      metric?.distanceMeters == null ? "" : String(metric.distanceMeters);
    draft.exercises[0].sets[0].done = true;
    draft.rest = { endsAt: new Date("2026-10-24T15:00:00Z").getTime() + 90000, totalSeconds: 90 };
    await page.evaluate(
      ({ key, routine, draft }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 4,
            userId: draft.userId,
            active: { mode: "real", routine, draft, activeIndex: 0 },
            demos: [],
          }),
        ),
      { key, routine, draft },
    );
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  }
  return f;
}
const getActive = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).active, key);
for (const theme of ["light", "dark"] as const)
  test(`herramientas ${theme}: carga exacta/imposible, cancelar y confirmar sin perder serie ni descanso`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await start(page);
    const before = await getActive(page);
    await page.getByRole("button", { name: "Herramientas del ejercicio", exact: true }).click();
    await page.getByRole("button", { name: "Calculadora de discos", exact: true }).click();
    await page.getByLabel("Carga total").fill("60");
    await page.getByRole("button", { name: "Calcular discos", exact: true }).click();
    await expect(
      page.getByText("No se puede componer esta carga con el equipo indicado.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Añadir tamaño de disco", exact: true }).click();
    await page.getByLabel("Peso del disco 1").fill("20");
    await page.getByLabel("Pares disponibles 1").fill("1");
    await page.getByRole("button", { name: "Calcular discos", exact: true }).click();
    await expect(page.getByText("Por lado: 1 × 20 kg", { exact: true })).toBeVisible();
    await expect(await getActive(page)).toEqual(before);
    await page.getByRole("button", { name: "Volver a herramientas", exact: true }).click();
    await page.getByRole("button", { name: "Preparar calentamientos", exact: true }).click();
    await page.getByLabel("KG calentamiento 1", { exact: true }).fill("20");
    await page.getByLabel("REPS calentamiento 1", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Revisar calentamientos", exact: true }).click();
    await expect(page.getByText("20 kg × 5 reps", { exact: true })).toBeVisible();
    const panelAudit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(panelAudit.violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`warmup-${theme}.png`) });
    await page.getByRole("button", { name: "Cancelar calentamientos", exact: true }).click();
    await expect(await getActive(page)).toEqual(before);
    await page.getByRole("button", { name: "Preparar calentamientos", exact: true }).click();
    await page.getByLabel("KG calentamiento 1", { exact: true }).fill("20");
    await page.getByLabel("REPS calentamiento 1", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Revisar calentamientos", exact: true }).click();
    await page.getByRole("button", { name: "Añadir calentamientos", exact: true }).click();
    await expect.poll(async () => (await getActive(page)).draft.exercises[0].sets.length).toBe(2);
    const after = await getActive(page);
    expect(after.draft.exercises[0].sets[1]).toEqual(before.draft.exercises[0].sets[0]);
    expect(after.draft.rest).toEqual(before.draft.rest);
    await page.getByRole("button", { name: "Cerrar herramientas", exact: true }).click();
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(report.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await expect(await getActive(page)).toEqual(after);
  });
test("preferencias: guardar/cancelar, conversión solo visual y recarga sin alterar registro", async ({
  page,
}) => {
  await start(page);
  const before = await getActive(page);
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Preferencias de entrenamiento", exact: true }).click();
  await page.getByRole("radio", { name: "Peso en lb", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar preferencias", exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), prefKey)).toBeNull();
  await page.getByRole("button", { name: "Preferencias de entrenamiento", exact: true }).click();
  await page.getByRole("radio", { name: "Peso en lb", exact: true }).click();
  await page.getByLabel("Descanso habitual en segundos", { exact: true }).fill("120");
  const preferenceAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(preferenceAudit.violations).toEqual([]);
  await page.getByRole("button", { name: "Guardar preferencias", exact: true }).click();
  await expect(
    page.getByText("Preferencias guardadas en este dispositivo.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(
    page.getByText("≈ 132,28 lb", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "KG serie 1", exact: true })).toHaveValue("60");
  expect(await getActive(page)).toEqual(before);
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(
    page.getByText("≈ 132,28 lb", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(await getActive(page)).toEqual(before);
});
test("calentamientos: cuota y reintento no duplican; descanso explícito conserva temporizador", async ({
  page,
}) => {
  await start(page);
  const before = await getActive(page);
  await page.getByRole("button", { name: "Herramientas del ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Preparar calentamientos", exact: true }).click();
  await page.getByLabel("KG calentamiento 1").fill("20");
  await page.getByLabel("REPS calentamiento 1").fill("5");
  await page.getByRole("button", { name: "Revisar calentamientos", exact: true }).click();
  await page.evaluate((key) => {
    sessionStorage.setItem("t216-quota", "true");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key && sessionStorage.getItem("t216-quota") === "true")
        throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, k, v);
    };
  }, key);
  await page.getByRole("button", { name: "Añadir calentamientos", exact: true }).click();
  await expect(
    page
      .getByText(/No pudimos guardar en este dispositivo/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar herramientas", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 2", exact: true }),
  ).toBeChecked();
  await expect(await getActive(page)).toEqual(before);
  await page.evaluate(() => sessionStorage.setItem("t216-quota", "false"));
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect.poll(async () => (await getActive(page)).draft.exercises[0].sets.length).toBe(2);
  const after = await getActive(page);
  expect(after.draft.rest).toEqual(before.draft.rest);
  await page.getByRole("button", { name: "Herramientas del ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Ajustar descanso del ejercicio", exact: true }).click();
  await page.getByLabel("Descanso del ejercicio en segundos").fill("120");
  await page.getByRole("button", { name: "Revisar descanso", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar descanso", exact: true }).click();
  await expect.poll(async () => (await getActive(page)).draft.exercises[0].restSeconds).toBe(120);
  const changed = await getActive(page);
  expect(changed.draft.rest).toEqual(before.draft.rest);
  expect(changed.draft.exercises[0].sets).toEqual(after.draft.exercises[0].sets);
  expect(changed.routine).toEqual(before.routine);
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  expect((await getActive(page)).draft.exercises[0].sets).toHaveLength(2);
});

test("legado: calentamientos cancelables sin migrar formato ni tocar rutina", async ({ page }) => {
  await start(page, true);
  const before = await getActive(page);
  await page.getByRole("button", { name: "Herramientas del ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Preparar calentamientos", exact: true }).click();
  await page.getByLabel("KG calentamiento 1").fill("10");
  await page.getByLabel("REPS calentamiento 1").fill("6");
  await page.getByRole("button", { name: "Revisar calentamientos", exact: true }).click();
  await page.getByRole("button", { name: "Añadir calentamientos", exact: true }).click();
  await expect
    .poll(async () => (await getActive(page)).draft.exercises[0].sets.length)
    .toBe(before.draft.exercises[0].sets.length + 1);
  const after = await getActive(page);
  expect(after.draft.version).toBe(before.draft.version);
  expect(after.routine).toEqual(before.routine);
  expect(after.draft.exercises[0].sets.slice(1)).toEqual(before.draft.exercises[0].sets);
});

test("preferencias futuras intactas; no impiden recuperar registro ni permiten sobrescritura", async ({
  page,
}) => {
  await start(page);
  const original = await getActive(page);
  const unknown = JSON.stringify({ version: 99, userId, value: { future: true } });
  await page.evaluate(({ prefKey, unknown }) => localStorage.setItem(prefKey, unknown), {
    prefKey,
    unknown,
  });
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preferencias de entrenamiento", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/No pudimos leer tus preferencias/)).toBeVisible();
  await page.getByRole("button", { name: "Releer preferencias", exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), prefKey)).toBe(unknown);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  expect(await getActive(page)).toEqual(original);
});

test("preferencias en dos ventanas: conflicto explícito y propuesta conservada", async ({
  page,
  context,
}) => {
  await setupDownloadedWeek(page);
  const other = await context.newPage();
  await setupDownloadedWeek(other);
  for (const p of [page, other]) {
    await p.getByRole("button", { name: "Mi cuenta", exact: true }).click();
    await p.getByRole("button", { name: "Preferencias de entrenamiento", exact: true }).click();
  }
  await page.getByLabel("Descanso habitual en segundos").fill("120");
  await page.getByRole("button", { name: "Guardar preferencias", exact: true }).click();
  await expect(
    page.getByText("Preferencias guardadas en este dispositivo.", { exact: true }),
  ).toBeVisible();
  const confirmed = await page.evaluate((key) => localStorage.getItem(key), prefKey);
  await other.getByLabel("Descanso habitual en segundos").fill("60");
  await other.getByRole("button", { name: "Guardar preferencias", exact: true }).click();
  await expect(other.getByText(/Las preferencias cambiaron en otra ventana/)).toBeVisible();
  await expect(other.getByLabel("Descanso habitual en segundos")).toHaveValue("60");
  expect(await other.evaluate((key) => localStorage.getItem(key), prefKey)).toBe(confirmed);
  await other.getByRole("button", { name: "Releer y descartar propuesta", exact: true }).click();
  await other.getByRole("button", { name: "Preferencias de entrenamiento", exact: true }).click();
  await expect(other.getByLabel("Descanso habitual en segundos")).toHaveValue("120");
  await other.close();
});

for (const m of trainingMetricCases)
  test(`calentamiento tipado ${m.recordType ?? "legado"}: métricas propias y serie completada intacta`, async ({
    page,
  }) => {
    await start(page, false, m);
    const before = await getActive(page);
    await page.getByRole("button", { name: "Herramientas del ejercicio", exact: true }).click();
    await page.getByRole("button", { name: "Preparar calentamientos", exact: true }).click();
    const values = {
      weight: m.weightKg,
      reps: m.reps,
      duration: m.durationSeconds,
      distance: m.distanceMeters,
      effort: null,
    };
    for (const f of trainingFields(m.recordType))
      await page
        .getByLabel(`${f.label} calentamiento 1`, { exact: true })
        .fill(String(values[f.field]));
    await page.getByRole("button", { name: "Revisar calentamientos", exact: true }).click();
    await page.getByRole("button", { name: "Añadir calentamientos", exact: true }).click();
    await expect.poll(async () => (await getActive(page)).draft.exercises[0].sets.length).toBe(2);
    const after = await getActive(page);
    expect(after.draft.exercises[0].sets[1]).toEqual(before.draft.exercises[0].sets[0]);
    expect(after.draft.exercises[0].sets[0]).toMatchObject({
      setType: "warmup",
      done: false,
      effort: "",
    });
    expect(after.draft.rest).toEqual(before.draft.rest);
  });

test("referencia en lb: copiar mantiene kg canónicos y nunca convierte una serie completada", async ({
  page,
}) => {
  const control = await setupDownloadedWeek(page);
  control.pack.history[downloadId(5)].items = [
    {
      id: downloadId(90),
      startedAt: "2026-10-23T15:00:00Z",
      date: "2026-10-23",
      sessionLabel: "A",
      sets: [
        { id: downloadId(91), position: 0, setNumber: 1, weightKg: 47.5, reps: 7, isWarmup: false },
      ],
    },
  ];
  const value = { ...defaultTrainingPreferences(), weightUnit: "lb" as const };
  await page.evaluate(
    ({ prefKey, userId, value }) =>
      localStorage.setItem(prefKey, JSON.stringify({ version: 1, userId, value })),
    { prefKey, userId, value },
  );
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  const copy = page.getByRole("button", { name: "Copiar anterior a serie 1", exact: true });
  await expect(copy).toContainText("104,72 lb × 7");
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue("55");
  await copy.click();
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue(
    "47,5",
  );
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Ir a Sentadilla", exact: true }).click();
  await expect(copy).toBeDisabled();
  const saved = await getActive(page);
  expect(saved.draft.exercises[0].sets[0]).toMatchObject({ weight: "47,5", reps: "7", done: true });
});

test("una escritura de preferencias retenida bloquea borrar cuenta hasta confirmarse", async ({
  page,
}) => {
  await setupDownloadedWeek(page);
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Preferencias de entrenamiento", exact: true }).click();
  await page.getByLabel("Descanso habitual en segundos").fill("120");
  await page.evaluate((key) => {
    void navigator.locks.request("iron-strength-native-week:" + key, async () => {
      await new Promise<void>((resolve) => {
        Object.assign(window, { t216StorageLocked: true, t216ReleaseStorage: resolve });
      });
    });
  }, prefKey);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { t216StorageLocked?: boolean }).t216StorageLocked),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Guardar preferencias", exact: true }).click();
  const remove = page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true });
  await expect(remove).toBeDisabled();
  await page.evaluate(() =>
    (window as unknown as { t216ReleaseStorage: () => void }).t216ReleaseStorage(),
  );
  await expect(
    page.getByText("Preferencias guardadas en este dispositivo.", { exact: true }),
  ).toBeVisible();
  await expect(remove).toBeEnabled();
});

test("cambiar alternativa cancela la previa de calentamiento del tipo anterior sin registrar series", async ({
  page,
}) => {
  await setupDownloadedWeek(page);
  const prescribed = {
    recordType: "weight_reps",
    sets: 1,
    target: {
      repsMin: 8,
      repsMax: 10,
      targetWeightKg: 60,
      targetDurationSeconds: null,
      targetDistanceMeters: null,
    },
    series: null,
  };
  const routine = typedContextSchema.parse({
    version: 3,
    origin: { kind: "assigned", programId: downloadId(500), programSessionId: downloadId(501) },
    title: "Alternativas",
    sessionLabel: "A",
    exercises: [
      {
        sessionExerciseId: downloadId(217),
        exerciseId: downloadId(218),
        name: "Press",
        isBodyweight: false,
        prescribed,
        lastMetrics: null,
        restSeconds: 90,
        note: null,
        supersetId: null,
        supersetRestSeconds: null,
        alternatives: [
          {
            exerciseId: downloadId(219),
            name: "Plancha",
            isBodyweight: true,
            prescribed: {
              recordType: "duration",
              sets: 1,
              target: {
                repsMin: null,
                repsMax: null,
                targetWeightKg: null,
                targetDurationSeconds: 30,
                targetDistanceMeters: null,
              },
              series: null,
            },
            lastMetrics: null,
          },
        ],
      },
    ],
  });
  const draft = createTypedDraft({
    context: routine,
    userId,
    workoutId,
    now: new Date("2026-10-24T15:00:00Z"),
  });
  await page.evaluate(
    ({ key, routine, draft }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 4,
          userId: draft.userId,
          active: { mode: "real", routine, draft, activeIndex: 0 },
          demos: [],
        }),
      ),
    { key, routine, draft },
  );
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Herramientas del ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Preparar calentamientos", exact: true }).click();
  await page.getByLabel("KG calentamiento 1").fill("20");
  await page.getByLabel("REPS calentamiento 1").fill("5");
  await page.getByRole("button", { name: "Revisar calentamientos", exact: true }).click();
  await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Cambiar a Plancha", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preparar calentamientos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Añadir calentamientos", exact: true }),
  ).toHaveCount(0);
  const changed = await getActive(page);
  expect(changed.draft.exercises[0]).toMatchObject({ exerciseId: downloadId(219) });
  expect(changed.draft.exercises[0].sets).toHaveLength(1);
  expect(changed.draft.exercises[0].sets[0].done).toBe(false);
  await page.getByRole("button", { name: "Preparar calentamientos", exact: true }).click();
  await page.getByLabel("SEGUNDOS calentamiento 1").fill("10");
  await page.getByRole("button", { name: "Revisar calentamientos", exact: true }).click();
  await page.getByRole("button", { name: "Añadir calentamientos", exact: true }).click();
  await expect.poll(async () => (await getActive(page)).draft.exercises[0].sets.length).toBe(2);
  expect((await getActive(page)).draft.exercises[0].sets[0]).toMatchObject({
    weight: "",
    reps: "",
    duration: "10",
    done: false,
    setType: "warmup",
  });
});
