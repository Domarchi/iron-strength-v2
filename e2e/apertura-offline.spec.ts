import { recoverLegacyWeek } from "./support/recover-legacy-week";
import designAssets from "../src/lib/design/offline-assets.json";
import { test } from "./support/network";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, COACH, resetAll, seedCoach, seedProgram, seedWorkout } from "./support/db";
import { login } from "./support/ui";
test("cierra, abre sin Internet, consulta historial y recupera series y descanso (T160)", async ({
  page,
  context,
  network,
  request,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const program = await seedProgram({ coachId, studentId: coachId });
  const extra = await admin()
    .from("program_sessions")
    .insert({ program_id: program.programId, week_number: 1, label: "B" })
    .select("id")
    .single();
  expect(extra.error).toBeNull();
  await seedWorkout({
    studentId: coachId,
    exerciseId: program.exercises.get("Sentadilla")!,
    exerciseName: "Sentadilla",
    daysAgo: 1,
  });
  const publicShell = await request.get("/offline");
  expect(publicShell.status()).toBe(200);
  expect(publicShell.headers()["set-cookie"]).toBeUndefined();
  expect(await publicShell.text()).not.toContain(COACH.email);
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  const authenticatedShell = await context.request.get("/offline");
  expect(authenticatedShell.headers()["set-cookie"]).toBeUndefined();
  expect(await authenticatedShell.text()).toBe(await publicShell.text());
  await recoverLegacyWeek(page);
  const download = page.getByRole("region", { name: "Entrenamientos sin conexión", exact: true });
  await download.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión");
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const key of keys)
      for (const req of await (await caches.open(key)).keys()) urls.push(new URL(req.url).pathname);
    return urls;
  });
  expect(cached).toContain("/offline");
  for (const asset of designAssets) expect(cached).toContain(asset);
  expect(
    cached.every(
      (p) =>
        p === "/offline" ||
        p.startsWith("/_next/static/") ||
        p.startsWith("/icons/") ||
        p === "/manifest.webmanifest" ||
        designAssets.includes(p),
    ),
  ).toBe(true);
  expect(cached).not.toContain("/week");
  await page.close();
  network.offline = true;
  await expect(request.get("/offline", { maxRetries: 0 })).rejects.toThrow();
  const offline = await context.newPage();
  await offline.goto("/week");
  await expect(offline.getByRole("heading", { name: "Tus semanas descargadas" })).toBeVisible();
  await offline.getByRole("button", { name: "Iniciar sesión A", exact: true }).click();
  await expect
    .poll(() =>
      offline
        .locator('img[src="/design/azul-atleta/squat-320-v1.webp"]')
        .first()
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await offline.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("70");
  await offline.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("8");
  await offline.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await expect(offline.getByRole("timer")).toBeVisible();
  await offline.getByRole("button", { name: "Ver historial de Sentadilla", exact: true }).click();
  await expect(offline.getByRole("dialog")).toContainText("60 kg");
  await expect(offline.getByRole("dialog")).toContainText("Historial descargado");
  await offline.getByRole("button", { name: "Cerrar historial" }).click();
  const url = offline.url();
  await offline.close();
  const recovered = await context.newPage();
  await recovered.goto(url);
  await expect(
    recovered.getByRole("button", { name: "Desmarcar la serie 1 de Sentadilla" }),
  ).toBeVisible();
  await expect(recovered.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("70");
  await expect(recovered.getByRole("timer")).toBeVisible();
  await recovered.setViewportSize({ width: 360, height: 800 });
  expect(
    await recovered.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const audit = await new AxeBuilder({ page: recovered })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );
  await recovered.clock.install({ time: new Date(Date.now() + 7 * 86400_000) });
  await recovered.reload();
  await expect(
    recovered.getByRole("button", { name: "Desmarcar la serie 1 de Sentadilla" }),
  ).toBeVisible();
  await recovered.goto("/offline");
  await expect(
    recovered.getByRole("button", { name: "Retomar sesión A", exact: true }),
  ).toBeEnabled();
  await expect(
    recovered.getByRole("button", { name: "Iniciar sesión B", exact: true }),
  ).toBeDisabled();
  await recovered.clock.setSystemTime(new Date());
  network.offline = false;
  await recovered.goto("/account");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  network.holds.set("/account", gate);
  await recovered.getByRole("button", { name: "Cerrar sesión", exact: true }).last().click();
  const logout = recovered
    .getByRole("button", { name: "Eliminar pendientes locales y salir", exact: true })
    .click();
  await expect
    .poll(() => recovered.evaluate(() => localStorage.getItem("is:offline:active-user")))
    .toBeNull();
  release();
  await logout;
  await expect(recovered).toHaveURL(/\/login/);
  network.offline = true;
  await recovered.goto("/offline");
  await expect(
    recovered.getByText("Entra con conexión y descarga tus entrenamientos para usarlos aquí.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await admin().from("workouts").select("id").eq("student_id", coachId)).data).toHaveLength(
    1,
  );
});

test("un recurso ausente impide confirmar disponibilidad y una descarga posterior repara (T160)", async ({
  page,
  network,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  await seedProgram({ coachId, studentId: coachId });
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  // La petición proviene del worker: se simula la falta de un recurso al instalar.
  network.blocked.add("/icons/maskable");
  const download = page.getByRole("region", { name: "Entrenamientos sin conexión", exact: true });
  await download.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(download.getByRole("alert")).toBeVisible();
  await expect(download.getByRole("status")).not.toContainText("Disponible sin conexión");
  network.blocked.delete("/icons/maskable");
  await download.getByRole("button", { name: "Descargar entrenamientos", exact: true }).click();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión");
  await page.evaluate(async () => {
    for (const key of await caches.keys())
      if (key.startsWith("iron-strength-ui:"))
        await (await caches.open(key)).delete("/icons/maskable");
  });
  network.blocked.add("/icons/maskable");
  await download
    .getByRole("button", { name: "Actualizar entrenamientos descargados", exact: true })
    .click();
  await expect(download.getByRole("alert")).toBeVisible();
  await expect(download.getByRole("status")).toContainText("Datos guardados");
  network.blocked.delete("/icons/maskable");
  await download
    .getByRole("button", { name: "Actualizar entrenamientos descargados", exact: true })
    .click();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión");
  expect(await page.evaluate(async () => Boolean(await caches.match("/icons/maskable")))).toBe(
    true,
  );
});
