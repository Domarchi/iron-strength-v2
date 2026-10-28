import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupPersonalTraining } from "./support/personal-training-fixture";
import { libraryExercises } from "./support/library-fixture";
import { enterWeekUser } from "./support/week-fixture";
import { recordingFixture } from "../../src/test/fixtures/workout-recording";
import { recordingPayloadSchema } from "../../src/lib/mobile/recording-contracts";
import { downloadId } from "../../src/test/fixtures/week-download";
const key = `is:native-training:v1:${downloadId(1)}`;
async function setup(page: Page, structured = true, missing = false) {
  const fixture = await setupPersonalTraining(page),
    raw = recordingPayloadSchema.parse(recordingFixture("personal"));
  if (raw.source === "assigned") throw Error("fixture");
  raw.workout.startedAt = "2026-10-23T12:00:00Z";
  raw.workout.finishedAt = "2026-10-23T12:30:00Z";
  raw.structure.exercises.forEach((e, i) => {
    e.exerciseId = libraryExercises[i].id;
  });
  raw.workout.sets.forEach((e, i) => {
    e.exerciseId = libraryExercises[i].id;
  });
  raw.workout.sets[0].setNumber = 2;
  raw.workout.sets.unshift({
    ...raw.workout.sets[0],
    setNumber: 1,
    weightKg: 10.5,
    reps: 5,
    isWarmup: true,
  });
  const doc = recordingPayloadSchema.parse(raw);
  if (doc.source === "assigned") throw Error("fixture");
  if (missing) {
    doc.workout.sets[0].exerciseId = downloadId(999);
    doc.workout.sets[1].exerciseId = downloadId(999);
  }
  fixture.control.records.set(doc.id, doc.workout);
  if (structured) fixture.control.recordings.set(doc.id, doc);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: "Ver entrenamiento del 23/10", exact: true }).click();
  await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible();
  return { ...fixture, doc };
}
test("descanso habitual de grupo incompleto anterior se conserva al repetir y registrar", async ({
  page,
}) => {
  const { doc, control } = await setup(page);
  doc.structure.exercises.forEach((e) => {
    e.supersetRestSeconds = null;
    e.restSeconds = 0;
  });
  doc.workout.sets = doc.workout.sets.filter((s) => s.position === 0);
  control.records.set(doc.id, doc.workout);
  await page.getByRole("button", { name: "Repetir entrenamiento", exact: true }).click();
  await expect(
    page.getByText("Una superserie queda individual y conserva el descanso de la ronda.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 2", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).active.draft.rest?.totalSeconds,
        key,
      ),
    )
    .toBe(90);
  const row = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).active.routine.exercises[0],
    key,
  );
  expect(row.supersetId).toBeNull();
  expect(row.restSeconds).toBe(90);
});
for (const theme of ["light", "dark"] as const) {
  test(`repetir con estructura ${theme}: vista previa sin iniciar y copia con valores/grupos independientes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const { control, doc, state } = await setup(page);
    const original = structuredClone(doc);
    const repeat = page.getByRole("button", { name: "Repetir entrenamiento", exact: true });
    await expect(repeat).toBeVisible({ timeout: 2000 });
    await repeat.click();
    await expect(
      page.getByRole("heading", { name: "Repetir entrenamiento", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    expect(control.calls).toHaveLength(0);
    await expect(page.getByText("Superserie 1 · 60 s", { exact: true })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`repeat-preview-${theme}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue(
      "10,5",
    );
    await expect(
      page.getByRole("textbox", { name: "Repeticiones serie 1", exact: true }),
    ).toHaveValue("5");
    await expect(
      page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
    ).not.toBeChecked();
    const active = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
    expect(active.draft.workoutId).not.toBe(doc.id);
    expect(active.draft.origin).toEqual({ kind: "free" });
    expect(active.draft.programId).toBeNull();
    expect(active.draft.exercises[0].sets).toHaveLength(2);
    expect(active.draft.exercises[0].sets[0].isWarmup).toBe(true);
    expect(
      active.draft.exercises.every((e: { sets: { done: boolean }[] }) =>
        e.sets.every((s) => !s.done),
      ),
    ).toBe(true);
    expect(active.draft.exercises[0].supersetId).not.toBe(doc.structure.exercises[0].supersetId);
    expect(active.draft.exercises[0].supersetId).toBe(active.draft.exercises[1].supersetId);
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    expect(
      await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active.draft, key),
    ).toEqual(active.draft);
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
    await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible();
    expect(control.recordingCalls).toHaveLength(1);
    expect(control.recordingCalls[0]).toMatchObject({ source: "free" });
    expect(control.recordingCalls[0].id).not.toBe(doc.id);
    expect(control.recordings.get(doc.id)).toEqual(original);
    expect(state.value.routines).toEqual([]);
  });
}
test("histórico anterior prepara desde sus series, sin inventar la agrupación de una base", async ({
  page,
}) => {
  const { control, doc } = await setup(page, false);
  await page.getByRole("button", { name: "Repetir entrenamiento", exact: true }).click();
  await expect(
    page.getByText("Este resultado no guarda objetivos ni descansos.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  // The click starts an asynchronous catalog check and protected local write.
  // Navigation happens only after that write is verified; keep every persisted-data assertion.
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]+$/);
  const active = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
  expect(active.routine.exercises[0].supersetId).toBeNull();
  expect(active.draft.exercises[0].restSeconds).toBe(90);
  expect(active.draft.exercises[0].sets.map((s: { weight: string }) => s.weight)).toEqual([
    "10,5",
    "30",
  ]);
  expect(control.calls).toHaveLength(0);
  expect(control.records.get(doc.id)).toEqual(doc.workout);
});
test("un ejercicio no disponible bloquea la copia completa sin tocar el resultado", async ({
  page,
}) => {
  const { control } = await setup(page, false, true);
  await page.getByRole("button", { name: "Repetir entrenamiento", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "no está disponible" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(control.records.size).toBe(1);
});
test("otro entrenamiento en curso ofrece retomar y no permite sobrescribirlo", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Explorar otra rutina", exact: true }).click();
  await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
  await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
  const before = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: "Ver entrenamiento del 23/10", exact: true }).click();
  await page.getByRole("button", { name: "Repetir entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(before);
});
test("cuota al confirmar conserva la copia en memoria y reintentar no crea otro entrenamiento", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Repetir entrenamiento", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("is:native-training:") && !localStorage.getItem("allow-repeat"))
        throw Error("quota");
      return original.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos guardar" })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("allow-repeat", "1"));
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(page).toHaveURL(/\/workout\/[a-f0-9-]+$/);
  const first = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k) ?? "null")?.active?.draft?.workoutId,
        key,
      ),
    )
    .toBe(first);
});

test("si el catálogo cambia durante la revisión, pide actualizar antes de crear la copia", async ({
  page,
}) => {
  const { control } = await setup(page);
  await page.getByRole("button", { name: "Repetir entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toBeEnabled();
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/exercises", (route) =>
    route.fulfill({ json: { version: 1, exercises: libraryExercises.slice(1) } }),
  );
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "El catálogo cambió" })).toBeVisible({
    timeout: 2000,
  });
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(control.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "no está disponible" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toHaveCount(0);
});

test("volver atrás durante la comprobación no inicia una sesión al recibir la respuesta", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Repetir entrenamiento", exact: true }).click();
  const start = page.getByRole("button", { name: "Empezar entrenamiento", exact: true });
  await expect(start).toBeEnabled();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "https://iron-strength-seven.vercel.app/api/mobile/v1/exercises",
    async (route) => {
      await waiting;
      await route.fallback();
    },
  );
  const response = page.waitForResponse((r) => r.url().endsWith("/api/mobile/v1/exercises"));
  await start.click();
  await expect(start).toBeDisabled();
  await page.goBack();
  await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible();
  release();
  await response;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});
