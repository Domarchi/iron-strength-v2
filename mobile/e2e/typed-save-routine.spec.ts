import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupTypedPersonalLibrary } from "./support/typed-library-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
import { typedPersonalLibrarySchema } from "../../src/lib/mobile/typed-personal-contracts";
import { trainingTotals } from "../../src/domain/training-metrics";
const api = "https://iron-strength-seven.vercel.app/api/mobile/v1",
  key = `is:native-library:v1:${downloadId(1)}`;
async function setup(page: Page) {
  const { state, fixture } = await setupTypedPersonalLibrary(page),
    w = fixture.result.workout;
  w.sourceKind = "personal";
  w.personalRoutineId = downloadId(4000);
  w.personalRoutineRevision = 3;
  w.exercises[5].sets = [];
  const totals = trainingTotals(
    w.exercises.flatMap((e) =>
      e.sets.map((s) => ({ ...s.metrics, setType: s.setType, effort: s.effort })),
    ),
  );
  Object.assign(w.summary, {
    workingSets: totals.workingSets,
    recordedSeconds: totals.durationSeconds,
    distanceMeters: totals.distanceMeters,
    volumeKg: totals.externalVolumeKg,
    bodyweightReps: totals.bodyweightReps,
    exerciseCount: 8,
  });
  const base = {
    id: w.personalRoutineId,
    name: "Base actual",
    folderId: null,
    revision: 4,
    position: 0,
    createdAt: w.startedAt,
    updatedAt: w.startedAt,
    items: w.structure.exercises.map((r, i) => ({
      ...fixture.catalog.exercises[i],
      id: downloadId(4100 + i),
      exerciseId: r.exerciseId,
      position: i,
      prescribed: structuredClone(r.prescribed),
      note: r.note ?? "",
      restSeconds: r.restSeconds,
      supersetId: r.supersetId,
      supersetRestSeconds: r.supersetRestSeconds,
    })),
  };
  base.items[5].prescribed.target.targetDurationSeconds = 45;
  state.value = typedPersonalLibrarySchema.parse({ ...state.value, routines: [base] });
  await page.route(api + "/typed-recordings/" + w.id, (route) =>
    route.fulfill({ json: fixture.result }),
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
  await page.getByRole("button", { name: "Volver a Entrenar", exact: true }).click();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: "Ver entrenamiento del 27/10", exact: true }).click();
  await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
  return { state, fixture, base };
}
for (const theme of ["light", "dark"] as const)
  test(`resultado3 ${theme} prepara todos los objetivos, incluso sin series, sin notas propias`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 360, height: 800 });
    const { state, fixture, base } = await setup(page),
      before = JSON.stringify(fixture.result),
      original = structuredClone(base);
    await page.getByRole("button", { name: "Guardar como rutina", exact: true }).click();
    await expect(page.getByText("Nueva rutina · 9 ejercicios", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Nota propia 0", { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
    expect(state.calls).toHaveLength(0);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath("typed-save-preview.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Continuar al editor", exact: true }).click();
    await expect(page.getByLabel("Tiempo de Movimiento 5", { exact: true })).toHaveValue("60");
    const doc = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
    expect(doc.version).toBe(2);
    expect(doc.drafts[0].items).toHaveLength(9);
    expect(JSON.stringify(doc.drafts)).not.toContain("Nota propia");
    expect(JSON.stringify(doc.drafts)).not.toContain("effort");
    await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Ver rutina Registro de todos los tipos", exact: true }),
    ).toBeVisible();
    expect(state.value.routines).toHaveLength(2);
    expect(state.value.routines.find((r) => r.id === base.id)).toEqual(original);
    expect(
      state.value.routines.find((r) => r.id !== base.id)!.items[5].prescribed.target
        .targetDurationSeconds,
    ).toBe(60);
    expect(JSON.stringify(fixture.result)).toBe(before);
  });
test("resultado3 actualiza tras comparar revisión y mantiene base/resultado originales hasta confirmar", async ({
  page,
}) => {
  const { state, fixture, base } = await setup(page),
    before = JSON.stringify(fixture.result);
  await page.getByRole("button", { name: "Actualizar mi rutina", exact: true }).click();
  await expect(
    page.getByText("La base cambió desde este entrenamiento. Revisa lo que vas a reemplazar.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Base actual · Base actual", { exact: true })).toBeVisible();
  expect(state.value.routines[0].items[5].prescribed.target.targetDurationSeconds).toBe(45);
  await page
    .getByRole("button", { name: "Revisar actualización en el editor", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Nombre de la rutina", exact: true })).toHaveValue(
    base.name,
  );
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Base actual", exact: true }),
  ).toBeVisible();
  expect(state.calls[0]).toMatchObject({
    version: 2,
    operation: "routine_save",
    targetId: base.id,
    expectedRevision: 4,
  });
  expect(state.value.routines).toHaveLength(1);
  expect(state.value.routines[0].items[5].prescribed.target.targetDurationSeconds).toBe(60);
  expect(JSON.stringify(fixture.result)).toBe(before);
});
