import { enterWeekUser } from "./support/week-fixture";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupCorrection } from "./support/correction-fixture";
import { typedResultFixture } from "../../src/test/fixtures/typed-result";
import { workoutCorrectionSnapshotSchema } from "../../src/lib/mobile/workout-correction-contracts";
import { downloadId } from "../../src/test/fixtures/week-download";
const key = `is:workout-correction:v1:${downloadId(1)}`;
for (const theme of ["light", "dark"] as const) {
  test(`corregir, recuperar y confirmar resultado sin duplicados · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const c = await setupCorrection(page);
    await page.getByRole("tab", { name: "Historial", exact: true }).click();
    await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
    await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
    await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("62,");
    await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
      "Guardado en este dispositivo",
    );
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await page.getByRole("button", { name: "Retomar corrección", exact: true }).click();
    await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("62,");
    await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("62,5");
    await page.getByLabel("Nota del entrenamiento", { exact: true }).fill("Más control");
    await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
    await expect(
      page.getByText("2 series conservadas · 0 retiradas", { exact: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`correction-${theme}-360.png`),
      fullPage: true,
    });
    c.loseResponse = true;
    await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
    await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
      "Pendiente de confirmar en el servidor",
    );
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await page.getByRole("button", { name: "Retomar corrección", exact: true }).click();
    await page.getByRole("button", { name: "Reintentar el mismo envío", exact: true }).click();
    await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
    expect(c.calls).toHaveLength(2);
    expect(c.calls[1]).toEqual(c.calls[0]);
    expect(c.calls[0].sets[0].metrics.weightKg).toBe(62.5);
    expect(
      JSON.parse((await page.evaluate((k) => localStorage.getItem(k), key))!).pending,
    ).toBeNull();
    await page.getByRole("button", { name: "Ver resultado", exact: true }).click();
    await expect(page.getByText("62,5 kg × 8 reps", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
    await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("62,5");
  });
}
test("Cuenta protege corrección pendiente y descarte explícito conserva el resultado", async ({
  page,
}) => {
  const c = await setupCorrection(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  await page.getByLabel("Repeticiones de serie 1", { exact: true }).fill("9");
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Guardado en este dispositivo",
  );
  await page.getByRole("button", { name: "Volver sin descartar", exact: true }).click();
  await page.getByRole("button", { name: "Ver mi historial", exact: true }).click();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retomar corrección", exact: true }).click();
  await expect(page.getByLabel("Repeticiones de serie 1", { exact: true })).toHaveValue("9");
  await page.getByRole("button", { name: "Descartar corrección", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar descarte de corrección", exact: true }).click();
  await expect(
    page.getByText("Corrección descartada en este dispositivo", { exact: true }),
  ).toBeVisible();
  expect(c.calls).toEqual([]);
  await page.getByRole("button", { name: "Volver sin descartar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
});
test("conflicto conserva campos locales y exige revisar la versión actual", async ({ page }) => {
  const c = await setupCorrection(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("65");
  await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
  c.conflict = true;
  c.base.workout.revision = 8;
  c.base.workout.note = "Nota desde otra ventana";
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await page.getByRole("button", { name: "Comparar con versión actual", exact: true }).click();
  await expect(page.getByText("Nota desde otra ventana", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Aceptar versión revisada", exact: true }).click();
  await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("65");
  await expect(page.getByLabel("Nota del entrenamiento", { exact: true })).toHaveValue(
    "Nota desde otra ventana",
  );
  c.conflict = false;
  await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
  expect(c.calls[1].expectedRevision).toBe(8);
  expect(c.calls[1].requestId).not.toBe(c.calls[0].requestId);
});

test("cuota conserva texto, impide enviar y permite proteger sin crear otro intento", async ({
  page,
}) => {
  const c = await setupCorrection(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("60");
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key && !localStorage.getItem("allow-correction-write")) throw Error("quota");
      return original.call(this, k, v);
    };
  }, key);
  await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("67,");
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Cambios pendientes de guardar en este dispositivo",
  );
  await expect(
    page.getByRole("button", { name: "Revisar corrección", exact: true }),
  ).toBeDisabled();
  expect(c.calls).toEqual([]);
  await page.evaluate(() => localStorage.setItem("allow-correction-write", "1"));
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Guardado en este dispositivo",
  );
  await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("67,");
});

test("otra ventana no se sobrescribe y releer exige confirmar la pérdida de memoria", async ({
  page,
  context,
}) => {
  const c = await setupCorrection(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("61");
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Guardado en este dispositivo",
  );
  const second = await context.newPage();
  await setupCorrection(second);
  await second.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await second.getByRole("button", { name: "Retomar corrección", exact: true }).click();
  await second.getByLabel("Peso en kg de serie 1", { exact: true }).fill("63");
  await expect(second.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Guardado en este dispositivo",
  );
  await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("65");
  await expect(
    page.getByText(/La corrección local cambió en otra ventana/).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Releer corrección local", exact: true }).click();
  await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("65");
  await page.getByRole("button", { name: "Confirmar relectura local", exact: true }).click();
  await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("63");
  expect(c.calls).toEqual([]);
  await second.close();
});

test("formato futuro bloquea salir, se conserva y solo borrar cuenta confirmado lo retira", async ({
  page,
}) => {
  const c = await setupCorrection(page);
  const other = "is:workout-correction:v1:22222222-2222-4222-8222-222222222222";
  await page.evaluate(
    ({ key, other }) => {
      localStorage.setItem(key, '{"version":99}');
      localStorage.setItem(other, "otra cuenta");
    },
    { key, other },
  );
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{"version":99}');
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/account/delete", (r) =>
    r.fulfill({ json: { version: 1, ok: true, userId: downloadId(1) } }),
  );
  await page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }).click();
  await page.getByLabel("Confirmación de borrado de cuenta", { exact: true }).fill("BORRAR");
  await page.getByRole("button", { name: "Borrar mi cuenta para siempre", exact: true }).click();
  await expect(
    page.getByText(
      "Tu cuenta fue borrada del servidor y completamos la limpieza de este dispositivo.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(await page.evaluate((k) => localStorage.getItem(k), other)).toBe("otra cuenta");
  expect(c.calls).toEqual([]);
});

test("corrección de nueve tipos conserva dimensiones y notas de filas sin series", async ({
  page,
}) => {
  const c = await setupCorrection(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await expect(
    page.getByRole("button", { name: "Corregir entrenamiento", exact: true }),
  ).toBeVisible();
  const w = typedResultFixture().result.workout;
  const empty = { ...w.structure.exercises[0], id: downloadId(9910), exerciseId: downloadId(9911) };
  c.base = workoutCorrectionSnapshotSchema.parse({
    ...c.base,
    workout: {
      ...c.base.workout,
      sourceKind: "free",
      structure: { ...w.structure, exercises: [...w.structure.exercises, empty] },
      exerciseNotes: [
        ...w.exercises.map((e) => ({ sessionExerciseId: e.id, note: e.athleteNote })),
        { sessionExerciseId: empty.id, note: "Nota sin series" },
      ],
      sets: w.exercises.flatMap((e) =>
        e.sets.map((s) => ({
          ...s,
          position: e.position,
          exerciseId: e.exerciseId,
          exerciseName: e.name,
          prescribedExerciseId: e.prescribedExerciseId,
          prescribedExerciseName: null,
          sessionExerciseId: e.id,
          isWarmup: s.setType === "warmup",
        })),
      ),
    },
  });
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  const fields = ["weightKg", "reps", "durationSeconds", "distanceMeters"] as const;
  const labels = {
    weightKg: "Peso en kg",
    reps: "Repeticiones",
    durationSeconds: "Segundos",
    distanceMeters: "Metros",
  };
  for (const e of w.exercises) {
    await page.getByRole("button", { name: e.name, exact: true }).click();
    const metrics = e.sets[0].metrics;
    for (const field of fields) {
      const input = page.getByLabel(`${labels[field]} de serie 1`, { exact: true });
      if (metrics[field] === null) await expect(input).toHaveCount(0);
      else await expect(input).toHaveValue(String(metrics[field]).replace(".", ","));
    }
    const dimension = fields.find((f) => metrics[f] !== null)!;
    await page
      .getByLabel(`${labels[dimension]} de serie 1`, { exact: true })
      .fill(String(metrics[dimension]! + 1).replace(".", ","));
  }
  await page.getByRole("button", { name: "Al fallo", exact: true }).click();
  await page.getByLabel("Esfuerzo de serie 1", { exact: true }).fill("9");
  await page.getByRole("button", { name: "Ejercicio 10", exact: true }).click();
  await expect(page.getByText("Sin series registradas", { exact: true })).toBeVisible();
  await page.getByLabel("Nota del ejercicio", { exact: true }).fill("Conservar nota sin series");
  await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
  await expect(page.getByText("Conservar nota sin series", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
  expect(c.calls).toHaveLength(1);
  expect(c.calls[0].sets).toHaveLength(9);
  expect(c.calls[0].sets.map((s) => s.metrics.recordType)).toEqual(
    w.exercises.map((e) => e.prescribed.recordType),
  );
  expect(c.calls[0].sets[8]).toMatchObject({ setType: "failure", effort: 9 });
  expect(c.calls[0].exerciseNotes?.at(-1)).toEqual({
    sessionExerciseId: empty.id,
    note: "Conservar nota sin series",
  });
});

test("retirar series exige revisión y conserva al menos una sin borrar el entrenamiento", async ({
  page,
}) => {
  const c = await setupCorrection(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Retirar serie 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retirar serie 2", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
  await expect(page.getByText("1 serie conservada · 1 retirada", { exact: true })).toBeVisible();
  expect(c.calls).toEqual([]);
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
  expect(c.calls[0].sets).toHaveLength(1);
  expect(c.calls[0].sets[0].id).toBe(downloadId(9901));
});

test("borrar cuenta espera una escritura de corrección retenida antes de solicitarlo", async ({
  page,
}) => {
  await setupCorrection(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("60");
  await page.evaluate((key) => {
    void navigator.locks.request("iron-strength-native-week:" + key, async () => {
      await new Promise<void>((resolve) =>
        Object.assign(window, { t218Locked: true, t218Unlock: resolve }),
      );
    });
  }, key);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { t218Locked?: boolean }).t218Locked))
    .toBe(true);
  await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("64");
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Cambios pendientes de guardar en este dispositivo",
  );
  await page.getByRole("button", { name: "Volver sin descartar", exact: true }).click();
  await page.getByRole("button", { name: "Ver mi historial", exact: true }).click();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  let deletes = 0;
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/account/delete", (r) => {
    deletes++;
    return r.fulfill({ json: { version: 1, ok: true, userId: downloadId(1) } });
  });
  await page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }).click();
  await page.getByLabel("Confirmación de borrado de cuenta", { exact: true }).fill("BORRAR");
  await page.getByRole("button", { name: "Borrar mi cuenta para siempre", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retomar corrección", exact: true }),
  ).toBeDisabled();
  expect(deletes).toBe(0);
  await page.evaluate(() => (window as unknown as { t218Unlock: () => void }).t218Unlock());
  await expect(
    page.getByText(
      "Tu cuenta fue borrada del servidor y completamos la limpieza de este dispositivo.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(deletes).toBe(1);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});

test("corregir un resultado conserva íntegro el entrenamiento activo y su descanso", async ({
  page,
}) => {
  const c = await setupCorrection(page);
  await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
  await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
  await page
    .getByRole("button", { name: "Agregar ejercicios", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
  await page.getByRole("button", { name: "Agregar 1 ejercicio", exact: true }).click();
  await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("30");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  const activeKey = `is:native-training:v1:${downloadId(1)}`;
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).active.draft.exercises[0].sets[0].done,
        activeKey,
      ),
    )
    .toBe(true);
  const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, activeKey);
  expect(before.draft.rest).not.toBeNull();
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  await page.getByLabel("Repeticiones de serie 1", { exact: true }).fill("9");
  await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
  expect(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, activeKey),
  ).toEqual(before);
  expect(c.calls).toHaveLength(1);
});
