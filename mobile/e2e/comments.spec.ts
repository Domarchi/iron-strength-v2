import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const origin = "https://iron-strength-seven.vercel.app",
  userId = "11111111-1111-4111-8111-111111111111",
  workoutId = "22222222-2222-4222-8222-222222222222",
  coachId = "33333333-3333-4333-8333-333333333333";
async function setup(page: Page, loseFirst = false) {
  const comments = [
    {
      id: coachId,
      body: "Buen control en las últimas series.",
      createdAt: "2026-10-24T15:00:00Z",
      authorKind: "coach",
      mine: false,
    },
  ];
  const sent: { id: string; body: string }[] = [];
  let unread = 1,
    reads = 0,
    lost = false;
  await page.route(origin + "/api/mobile/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let json: unknown = { version: 1, kind: "no_program" };
    if (path.endsWith("auth/login") || path.endsWith("auth/refresh"))
      json = {
        version: 1,
        accessToken: "synthetic-access",
        refreshToken: "synthetic-refresh",
        expiresAt: 4000000000,
        profile: { id: userId, fullName: "Ana Prueba", email: "ana@example.test", role: "student" },
      };
    else if (path.endsWith("auth/logout")) json = { version: 1, ok: true };
    else if (path.endsWith("comments/unread"))
      json = {
        version: 1,
        items: unread ? [{ workoutId, count: unread, lastCommentAt: "2026-10-24T15:00:00Z" }] : [],
      };
    else if (path.endsWith("comments/read")) {
      reads++;
      unread = 0;
      json = { version: 1, ok: true, workoutId };
    } else if (path.endsWith("comments/delete")) {
      const input = req.postDataJSON();
      const index = comments.findIndex((c) => c.id === input.id && c.mine);
      if (index >= 0) comments.splice(index, 1);
      json = { version: 1, ok: true, workoutId, id: input.id, status: "deleted" };
    } else if (path.endsWith("/comments")) {
      if (req.method() === "POST") {
        const input = req.postDataJSON() as { id: string; body: string };
        sent.push(input);
        const existing = comments.some((c) => c.id === input.id);
        if (!existing)
          comments.push({
            ...input,
            createdAt: "2026-10-24T15:05:00Z",
            authorKind: "student",
            mine: true,
          });
        if (loseFirst && !lost) {
          lost = true;
          await route.abort("failed");
          return;
        }
        json = {
          version: 1,
          ok: true,
          workoutId,
          id: input.id,
          status: existing ? "duplicate" : "created",
        };
      } else
        json = {
          version: 1,
          workoutId,
          items: [...comments].reverse(),
          unreadCount: unread,
          nextCursor: null,
        };
    } else if (path.endsWith("/workouts/" + workoutId))
      json = {
        version: 1,
        workout: {
          id: workoutId,
          programName: "Fuerza",
          sessionLabel: "A",
          performedOn: "2026-10-24",
          startedAt: "2026-10-24T14:00:00Z",
          durationSeconds: 1800,
          perceivedEffort: 7,
          note: null,
          summary: { workingSets: 1, volumeKg: 400, bodyweightReps: 0, exerciseCount: 1 },
          exercises: [],
        },
      };
    await route.fulfill({ json, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  const enter = async () => {
    await page.getByLabel("Correo", { exact: true }).fill("ana@example.test");
    await page.getByLabel("Contraseña", { exact: true }).fill("Synthetic-password");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Hola, Ana", { exact: true })).toBeVisible();
  };
  await page.goto("/");
  await enter();
  return { comments, sent, enter, reads: () => reads };
}
test("comentario del coach → evidencia → leído explícito → respuesta → borrar solo lo propio", async ({
  page,
}) => {
  const f = await setup(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Ver comentario pendiente", exact: true }).click();
  await expect(
    page.getByText("Buen control en las últimas series.", { exact: true }),
  ).toBeVisible();
  expect(f.reads()).toBe(0);
  await expect(page.getByRole("button", { name: "Borrar mi comentario", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Marcar conversación como leída", exact: true }).click();
  expect(f.reads()).toBe(1);
  await page
    .getByLabel("Tu comentario", { exact: true })
    .fill("Me costaron las últimas dos repeticiones.");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Publicar comentario", exact: true }).click();
  await expect(
    page.getByText("Comentario confirmado en tu cuenta.", { exact: true }),
  ).toBeVisible();
  expect(f.sent).toHaveLength(1);
  await expect(page.getByLabel("Tu comentario", { exact: true })).toHaveValue("");
  await page.screenshot({ path: test.info().outputPath("comments-dark-360.png"), fullPage: true });
  await page.getByRole("button", { name: "Borrar mi comentario", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar borrado de comentario", exact: true }).click();
  await expect(
    page.getByText("Me costaron las últimas dos repeticiones.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Buen control en las últimas series.", { exact: true }),
  ).toBeVisible();
});
test("respuesta perdida conserva intento; recarga, bloqueo de salida y reintento confirman un único mensaje", async ({
  page,
}) => {
  const f = await setup(page, true);
  await page.getByRole("button", { name: "Ver comentario pendiente", exact: true }).click();
  await page
    .getByLabel("Tu comentario", { exact: true })
    .fill("Mensaje que debe aparecer una vez.");
  await page.getByRole("button", { name: "Publicar comentario", exact: true }).click();
  await expect(page.getByRole("button", { name: "Conectar", exact: true })).toBeVisible();
  await expect(page.getByLabel("Tu comentario", { exact: true })).toHaveCount(0);
  const frozen = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`is:native-comment:v1:${id}`)!),
    userId,
  );
  expect(frozen).toMatchObject({ phase: "pending", body: "Mensaje que debe aparecer una vez." });
  expect(f.sent).toHaveLength(1);
  await page.reload();
  await f.enter();
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retomar comentario", exact: true }).click();
  await expect(page.getByLabel("Tu comentario", { exact: true })).toHaveValue(
    "Mensaje que debe aparecer una vez.",
  );
  await page.getByRole("button", { name: "Reintentar publicación", exact: true }).click();
  await expect(
    page.getByText("Comentario confirmado en tu cuenta.", { exact: true }),
  ).toBeVisible();
  expect(f.sent).toHaveLength(2);
  expect(f.sent[0]).toEqual(f.sent[1]);
  expect(f.comments.filter((c) => c.mine)).toHaveLength(1);
});
test("sin espacio conserva texto y no publica hasta confirmar el guardado local", async ({
  page,
}) => {
  const f = await setup(page);
  await page.getByRole("button", { name: "Ver comentario pendiente", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:native-comment:") && !localStorage.getItem("allow-comment-test-write"))
        throw Error("quota");
      original.call(this, key, value);
    };
  });
  await page.getByLabel("Tu comentario", { exact: true }).fill("Texto protegido durante el fallo.");
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "No pudimos guardar el comentario en este dispositivo. Revisa el espacio disponible y reintenta.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publicar comentario", exact: true }).click();
  expect(f.sent).toHaveLength(0);
  await expect(page.getByLabel("Tu comentario", { exact: true })).toHaveValue(
    "Texto protegido durante el fallo.",
  );
  await page.evaluate(() => localStorage.setItem("allow-comment-test-write", "1"));
  await page.getByRole("button", { name: "Reintentar publicación", exact: true }).click();
  await expect(
    page.getByText("Comentario confirmado en tu cuenta.", { exact: true }),
  ).toBeVisible();
  expect(f.sent).toHaveLength(1);
});
test("anteriores conserva orden de conversación y no marca leído al paginar", async ({ page }) => {
  const f = await setup(page),
    cursor = `2026-10-24T15:00:00Z|${coachId}`;
  await page.route(
    origin + "/api/mobile/v1/workouts/" + workoutId + "/comments*",
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const previous = new URL(route.request().url()).searchParams.get("cursor");
      if (previous) expect(previous).toBe(cursor);
      await route.fulfill({
        json: {
          version: 1,
          workoutId,
          unreadCount: 1,
          nextCursor: previous ? null : cursor,
          items: previous
            ? [
                {
                  id: "44444444-4444-4444-8444-444444444444",
                  body: "Indicación anterior del coach.",
                  createdAt: "2026-10-23T15:00:00Z",
                  authorKind: "coach",
                  mine: false,
                },
              ]
            : f.comments,
        },
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.getByRole("button", { name: "Ver comentario pendiente", exact: true }).click();
  await page.getByRole("button", { name: "Ver comentarios anteriores", exact: true }).click();
  const previous = await page
      .getByText("Indicación anterior del coach.", { exact: true })
      .boundingBox(),
    last = await page
      .getByText("Buen control en las últimas series.", { exact: true })
      .boundingBox();
  expect(previous).not.toBeNull();
  expect(last).not.toBeNull();
  expect(previous!.y).toBeLessThan(last!.y);
  expect(f.reads()).toBe(0);
  await expect(
    page.getByRole("button", { name: "Ver comentarios anteriores", exact: true }),
  ).toHaveCount(0);
});
test("un mensaje borrado desde otra pantalla no se reenvía: conserva texto y permite descartar el intento", async ({
  page,
}) => {
  const f = await setup(page, true);
  await page.getByRole("button", { name: "Ver comentario pendiente", exact: true }).click();
  await page.getByLabel("Tu comentario", { exact: true }).fill("Texto del mensaje ya borrado.");
  await page.getByRole("button", { name: "Publicar comentario", exact: true }).click();
  await expect(page.getByRole("button", { name: "Conectar", exact: true })).toBeVisible();
  f.comments.splice(
    f.comments.findIndex((c) => c.mine),
    1,
  );
  await page.route(origin + "/api/mobile/v1/workouts/" + workoutId + "/comments", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 409,
      json: {
        version: 1,
        error: {
          code: "removed",
          message:
            "Este comentario ya se publicó y fue borrado. Descarta su borrador para mantenerlo borrado; puedes empezar otro mensaje después.",
        },
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await page.getByRole("button", { name: "Reintentar publicación", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Publicación detenida", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Tu comentario", { exact: true })).toHaveValue(
    "Texto del mensaje ya borrado.",
  );
  await page.getByRole("button", { name: "Descartar comentario pendiente", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar descarte de comentario", exact: true }).click();
  await expect(page.getByLabel("Tu comentario", { exact: true })).toBeEditable();
  await expect(page.getByLabel("Tu comentario", { exact: true })).toHaveValue("");
  expect(f.comments.filter((c) => c.mine)).toHaveLength(0);
});
