import { openResultOptions } from "./support/result-options";
import { expect, test } from "@playwright/test";
import { setupRemoval } from "./support/removal-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
import { typedResultFixture } from "../../src/test/fixtures/typed-result";
import { enterWeekUser } from "./support/week-fixture";
const key = `is:workout-removal:v1:${downloadId(1)}`;
async function open(page: Parameters<typeof setupRemoval>[0]) {
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await openResultOptions(page);
  await page.getByRole("button", { name: "Eliminar entrenamiento", exact: true }).click();
}
test("descartar intento incierto requiere aviso y conserva confirmación remota como desconocida", async ({
  page,
}) => {
  const c = await setupRemoval(page);
  await open(page);
  c.lost = true;
  await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
  await expect(page.getByLabel("Estado de eliminación", { exact: true })).toHaveText(
    "Pendiente de confirmar en el servidor",
  );
  await page.getByRole("button", { name: "Descartar intento local", exact: true }).click();
  await expect(
    page.getByText(
      "Descartar este intento local no restaura el entrenamiento si el servidor ya lo eliminó.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar descarte del intento", exact: true }).click();
  await expect(
    page.getByText("Intento descartado en este dispositivo", { exact: true }),
  ).toBeVisible();
  expect(c.calls).toHaveLength(1);
  expect(c.deleted).toBe(true);
  await expect(page.getByText("Entrenamiento eliminado", { exact: true })).toHaveCount(0);
});
test("cuenta elimina formato futuro propio solo tras confirmar servidor y conserva otra cuenta", async ({
  page,
}) => {
  await setupRemoval(page);
  const other = `is:workout-removal:v1:${downloadId(99)}`;
  await page.evaluate(
    ({ key, other }) => {
      localStorage.setItem(key, '{"version":99}');
      localStorage.setItem(other, "another-account");
    },
    { key, other },
  );
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{"version":99}');
  let deleted = 0;
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/account/delete", (r) => {
    deleted++;
    return r.fulfill({ json: { version: 1, ok: true, userId: downloadId(1) } });
  });
  await page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }).click();
  await page.getByLabel("Confirmación de borrado de cuenta", { exact: true }).fill("BORRAR");
  await page.getByRole("button", { name: "Borrar mi cuenta para siempre", exact: true }).click();
  await expect(
    page.getByText(
      "Tu cuenta fue borrada del servidor y completamos la limpieza de este dispositivo.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(deleted).toBe(1);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(await page.evaluate((k) => localStorage.getItem(k), other)).toBe("another-account");
});
test("resultado tipado usa la misma confirmación sin convertir sus nueve métricas", async ({
  page,
}) => {
  const c = await setupRemoval(page),
    typed = typedResultFixture().result;
  typed.workout.id = c.correction.base.workout.id;
  c.correction.base.workout.title = typed.workout.title;
  c.correction.base.workout.sets = typed.workout.exercises.flatMap((e) =>
    e.sets.map((row) => ({
      ...row,
      position: e.position,
      exerciseId: e.exerciseId,
      exerciseName: e.name,
      prescribedExerciseId: e.prescribedExerciseId,
      prescribedExerciseName: null,
      sessionExerciseId: e.id,
      isWarmup: row.setType === "warmup",
    })),
  );

  await page.route(
    "https://iron-strength-seven.vercel.app/api/mobile/v1/typed-recordings/" + typed.workout.id,
    (r) => r.fulfill({ json: typed }),
  );
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await expect(page.getByText("Registro de todos los tipos", { exact: true })).toBeVisible();
  await openResultOptions(page);
  await page.getByRole("button", { name: "Eliminar entrenamiento", exact: true }).click();
  await expect(page.getByText("9 series · 2 comentarios", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
  await expect(page.getByText("Entrenamiento eliminado", { exact: true })).toBeVisible();
  expect(c.calls).toHaveLength(1);
});
test("eliminar otro resultado conserva el registro activo y su descanso absoluto", async ({
  page,
}) => {
  const c = await setupRemoval(page);
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
  const active = `is:native-training:v1:${downloadId(1)}`;
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).active.draft.exercises[0].sets[0].done,
        active,
      ),
    )
    .toBe(true);
  const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, active);
  expect(before.draft.rest).not.toBeNull();
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await open(page);
  await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
  await expect(page.getByText("Entrenamiento eliminado", { exact: true })).toBeVisible();
  expect(c.calls).toHaveLength(1);
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, active)).toEqual(
    before,
  );
});

test("otra ventana conserva sus bytes y la relectura exige confirmar la intención en memoria", async ({
  page,
}) => {
  const c = await setupRemoval(page);
  await open(page);
  c.lost = true;
  await page.getByRole("button", { name: "Eliminar para siempre", exact: true }).click();
  await expect(page.getByLabel("Estado de eliminación", { exact: true })).toHaveText(
    "Pendiente de confirmar en el servidor",
  );
  const original = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.evaluate((k) => localStorage.setItem(k, '{"version":99}'), key);
  await page.getByRole("button", { name: "Reintentar la misma eliminación", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Releer eliminación local", exact: true }),
  ).toBeVisible();
  expect(c.calls).toHaveLength(1);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{"version":99}');
  await page.getByRole("button", { name: "Releer eliminación local", exact: true }).click();
  await expect(page.getByText(/Se reemplazará el intento en memoria/)).toBeVisible();
  await page
    .getByRole("button", { name: "Volver a comprobar la eliminación", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Releer eliminación local", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{"version":99}');
  await page.evaluate(({ key, original }) => localStorage.setItem(key, original!), {
    key,
    original,
  });
  await page.getByRole("button", { name: "Releer eliminación local", exact: true }).click();
  await page
    .getByRole("button", { name: "Volver a comprobar la eliminación", exact: true })
    .click();
  await page.getByRole("button", { name: "Reintentar la misma eliminación", exact: true }).click();
  await expect(page.getByText("Entrenamiento eliminado", { exact: true })).toBeVisible();
  expect(c.calls).toHaveLength(2);
  expect(c.calls[0]).toEqual(c.calls[1]);
});
