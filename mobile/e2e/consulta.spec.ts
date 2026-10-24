import { test, expect, type Page } from "@playwright/test";
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
  await expect(page.getByText("0 de 1 sesiones completadas")).toBeVisible();
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
    if (route.request().url().endsWith("auth/login"))
      return route.fulfill({ json: session, headers: { "Access-Control-Allow-Origin": "*" } });
    if (++attempt === 1) return route.abort("internetdisconnected");
    await route.fulfill({
      json: { version: 1, kind: "no_program" },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await enter(page);
  await expect(
    page.getByText("No pudimos conectar. Revisa tu conexión y reintenta."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
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
    if (path.endsWith("workouts") && request.method() === "POST") {
      const body = request.postDataJSON();
      sent.push(body);
      if (sent.length === 1) return route.abort("internetdisconnected");
      return route.fulfill({
        json: { version: 1, ok: true, status: "duplicate", workoutId: body.payload.id },
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    const payload = (
      sent[0] as
        | { payload: { id: string; startedAt: string; sets: { weightKg: number; reps: number }[] } }
        | undefined
    )?.payload;
    const data = path.endsWith("auth/login")
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
  await expect(page.getByRole("button", { name: "Reintentar envío", exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  const pending = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("is:native-training:"));
    return key ? JSON.parse(localStorage.getItem(key)!).active : null;
  });
  expect(pending.draft.status).toBe("pending_save");
  expect(pending.payload).toEqual((sent[0] as { payload: unknown }).payload);
  await page.getByRole("button", { name: "Reintentar envío", exact: true }).click();
  await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
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
