import { expect, test, type Page } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";
import { trainingDownloadFixture } from "../src/test/fixtures/training-download";
import { downloadRecordSchema } from "../src/lib/offline/download-controller";
const email = "web-download-account@iron-strength.e2e.test",
  password = "Web-download-account-local-only-2026!";
let owner: string, other: string;
test.beforeEach(async () => {
  await resetAll();
  const coachId = await seedCoach();
  owner = await createUser(admin(), {
    role: "student",
    name: "Cuenta descarga",
    email,
    password,
    coachId,
  });
  other = await createUser(admin(), {
    role: "student",
    name: "Otra cuenta",
    email: "web-download-other@iron-strength.e2e.test",
    password,
    coachId,
  });
});
test.afterAll(async () => {
  await resetAll();
});
function known(userId: string) {
  const base = trainingDownloadFixture();
  const bundle = JSON.parse(JSON.stringify(base).replaceAll(base.userId, userId));
  return JSON.stringify(
    downloadRecordSchema.parse({ version: 1, userId, bundle, previousBundle: null }),
  );
}
async function seed(page: Page, ownRaw: string) {
  await page.goto("/login");
  const otherRaw = known(other);
  await page.evaluate(
    async ({ owner, other, ownRaw, otherRaw }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("iron-strength-training-download", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("bundles", { keyPath: "userId" });
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("bundles", "readwrite");
          tx.objectStore("bundles").put({ userId: owner, raw: ownRaw });
          tx.objectStore("bundles").put({ userId: other, raw: otherRaw });
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    { owner, other, ownRaw, otherRaw },
  );
  return otherRaw;
}
async function rows(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("iron-strength-training-download", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<{ userId: string; raw: string }[]>((resolve, reject) => {
        const r = db.transaction("bundles").objectStore("bundles").getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
}
for (const unknown of [false, true])
  test(`salir: copia ${unknown ? "desconocida conservada" : "conocida retirada"}, otra cuenta intacta y ninguna descarga automática`, async ({
    page,
  }) => {
    const raw = unknown
      ? JSON.stringify({ version: 99, userId: owner, future: "keep exact bytes" })
      : known(owner);
    const otherRaw = await seed(page, raw),
      reads: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/training/download") reads.push(request.url());
    });
    await login(page, email, password);
    await page.goto("/account");
    await expect(
      page.getByRole("button", { name: "Cerrar sesión", exact: true }).last(),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Cerrar sesión", exact: true }).last().click();
    await expect(page).toHaveURL(/\/login/);
    const saved = await rows(page);
    expect(saved.find((r) => r.userId === owner)?.raw ?? null).toBe(unknown ? raw : null);
    expect(saved.find((r) => r.userId === other)?.raw).toBe(otherRaw);
    expect(await page.evaluate(() => localStorage.getItem("is:offline:active-user"))).toBeNull();
    expect(reads).toEqual([]);
  });
for (const failCleanup of [false, true])
  test(`borrar cuenta: formato propio desconocido se retira solo tras confirmar servidor${failCleanup ? "; limpieza fallida recuperable" : ""}`, async ({
    page,
  }) => {
    const raw = JSON.stringify({
      version: 99,
      userId: owner,
      future: "preserve until confirmation",
    });
    const otherRaw = await seed(page, raw);
    await login(page, email, password);
    await page.goto("/account");
    await expect(page.getByRole("button", { name: "Quiero borrar mi cuenta" })).toBeEnabled();
    await page.getByRole("button", { name: "Quiero borrar mi cuenta" }).click();
    await page.getByLabel(/Para confirmar, escribe BORRAR/).fill("BORRAR");
    if (failCleanup)
      await page.evaluate((userId) => {
        const original = IDBObjectStore.prototype.delete;
        IDBObjectStore.prototype.delete = function (key) {
          if (this.name === "bundles" && key === userId) {
            IDBObjectStore.prototype.delete = original;
            throw new DOMException("simulated cleanup failure", "UnknownError");
          }
          return original.call(this, key);
        };
      }, owner);
    await page.getByRole("button", { name: "Borrar mi cuenta para siempre" }).click();
    if (failCleanup) {
      await expect(page.getByRole("button", { name: "Reintentar limpieza local" })).toBeVisible();
      expect((await rows(page)).find((r) => r.userId === owner)?.raw).toBe(raw);
      expect((await admin().from("profiles").select("id").eq("id", owner)).data).toEqual([]);
      await page.getByRole("button", { name: "Reintentar limpieza local" }).click();
    }
    await expect(page).toHaveURL(/\/login\?motivo=cuenta-borrada/);
    const saved = await rows(page);
    expect(saved.find((r) => r.userId === owner)).toBeUndefined();
    expect(saved.find((r) => r.userId === other)?.raw).toBe(otherRaw);
    expect((await admin().from("profiles").select("id").eq("id", owner)).data).toEqual([]);
    expect((await admin().from("profiles").select("id").eq("id", other)).data).toEqual([
      { id: other },
    ]);
  });
test("borrado por cookie valida cuenta, origen, confirmación y perfil antes de tocar datos", async ({
  page,
  request,
}) => {
  await login(page, email, password);
  const path = "/api/account/delete",
    origin = "http://127.0.0.1:3100",
    data = { version: 1, userId: owner, confirmation: "BORRAR" };
  for (const [body, status] of [
    [{ ...data, userId: other }, 403],
    [{ ...data, version: 99 }, 400],
    [{ ...data, confirmation: "no" }, 400],
    [{ ...data, other }, 400],
  ] as const) {
    const r = await page.request.post(path, { headers: { Origin: origin }, data: body });
    expect(r.status()).toBe(status);
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(r.headers().vary).toContain("Cookie");
    expect((await r.json()).version).toBe(1);
  }
  expect(
    (await page.request.post(path, { headers: { Origin: "https://foreign.test" }, data })).status(),
  ).toBe(403);
  const unauth = await request.post(path, { headers: { Origin: origin }, data, maxRedirects: 0 });
  expect(unauth.status()).toBe(401);
  expect(unauth.headers().location).toBeUndefined();
  expect((await unauth.json()).error.code).toBe("unauthorized");
  expect(
    (await admin().from("profiles").update({ is_active: false }).eq("id", owner)).error,
  ).toBeNull();
  expect((await page.request.post(path, { headers: { Origin: origin }, data })).status()).toBe(401);
  expect((await admin().from("profiles").select("id").in("id", [owner, other])).data).toHaveLength(
    2,
  );
});
test("el coach no puede borrar su cuenta mediante la ruta JSON", async ({ page }) => {
  await login(page, COACH.email, COACH.password);
  const profile = await admin().from("profiles").select("id").eq("role", "coach").single();
  expect(profile.error).toBeNull();
  const r = await page.request.post("/api/account/delete", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { version: 1, userId: profile.data!.id, confirmation: "BORRAR" },
  });
  expect(r.status()).toBe(403);
  expect(
    (await admin().from("profiles").select("id").eq("id", profile.data!.id)).data,
  ).toHaveLength(1);
});
