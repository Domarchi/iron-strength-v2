import { downloadCard } from "./support/download-cache";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek, setWeekConnectivity, enterWeekUser } from "./support/week-fixture";
import { trainingDownloadFixture } from "../../src/test/fixtures/training-download";
import { bundleSchema } from "../../src/lib/offline/training-bundle";
import { downloadId } from "../../src/test/fixtures/week-download";
import { assignedId as id } from "../../src/test/fixtures/assigned-training";
import {
  typedRecordingRequestSchema,
  type TypedRecordingPayload,
} from "../../src/lib/mobile/typed-recording-contracts";
const api = "https://iron-strength-seven.vercel.app/api/mobile/v1";
const userId = downloadId(1),
  key = `is:native-training:v1:${userId}`;
async function setup(page: Page, week = true) {
  const control = await setupDownloadedWeek(page);
  await page.clock.setFixedTime(new Date("2026-10-29T15:00:00Z"));
  const fixture = trainingDownloadFixture();
  fixture.userId = fixture.library.userId = fixture.week.sessions[0].context.userId = userId;
  const bundle = bundleSchema.parse(fixture);
  if (!week) bundle.week = null;
  const state = {
    bundle,
    calls: 0,
    invalid: false,
    lose: false,
    sent: [] as TypedRecordingPayload[],
    saved: new Map<string, string>(),
  };
  await page.route(api + "/training-download", async (route) => {
    state.calls++;
    if (control.offline) return route.abort();
    return route.fulfill({ json: state.invalid ? { ...state.bundle, history: {} } : state.bundle });
  });
  await page.route(api + "/typed-recordings", async (route) => {
    const p = typedRecordingRequestSchema.parse(route.request().postDataJSON()).payload;
    state.sent.push(p);
    const before = state.saved.get(p.id),
      encoded = JSON.stringify(p);
    if (before && before !== encoded) throw Error("Changed retry body");
    state.saved.set(p.id, encoded);
    if (state.lose) {
      state.lose = false;
      return route.abort();
    }
    return route.fulfill({
      json: { version: 3, ok: true, workoutId: p.id, status: before ? "duplicate" : "created" },
    });
  });
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Entrenar", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Entrenar", exact: true })).toBeVisible();
  return { control, state };
}
async function download(page: Page) {
  await downloadCard(page)
    .getByRole("button", { name: "Descargar entrenamientos", exact: true })
    .click();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
}
for (const theme of ["light", "dark"] as const)
  test(`descarga completa ${theme}: catálogo, historial, personal y cierre sin red`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const { control, state } = await setup(page, false);
    await download(page);
    expect(control.requests).toBe(0);
    control.offline = true;
    await setWeekConnectivity(page, false);
    await page.getByRole("button", { name: "Biblioteca de ejercicios", exact: true }).click();
    await expect(
      page.getByText("Catálogo descargado · sin conexión", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ver ejercicio Ejercicio", exact: true }).click();
    await expect(page.getByText(/Historial descargado/)).toBeVisible();
    await expect(
      page.getByText("Aún no has registrado este ejercicio.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Volver a la biblioteca", exact: true }).click();
    await page.getByRole("button", { name: "Volver a Entrenar", exact: true }).click();
    await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
    await page.getByRole("button", { name: "Ver rutina Personal", exact: true }).click();
    await expect(page.getByText("Control", { exact: true })).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await expect(page.getByLabel("SEGUNDOS serie 1", { exact: true })).toHaveValue("");
    await expect(page.getByText("60 s", { exact: true }).filter({ visible: true })).toHaveCount(3);
    await page.getByLabel("SEGUNDOS serie 1", { exact: true }).fill("60");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Historial descargado", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Omitir descanso", exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`downloaded-personal-${theme}.png`),
      fullPage: true,
    });
    const rest = await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).active.draft.rest.endsAt,
      key,
    );
    control.offline = false;
    await page.reload();
    await enterWeekUser(page);
    control.offline = true;
    await setWeekConnectivity(page, false);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
    ).toBeChecked();
    expect(
      await page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).active.draft.rest.endsAt,
        key,
      ),
    ).toBe(rest);
    await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
    await page.getByRole("button", { name: "Guardar en este dispositivo", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (uid) =>
            JSON.parse(localStorage.getItem(`is:native-sync:v1:${uid}`) ?? '{"entries":[]}').entries
              .length,
          userId,
        ),
      )
      .toBe(1);
    expect(state.sent).toHaveLength(0);
    const frozen = await page.evaluate(
      (uid) => JSON.parse(localStorage.getItem(`is:native-sync:v1:${uid}`)!).entries[0].payload,
      userId,
    );
    expect(frozen).toMatchObject({
      version: 3,
      source: "personal",
      workout: { origin: { kind: "personal", routineId: id(9), revision: 1 } },
    });
    expect(frozen.workout.sets[0].metrics).toEqual({
      recordType: "duration",
      weightKg: null,
      reps: null,
      durationSeconds: 60,
      distanceMeters: null,
    });
    await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Entrenamiento libre", exact: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    // The fake server commits before the dropped response. The second send must be byte-identical.
    state.lose = true;
    control.offline = false;
    await setWeekConnectivity(page, true);
    await expect.poll(() => state.sent.length).toBe(1);
    await expect(
      page
        .getByText("No pudimos conectar. Revisa tu conexión y reintenta.", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Conectar", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (uid) =>
            JSON.parse(localStorage.getItem(`is:native-sync:v1:${uid}`)!).entries.filter(
              (e: { phase: string }) => e.phase === "pending",
            ).length,
          userId,
        ),
      )
      .toBe(0);
    const confirmed = await page.evaluate(
      (uid) =>
        JSON.parse(localStorage.getItem(`is:native-sync:v1:${uid}`)!)
          .entries.filter((e: { phase: string }) => e.phase === "confirmed")
          .map((e: { payload: { id: string } }) => e.payload.id),
      userId,
    );
    expect(confirmed).toEqual([frozen.id]);
    expect(state.saved.size).toBe(1);
    expect(state.sent).toEqual([frozen, frozen]);
    await expect(
      page.getByRole("button", { name: "Ver resultado del último envío", exact: true }),
    ).toBeVisible();
  });
test("paquete asignado tipado se consulta sin crear registro y no inicia fuera de semana", async ({
  page,
}) => {
  const { control } = await setup(page);
  await download(page);
  control.offline = true;
  await setWeekConnectivity(page, false);
  await page
    .getByRole("button", { name: "Consultar rutina descargada A", exact: true })
    .click({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Fuerza y control", exact: true })).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toBeEnabled();
  await page.clock.setFixedTime(new Date("2026-11-02T15:00:00Z"));
  control.offline = false;
  await page.reload();
  await enterWeekUser(page);
  control.offline = true;
  await setWeekConnectivity(page, false);
  await page
    .getByRole("button", { name: "Consultar rutina descargada A", exact: true })
    .click({ timeout: 10000 });
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Puedes consultar esta copia/)).toBeVisible();
});
test("respuesta incompleta conserva la copia completa y un inicio libre usa su catálogo", async ({
  page,
}) => {
  const { control, state } = await setup(page, false);
  await download(page);
  state.invalid = true;
  await page
    .getByRole("button", { name: "Actualizar entrenamientos descargados", exact: true })
    .click();
  await expect(
    downloadCard(page)
      .getByRole("alert")
      .filter({ hasText: "La descarga requiere una versión compatible" }),
  ).toBeVisible();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
  expect(control.requests).toBe(0);
  control.offline = true;
  await setWeekConnectivity(page, false);
  await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
  await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  await page.getByRole("checkbox", { name: "Seleccionar Ejercicio", exact: true }).check();
  await page.getByRole("button", { name: "Agregar 1 ejercicio", exact: true }).click();
  await expect(page.getByLabel("SEGUNDOS serie 1", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).active.draft.exercises[0].exerciseId,
      key,
    ),
  ).toBe(id(5));
});
async function changeSavedBundle(page: Page, unknown = false) {
  return page.evaluate(
    ({ uid, unknown }) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("iron-strength-training-download", 1);
        opening.onerror = () => reject(Error("open"));
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction("bundles", "readwrite"),
            store = tx.objectStore("bundles");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = tx.onerror = () => {
            db.close();
            reject(Error("transaction"));
          };
          const get = store.get(uid);
          get.onsuccess = () => {
            const before = get.result;
            if (!before) throw Error("Missing original bundle");
            const value = JSON.parse(before.raw);
            value.bundle.library.routines[0].revision = 2;
            value.bundle.library.routines[0].name = "Personal revisada";
            store.put({ userId: uid, raw: unknown ? '{"version":99}' : JSON.stringify(value) });
          };
        };
      }),
    { uid: userId, unknown },
  );
}
for (const unknown of [false, true])
  test(`inicio relee la copia ${unknown ? "futura" : "modificada"} y conserva el registro sin sobrescribir`, async ({
    page,
  }) => {
    const { control } = await setup(page, false);
    await download(page);
    control.offline = true;
    await setWeekConnectivity(page, false);
    await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
    await page.getByRole("button", { name: "Ver rutina Personal", exact: true }).click();
    await changeSavedBundle(page, unknown);
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await expect(
      page
        .getByText(
          unknown
            ? /La descarga requiere una versión compatible/
            : /La rutina cambió. Vuelve a revisar/,
        )
        .filter({ visible: true }),
    ).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    if (!unknown) {
      await expect(
        page.getByRole("heading", { name: "Personal revisada", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
      await expect(page.getByLabel("SEGUNDOS serie 1", { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          (k) => JSON.parse(localStorage.getItem(k)!).active.routine.origin.revision,
          key,
        ),
      ).toBe(2);
    }
  });
test("historial descargado conserva tiempo, esfuerzo y notas; actualizar la copia no modifica el registro iniciado", async ({
  page,
}) => {
  const { control, state } = await setup(page, false);
  const detail = state.bundle.history[id(5)];
  detail.history.items = [
    {
      id: id(80),
      startedAt: "2026-10-28T12:00:00Z",
      date: "2026-10-28",
      sessionLabel: null,
      sourceKind: "personal",
      title: "Referencia previa",
      exerciseNotes: [{ position: 0, note: "Controlé el ritmo" }],
      sets: [
        {
          id: id(81),
          position: 0,
          setNumber: 1,
          setType: "failure",
          effort: 8.5,
          metrics: {
            recordType: "duration",
            weightKg: null,
            reps: null,
            durationSeconds: 90,
            distanceMeters: null,
          },
        },
      ],
    },
  ];
  state.bundle = bundleSchema.parse(state.bundle);
  await download(page);
  // The preview is downloaded; remote writes remain online-only.
  control.offline = true;
  await setWeekConnectivity(page, false);
  await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
  await page.getByRole("button", { name: "Ver rutina Personal", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
  await expect(page.getByText("Controlé el ritmo", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Al fallo 1 · 90 s · Esfuerzo 8,5\/10|Al fallo 1 · 90 s · Esfuerzo 8.5\/10/),
  ).toBeVisible();
  const original = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  control.offline = false;
  await setWeekConnectivity(page, true);
  await expect(page.getByRole("tab", { name: "Entrenar", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Entrenar", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Entrenar", exact: true })).toBeVisible();
  // No pending close exists, so reconnect explicitly before fetching a new snapshot.
  const connect = page.getByRole("button", { name: "Conectar", exact: true });
  if (await connect.isVisible()) await connect.click();
  state.bundle = bundleSchema.parse({
    ...state.bundle,
    downloadedAt: "2026-10-29T12:01:00Z",
    library: {
      ...state.bundle.library,
      routines: state.bundle.library.routines.map((r) => ({
        ...r,
        revision: 2,
        name: "Para la próxima sesión",
      })),
    },
  });
  await page
    .getByRole("button", { name: "Actualizar entrenamientos descargados", exact: true })
    .click();
  await expect.poll(() => state.calls).toBe(2);
  await expect(
    downloadCard(page)
      .getByText(/Disponible sin conexión/)
      .filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(original);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal", exact: true })).toBeVisible();
});
