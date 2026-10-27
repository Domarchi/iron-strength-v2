import type { RecordingPayload } from "../../src/lib/mobile/recording-contracts";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { fulfillEmptyCommentReads } from "./support/comment-fixture";
import { setWeekConnectivity } from "./support/week-fixture";
const id = "11111111-1111-4111-8111-111111111111";
const exercise = "22222222-2222-4222-8222-222222222222";
const group = "33333333-3333-4333-8333-333333333333";
const session = {
  version: 1,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4000000000,
  profile: { id, fullName: "Ana Prueba", email: "ana@example.test", role: "student" },
};
const program = {
  id,
  name: "Fuerza · cuatro semanas",
  weeksCount: 4,
  startDate: "2026-10-19",
  endsOn: "2026-11-15",
};
const uniform = { sets: 2, repsMin: 8, repsMax: 10, targetWeightKg: 40 };
const routine = {
  version: 1,
  session: {
    id,
    programId: id,
    label: "A",
    title: "Tren inferior",
    programName: program.name,
    weekNumber: 1,
    weeksCount: 4,
  },
  exercises: [
    {
      exerciseId: exercise,
      sessionExerciseId: exercise,
      name: "Sentadilla",
      isBodyweight: false,
      prescribed: {
        sets: 2,
        repsMin: 6,
        repsMax: 10,
        targetWeightKg: null,
        series: [
          { repsMin: 6, repsMax: 6, targetWeightKg: 50 },
          { repsMin: 8, repsMax: 10, targetWeightKg: 45 },
        ],
      },
      note: "Baja con control",
      restSeconds: null,
      supersetId: group,
      supersetRestSeconds: 90,
      alternatives: [{ exerciseId: id, name: "Prensa", isBodyweight: false, prescribed: uniform }],
    },
    {
      exerciseId: id,
      sessionExerciseId: id,
      name: "Peso muerto rumano",
      isBodyweight: false,
      prescribed: uniform,
      note: null,
      restSeconds: null,
      supersetId: group,
      supersetRestSeconds: 90,
      alternatives: [],
    },
  ],
};
async function enter(page: Page) {
  await page.goto("/");
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
test("acceso → semana → rutina y alternativas; consulta sin escrituras ni tokens web persistidos", async ({
  page,
}) => {
  const seen: string[] = [];
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    seen.push(route.request().method() + " " + path);
    if (await fulfillEmptyCommentReads(route)) return;
    const data = path.endsWith("auth/login")
      ? session
      : path.endsWith("auth/logout")
        ? { version: 1, ok: true }
        : path.endsWith("week")
          ? {
              version: 1,
              kind: "active",
              program,
              weekNumber: 1,
              weekStart: "2026-10-19",
              weekEnd: "2026-10-25",
              sessions: [
                {
                  sessionId: id,
                  label: "A",
                  title: "Tren inferior",
                  status: "pending",
                  exerciseCount: 2,
                  setCount: 4,
                  exerciseNames: ["Sentadilla", "Peso muerto rumano"],
                  scheduledOn: "2026-10-23",
                },
              ],
            }
          : routine;
    await route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await enter(page);
  await expect(page.getByText("Hola, Ana")).toBeVisible();
  await expect(page.getByText("SIGUIENTE SESIÓN", { exact: true })).toBeVisible();
  await expect(page.getByText("0 de 1 sesiones completadas")).toBeVisible();
  for (const tab of await page.getByRole("tab").all()) {
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  await page.screenshot({ path: test.info().outputPath("home-light.png") });
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await expect(page.getByText("SUPERSERIE · 90 s al terminar la ronda")).toBeVisible();
  await expect(page.getByText("1. 6 reps · 50 kg", { exact: true })).toBeVisible();
  await expect(page.getByText("2. 8–10 reps · 45 kg", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver alternativas de Sentadilla", exact: true }).click();
  await expect(page.getByText("Prensa", { exact: true })).toBeVisible();
  await expect(page.getByText("Baja con control", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(seen.filter((x) => x.startsWith("POST") && !x.endsWith("auth/login"))).toEqual([]);
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: test.info().outputPath("routine.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
});
test("error de red conserva el recorrido y permite reintentar; estados vacíos y tema oscuro desde 360 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  let attempt = 0;
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/**", async (route) => {
    if (await fulfillEmptyCommentReads(route)) return;
    if (/auth\/(login|refresh)$/.test(route.request().url()))
      return route.fulfill({ json: session, headers: { "Access-Control-Allow-Origin": "*" } });
    if (++attempt === 1) return route.abort("internetdisconnected");
    await route.fulfill({
      json: { version: 1, kind: "no_program" },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await enter(page);
  await expect(page.getByText("No hay una semana descargada para esta cuenta.")).toBeVisible();
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await expect(page.getByText("Tu próximo comienzo")).toBeVisible();
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  const rects = await page
    .getByRole("button")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
  expect(rects.every((h) => h >= 44)).toBe(true);
});

async function emptyAccount(page: Page, seen: string[] = []) {
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    seen.push(route.request().method() + " " + path);
    if (await fulfillEmptyCommentReads(route)) return;
    const data = path.endsWith("auth/login")
      ? session
      : path.endsWith("workouts")
        ? { version: 1, items: [], nextCursor: null }
        : path.endsWith("progress")
          ? { version: 1, exercises: [] }
          : { version: 1, kind: "no_program" };
    await route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
  });
}
test("sin programa: demo interactiva, recuperación, cierre y resultados separados", async ({
  page,
}) => {
  const writes: string[] = [];
  await emptyAccount(page, writes);
  await enter(page);
  await page.getByRole("button", { name: "Explorar rutinas y entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
  await expect(page.getByText(/Rutina de ejemplo. Sus resultados quedan/)).toBeVisible();
  await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  await page.getByLabel("Peso serie 1", { exact: true }).fill("20");
  await page.getByLabel("Repeticiones serie 1", { exact: true }).fill("9");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Tiempo de descanso restante")).toBeVisible();
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
  await enter(page); // nueva navegación conserva el registro; credenciales web siguen solo en memoria.
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(page.getByLabel("Peso serie 1", { exact: true })).toHaveValue("20");
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await expect(
    page.getByText(
      "1 series realizadas · 10 pendientes. Se guardarán solo las series completadas.",
    ),
  ).toBeVisible();
  await page.getByLabel("Esfuerzo percibido", { exact: true }).fill("7");
  await page.getByLabel("Nota del entrenamiento", { exact: true }).fill("Mi primera prueba");
  await page.getByRole("button", { name: "Guardar demo", exact: true }).click();
  await expect(page.getByText("DEMO GUARDADA EN ESTE DISPOSITIVO", { exact: true })).toBeVisible();
  await expect(page.getByText("Mi primera prueba", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver mi historial", exact: true }).click();
  await expect(page.getByText("Pruebas en este dispositivo", { exact: true })).toBeVisible();
  expect(writes.filter((x) => x.startsWith("POST") && !x.endsWith("auth/login"))).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => /token|refresh/i.test(localStorage.getItem(k) ?? "")),
    ),
  ).toBe(false);
  await page.screenshot({
    path: test.info().outputPath("native-demo-history.png"),
    fullPage: true,
  });
});
test("superserie demo avanza por ronda y bloquea sustitución después de completar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await emptyAccount(page);
  await enter(page);
  await page.getByRole("button", { name: "Explorar rutinas y entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Ver demo B", exact: true }).click();
  await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  await page.getByRole("button", { name: "Indicaciones y alternativas", exact: true }).click();
  await page.getByRole("button", { name: "Cambiar a Remo en polea", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ir a Remo en polea", exact: true })).toBeVisible();
  await page.getByLabel("Peso serie 1", { exact: true }).fill("20");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cambiar a Jalón al pecho", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Omitir descanso", exact: true }).click();
  await page.getByRole("button", { name: "Ir a Curl de bíceps", exact: true }).click();
  await page.getByLabel("Peso serie 1", { exact: true }).fill("10");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(page.getByText("Extensión de tríceps", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Tiempo de descanso restante")).toHaveCount(0);
  await page.getByLabel("Peso serie 1", { exact: true }).fill("10");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(page.getByLabel("Tiempo de descanso restante")).toBeVisible();
  await expect(page.getByText(/SUPERSERIE · Ronda 2/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({
    path: test.info().outputPath("native-superset-360-dark.png"),
    fullPage: true,
  });
});
test("registro real conserva el payload ante respuesta perdida y confirma un único resultado", async ({
  page,
}) => {
  const sent: unknown[] = [],
    activeWeek = {
      version: 1,
      kind: "active",
      program,
      weekNumber: 1,
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
      sessions: [
        {
          sessionId: id,
          label: "A",
          title: "Tren inferior",
          status: "pending",
          exerciseCount: 2,
          setCount: 4,
          exerciseNames: ["Sentadilla", "Peso muerto rumano"],
        },
      ],
    };
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (await fulfillEmptyCommentReads(route)) return;
    if (path.endsWith("recordings") && request.method() === "POST") {
      const body = request.postDataJSON();
      sent.push(body);
      if (sent.length === 1) return route.abort("internetdisconnected");
      return route.fulfill({
        json: { version: 2, ok: true, status: "duplicate", workoutId: body.payload.id },
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    const payload = (sent[0] as { payload: RecordingPayload } | undefined)?.payload.workout;
    const data = /auth\/(login|refresh)$/.test(path)
      ? session
      : path.endsWith("week")
        ? {
            ...activeWeek,
            sessions: activeWeek.sessions.map((s) => ({
              ...s,
              status: sent.length > 1 ? "done" : "pending",
            })),
          }
        : path.includes("/sessions/")
          ? routine
          : {
              version: 1,
              workout: {
                id: payload?.id,
                programName: program.name,
                sessionLabel: "A",
                startedAt: payload?.startedAt,
                performedOn: "2026-10-24",
                durationSeconds: 1,
                perceivedEffort: null,
                note: null,
                summary: { workingSets: 1, volumeKg: 330, bodyweightReps: 0, exerciseCount: 1 },
                exercises: [
                  {
                    position: 0,
                    exerciseId: exercise,
                    name: "Sentadilla",
                    sets: [{ id: exercise, setNumber: 1, weightKg: 55, reps: 6, isWarmup: false }],
                  },
                ],
              },
            };
    await route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await enter(page);
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByLabel("Peso serie 1", { exact: true }).fill("55");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Guardar entrenamiento", exact: true }).click();
  await expect.poll(() => sent.length).toBe(1);
  await setWeekConnectivity(page, false);
  const syncKey = `is:native-sync:v1:${id}`;
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}').entries.length,
        syncKey,
      ),
    )
    .toBe(1);
  const pending = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).entries[0],
    syncKey,
  );
  expect(pending.phase).toBe("pending");
  expect(pending.payload).toEqual((sent[0] as { payload: unknown }).payload);
  await expect(page.getByRole("button", { name: "Reintentar envío", exact: true })).toBeDisabled();
  await setWeekConnectivity(page, true);
  await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  expect(
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("is:native-training:"));
      return key ? JSON.parse(localStorage.getItem(key)!).active : null;
    }),
  ).toBeNull();
  await page.getByRole("button", { name: "Volver a mi semana", exact: true }).click();
  await expect(page.getByText("1 de 1 sesiones completadas", { exact: true })).toBeVisible();
});
test("fallo de almacenamiento bloquea inicio silencioso y permite recuperar el guardado", async ({
  page,
}) => {
  await emptyAccount(page);
  await enter(page);
  await page.getByRole("button", { name: "Explorar rutinas y entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:native-training:")) throw new Error("Sin espacio");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retomar entrenamiento pendiente", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("is:native-training:")),
    ),
  ).toEqual([]);
});

test("apariencia clara y negra persiste sin tocar el entrenamiento; sistema responde al dispositivo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await emptyAccount(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("login-new.png") });
  await enter(page);
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Sistema", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Oscuro", exact: true }).click();
  await expect(
    page.getByText("Tema oscuro · Guardado en este dispositivo", { exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("account-dark.png") });
  await page.getByRole("button", { name: "Ver rutinas de ejemplo", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("train-dark.png") });
  await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
  await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  await page.getByLabel("Peso serie 1", { exact: true }).fill("25");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("workout-dark.png") });
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  const draft = await page.evaluate(() =>
    localStorage.getItem(
      Object.keys(localStorage).find((k) => k.startsWith("is:native-training:"))!,
    ),
  );
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await page.getByRole("radio", { name: "Claro", exact: true }).click();
  await expect(
    page
      .getByRole("radiogroup", { name: "Tema de la app" })
      .locator("..")
      .getByText("Tema claro · Guardado en este dispositivo", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem(
        Object.keys(localStorage).find((k) => k.startsWith("is:native-training:"))!,
      ),
    ),
  ).toBe(draft);
  await page.reload();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Entrenamiento Iron Strength" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("is:native-appearance:v1")!).preference,
    ),
  ).toBe("light");
  await page.screenshot({ path: test.info().outputPath("login-light.png") });
  await enter(page);
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Claro", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Sistema", exact: true }).click();
  await expect(
    page.getByText("Según tu teléfono · Guardado en este dispositivo", { exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(
    page
      .getByTestId("app-page")
      .filter({ has: page.getByRole("radiogroup", { name: "Tema de la app" }) }),
  ).toHaveCSS("background-color", "rgb(0, 0, 0)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("apariencia avisa si el dispositivo no puede guardar, sin confirmar el cambio", async ({
  page,
}) => {
  await emptyAccount(page);
  await enter(page);
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "is:native-appearance:v1") throw new Error("Sin espacio");
      original.call(this, key, value);
    };
  });
  await page.getByRole("radio", { name: "Oscuro", exact: true }).click();
  await expect(
    page.getByText("No pudimos guardar el tema. Se mantiene tu ajuste anterior.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Sistema", exact: true })).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("is:native-appearance:v1"))).toBeNull();
});

test("opciones de serie compactas conservan calentamientos y registro directo", async ({
  page,
}) => {
  await emptyAccount(page);
  await enter(page);
  await page.getByRole("button", { name: "Explorar rutinas y entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Ver demo B", exact: true }).click();
  await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  await page.getByRole("button", { name: "Ir a Curl de bíceps", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Usar como calentamiento serie 1", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Opciones de serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Usar como calentamiento serie 1", exact: true }).click();
  await page.getByLabel("Peso serie 1", { exact: true }).fill("10");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(page.getByLabel("Repeticiones serie 1", { exact: true })).toHaveValue("10");
  await expect(
    page.getByRole("button", { name: "Ir a Curl de bíceps", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Opciones de serie 1", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Usar como trabajo serie 1", exact: true }),
  ).toHaveCount(0);
});

test("salir conserva apariencia oscura y la apertura siguiente la recupera", async ({ page }) => {
  await emptyAccount(page);
  await enter(page);
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await page.getByRole("radio", { name: "Oscuro", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Oscuro", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await expect(page.getByTestId("app-page")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.reload();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await expect(page.getByTestId("app-page")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.screenshot({ path: test.info().outputPath("login-dark.png") });
});

test("recuperar acceso de la misma cuenta conserva el entrenamiento pendiente", async ({
  page,
}) => {
  await emptyAccount(page);
  await enter(page);
  await page.getByRole("button", { name: "Explorar rutinas y entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
  await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("31");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeChecked();
  let expired = true;
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/week", (route) =>
    route.fulfill({
      status: expired ? 401 : 200,
      json: expired
        ? { version: 1, error: { code: "unauthorized", message: "Sesión expirada" } }
        : { version: 1, kind: "no_program" },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      json: { version: 1, error: { code: "unauthorized", message: "Sesión expirada" } },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.route(
    "https://iron-strength-seven.vercel.app/api/mobile/v1/auth/reset-password",
    (route) =>
      route.fulfill({
        json: { version: 1, ok: true },
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
  );
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tengo un enlace de mi coach", exact: true }).click();
  await page
    .getByLabel("Enlace de tu coach", { exact: true })
    .fill("https://iron-strength-seven.vercel.app/reset/" + "b".repeat(56));
  await page.getByRole("button", { name: "Revisar enlace", exact: true }).click();
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("Clave-nueva-192");
  await page.getByLabel("Repite la contraseña", { exact: true }).fill("Clave-nueva-192");
  await page.getByRole("button", { name: "Guardar contraseña nueva", exact: true }).click();
  await expect(page.getByText(/Contraseña actualizada/)).toBeVisible();
  expired = false;
  await enter(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue("31");
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeChecked();
});

for (const theme of ["light", "dark"] as const) {
  test(`series y descanso ${theme}: error junto a la fila, controles visibles y término recuperable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await emptyAccount(page);
    await enter(page);
    await page.getByRole("button", { name: "Explorar rutinas y entrenar", exact: true }).click();
    await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
    await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
    const weight = page.getByRole("textbox", { name: "Peso serie 3", exact: true });
    const check = page.getByRole("checkbox", { name: "Completar serie 3", exact: true });
    await weight.fill("501");
    await check.click();
    await expect(check).not.toBeChecked();
    const error = page.getByRole("alert").filter({ hasText: "Serie 3: Revisa kg" });
    await expect(error).toBeInViewport();
    await weight.fill("22,5");
    await expect(error).toHaveCount(0);
    const reps = page.getByRole("textbox", { name: "Repeticiones serie 3", exact: true });
    await reps.fill("101");
    await check.click();
    await expect(error).toBeInViewport();
    await expect(check).not.toBeChecked();
    await reps.fill("9");
    await expect(error).toHaveCount(0);
    await check.click();
    await expect(check).toBeChecked();
    const timer = page.getByLabel("Tiempo de descanso restante");
    await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).focus();
    await expect(timer).toBeInViewport();
    const readEnd = () =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.startsWith("is:native-training:"));
        return key ? (JSON.parse(localStorage.getItem(key)!).active?.draft.rest?.endsAt ?? 0) : 0;
      });
    await expect.poll(readEnd).toBeGreaterThan(0);
    const initial = await readEnd();
    await page.getByRole("button", { name: "Sumar 15 segundos", exact: true }).click();
    await expect.poll(readEnd).toBeGreaterThan(initial + 14000);
    const extended = await readEnd();
    await page.getByRole("button", { name: "Restar 15 segundos", exact: true }).click();
    await expect.poll(readEnd).toBeLessThan(extended - 14000);
    const end = await readEnd();
    await page.getByRole("button", { name: "Ir a Press con mancuernas", exact: true }).click();
    await expect(timer).toBeInViewport();
    expect(await readEnd()).toBe(end);
    await page.getByRole("button", { name: "Ir a Sentadilla goblet", exact: true }).click();
    await enter(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await expect(timer).toBeInViewport();
    expect(await readEnd()).toBe(end);
    await expect(weight).toHaveValue("22,5");
    await expect(reps).toHaveValue("9");
    await expect(check).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`rest-recovery-${theme}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Omitir descanso", exact: true }).click();
    await expect(timer).toHaveCount(0);
    await expect.poll(readEnd).toBe(0);
  });

  test(`pantallas funcionales ${theme}: semana y marcas con datos confirmados, sin métricas ficticias`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const writes: string[] = [];
    await page.route("https://iron-strength-seven.vercel.app/api/mobile/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (await fulfillEmptyCommentReads(route)) return;
      if (route.request().method() === "POST") writes.push(path);
      const data = path.endsWith("auth/login")
        ? session
        : path.endsWith("week")
          ? {
              version: 1,
              kind: "active",
              program,
              weekNumber: 1,
              weekStart: "2026-10-19",
              weekEnd: "2026-10-25",
              sessions: [
                {
                  sessionId: id,
                  label: "A",
                  title: "Tren inferior",
                  status: "pending",
                  exerciseCount: 2,
                  setCount: 4,
                  exerciseNames: ["Sentadilla", "Peso muerto rumano"],
                },
              ],
            }
          : path.endsWith("progress")
            ? {
                version: 1,
                exercises: [
                  {
                    exerciseId: id,
                    name: "Sentadilla",
                    bestWeightKg: 52.5,
                    bestEstimated1RM: 63,
                    bestReps: 6,
                    isBodyweight: false,
                    lastDate: "2026-10-23",
                    workoutCount: 3,
                  },
                  {
                    exerciseId: exercise,
                    name: "Dominadas",
                    bestWeightKg: 0,
                    bestEstimated1RM: 0,
                    bestReps: 12,
                    isBodyweight: true,
                    lastDate: "2026-10-22",
                    workoutCount: 2,
                  },
                ],
              }
            : {
                version: 1,
                items: [
                  {
                    id,
                    sessionLabel: "A",
                    startedAt: "2026-10-23T12:00:00Z",
                    performedOn: "2026-10-23",
                    durationSeconds: 1800,
                    perceivedEffort: 7,
                    note: "Carga controlada en la última serie",
                    workingSets: 6,
                    volumeKg: 1200,
                    bodyweightReps: 0,
                    exerciseCount: 2,
                  },
                ],
                nextCursor: null,
              };
      await route.fulfill({ json: data, headers: { "Access-Control-Allow-Origin": "*" } });
    });
    await enter(page);
    await expect(page.getByText("SIGUIENTE SESIÓN", { exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`functional-home-${theme}.png`),
      fullPage: true,
    });
    for (const name of ["Inicio", "Progreso", "Historial", "Cuenta"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      if (name === "Progreso") {
        await expect(page.getByText("52,5 kg", { exact: true })).toBeVisible();
        await expect(page.getByText("12 reps", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "8 semanas", exact: true })).toHaveCount(0);
      }
      if (name === "Historial")
        await expect(
          page.getByText("Carga controlada en la última serie", { exact: true }),
        ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: test.info().outputPath(`functional-${name}-${theme}.png`),
        fullPage: true,
      });
    }
    expect(writes).toEqual(["/api/mobile/v1/auth/login"]);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) => key.startsWith("is:native-training:")),
      ),
    ).toEqual([]);
  });

  test(`registro funcional ${theme}: check discreto, tabla compacta y detalle sin perder valores`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await emptyAccount(page);
    await enter(page);
    await page.getByRole("button", { name: "Explorar rutinas y entrenar", exact: true }).click();
    await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
    await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
    const check = page.getByRole("checkbox", { name: "Completar serie 1", exact: true });
    const mark = page.getByTestId("set-check-mark-1");
    const target = await check.boundingBox();
    expect(target!.width).toBeGreaterThanOrEqual(48);
    expect(target!.height).toBeGreaterThanOrEqual(48);
    await expect(mark).toBeVisible();
    expect((await mark.boundingBox())!.width).toBeLessThanOrEqual(28);
    await expect(mark).toHaveCSS("border-radius", "13px");
    const weight = page.getByRole("textbox", { name: "Peso serie 1", exact: true });
    const reps = page.getByRole("textbox", { name: "Repeticiones serie 1", exact: true });
    const rowBoxes = await Promise.all([
      weight.boundingBox(),
      reps.boundingBox(),
      check.boundingBox(),
    ]);
    expect(new Set(rowBoxes.map((box) => Math.round(box!.y))).size).toBe(1);
    await weight.fill("23");
    await reps.fill("8");
    await page.getByRole("button", { name: "Indicaciones y alternativas", exact: true }).click();
    await expect(weight).toHaveValue("23");
    await check.click();
    await expect(check).toBeChecked();
    await expect(page.getByLabel("Tiempo de descanso restante")).toBeVisible();
    await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await expect(weight).toHaveValue("23");
    await expect(check).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`functional-workout-${theme}.png`),
      fullPage: true,
    });
  });
}
