import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fulfillEmptyCommentReads } from "./support/comment-fixture";
const origin = "https://iron-strength-seven.vercel.app",
  id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const receiptKey = "is:native-account-removal:v1",
  trainingKey = `is:native-training:v1:${id}`;
async function seedCompleteDownloads(page: Page, raw: string) {
  await page.evaluate(
    ({ id, other, raw }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("iron-strength-training-download", 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("bundles"))
            request.result.createObjectStore("bundles", { keyPath: "userId" });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("bundles", "readwrite");
          tx.objectStore("bundles").put({ userId: id, raw });
          tx.objectStore("bundles").put({ userId: other, raw: "other complete cache" });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { id, other, raw },
  );
}
async function completeDownloadRows(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ userId: string; raw: string }[]>((resolve, reject) => {
        const request = indexedDB.open("iron-strength-training-download", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("bundles", "readonly"),
            read = tx.objectStore("bundles").getAll();
          let rows: { userId: string; raw: string }[] = [];
          read.onsuccess = () => {
            rows = read.result;
          };
          tx.oncomplete = () => {
            db.close();
            resolve(rows);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}
async function enter(page: Page, role: "student" | "coach" = "student", removeStatus = 200) {
  const calls: string[] = [];
  await page.route(origin + "/api/mobile/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    if (await fulfillEmptyCommentReads(route)) return;
    const json = path.endsWith("auth/login")
      ? {
          version: 1,
          accessToken: "test-access",
          refreshToken: "test-refresh",
          expiresAt: 4000000000,
          profile: { id, fullName: "Ana Prueba", email: "ana@example.test", role },
        }
      : path.endsWith("account/delete")
        ? removeStatus === 200
          ? { version: 1, ok: true, userId: id }
          : {
              version: 1,
              error: { code: "unavailable", message: "No pudimos confirmar el borrado." },
            }
        : path.endsWith("auth/logout")
          ? { version: 1, ok: true }
          : { version: 1, kind: "no_program" };
    await route.fulfill({
      status: path.endsWith("account/delete") ? removeStatus : 200,
      json,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/");
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Synthetic-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Hola, Ana")).toBeVisible();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  return calls;
}
for (const theme of ["light", "dark"] as const)
  test(`privacidad y ayuda ${theme} disponibles sin sesión, sin peticiones privadas`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const calls: string[] = [];
    await page.route(origin + "/api/mobile/v1/**", async (r) => {
      calls.push(r.request().url());
      await r.abort();
    });
    await page.goto("/privacy");
    await expect(page.getByText("Privacidad y ayuda", { exact: true })).toBeVisible();
    await expect(page.getByText("Salir, desinstalar o borrar", { exact: true })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`privacy-${theme}.png`), fullPage: true });
    await page.getByRole("button", { name: "Volver a iniciar sesión", exact: true }).click();
    await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
    expect(calls).toEqual([]);
  });
test("borrado nativo exige confirmación, limpia su cuenta y conserva tema/otras cuentas", async ({
  page,
}) => {
  const calls = await enter(page);
  await seedCompleteDownloads(page, '{"version":99}');
  await page.evaluate(
    ({ trainingKey, other, id }) => {
      localStorage.setItem(trainingKey, "pendiente sintético para eliminación explícita");
      localStorage.setItem(`is:native-training:v1:${other}`, "otra cuenta");
      localStorage.setItem(`is:native-sync:v1:${id}`, "cola para borrado explícito");
      localStorage.setItem(`is:native-sync:v1:${other}`, "otra cola");
      localStorage.setItem(
        `is:native-personal-exercises:v1:${id}`,
        "formato futuro para borrado explícito",
      );
      localStorage.setItem(`is:native-personal-exercises:v1:${other}`, "otros ejercicios privados");
      localStorage.setItem(
        "is:native-appearance:v1",
        JSON.stringify({ version: 1, preference: "dark" }),
      );
    },
    { trainingKey, other, id },
  );
  await page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Borrar mi cuenta para siempre", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Confirmación de borrado de cuenta", { exact: true }).fill("BORRAR");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Borrar mi cuenta para siempre", exact: true }).click();
  await expect(
    page.getByText(
      "Tu cuenta fue borrada del servidor y completamos la limpieza de este dispositivo.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(calls.filter((c) => c.endsWith("account/delete"))).toHaveLength(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), trainingKey)).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), receiptKey)).toBeNull();
  expect(
    await page.evaluate((id) => localStorage.getItem(`is:native-personal-exercises:v1:${id}`), id),
  ).toBeNull();
  expect(
    await page.evaluate(
      (id) => localStorage.getItem(`is:native-personal-exercises:v1:${id}`),
      other,
    ),
  ).toBe("otros ejercicios privados");
  expect(
    await page.evaluate((id) => localStorage.getItem(`is:native-sync:v1:${id}`), id),
  ).toBeNull();
  expect(await page.evaluate((id) => localStorage.getItem(`is:native-sync:v1:${id}`), other)).toBe(
    "otra cola",
  );
  expect(
    await page.evaluate((id) => localStorage.getItem(`is:native-training:v1:${id}`), other),
  ).toBe("otra cuenta");
  expect(await page.evaluate(() => localStorage.getItem("is:native-appearance:v1"))).toContain(
    "dark",
  );
  expect(await completeDownloadRows(page)).toEqual([
    { userId: other, raw: "other complete cache" },
  ]);
  expect(calls.filter((path) => path.endsWith("training-download"))).toEqual([]);
});
test("respuesta incierta conserva el registro y recibo tras recarga; volver no afirma eliminación", async ({
  page,
}) => {
  const calls = await enter(page, "student", 503);
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
  await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  await page.getByLabel("Peso serie 1", { exact: true }).fill("17");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }).click();
  await page.getByLabel("Confirmación de borrado de cuenta", { exact: true }).fill("BORRAR");
  await page.getByRole("button", { name: "Borrar mi cuenta para siempre", exact: true }).click();
  await expect(page.getByText("No pudimos confirmar el borrado.", { exact: true })).toBeVisible();
  const before = await page.evaluate((key) => localStorage.getItem(key), trainingKey);
  expect(before).toContain('"weight":"17"');
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).phase, receiptKey),
  ).toBe("requested");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Conservar datos y volver", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Borrar solo datos locales de esta cuenta", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Confirmación de borrado local", { exact: true }).fill("BORRAR LOCAL");
  await page.getByRole("button", { name: "Conservar datos y volver", exact: true }).click();
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), trainingKey)).toBe(before);
  expect(calls.filter((c) => c.endsWith("account/delete"))).toHaveLength(1);
  await expect(page.getByText(/Tu cuenta fue borrada del servidor/)).toHaveCount(0);
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("Synthetic-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }).click();
  await page.getByLabel("Confirmación de borrado de cuenta", { exact: true }).fill("BORRAR");
  await page.getByRole("button", { name: "Borrar mi cuenta para siempre", exact: true }).click();
  await expect(page.getByLabel("Confirmación de borrado local", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Borrar solo datos locales de esta cuenta", exact: true }),
  ).toBeDisabled();
});
test("fallo local tras éxito: al abrir reintenta limpieza sin repetir borrado remoto", async ({
  page,
}) => {
  const calls = await enter(page);
  await page.evaluate((key) => {
    localStorage.setItem(key, "local");
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (k: string) {
      if (k === key) throw Error("storage-denied");
      return original.call(this, k);
    };
  }, trainingKey);
  await page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }).click();
  await page.getByLabel("Confirmación de borrado de cuenta", { exact: true }).fill("BORRAR");
  await page.getByRole("button", { name: "Borrar mi cuenta para siempre", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar limpieza local", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).phase, receiptKey),
  ).toBe("confirmed");
  await page.reload();
  await page.getByRole("button", { name: "Reintentar limpieza local", exact: true }).click();
  await expect(page.getByText(/Tu cuenta fue borrada del servidor/)).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), trainingKey)).toBeNull();
  expect(calls.filter((c) => c.endsWith("account/delete"))).toHaveLength(1);
});
test("coach conserva gestión y no ofrece borrar; formato desconocido de recibo no se destruye", async ({
  page,
}) => {
  const calls = await enter(page, "coach");
  await expect(
    page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Planificar rutinas en la web", exact: true }),
  ).toBeVisible();
  await page.evaluate((key) => localStorage.setItem(key, '{"version":99}'), receiptKey);
  await page.reload();
  await expect(page.getByText(/No pudimos leer el recibo/)).toBeVisible();
  await page.getByRole("button", { name: "Reintentar lectura del recibo", exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), receiptKey)).toBe(
    '{"version":99}',
  );
  expect(calls.filter((c) => c.endsWith("account/delete"))).toHaveLength(0);
});

test("política y soporte públicos se abren por acción explícita, sin identidad", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { publicInfoOpened: string[] }).publicInfoOpened = [];
    window.open = (url) => {
      (window as unknown as { publicInfoOpened: string[] }).publicInfoOpened.push(String(url));
      return null;
    };
  });
  const privateCalls: string[] = [];
  await page.route(origin + "/api/mobile/v1/**", async (route) => {
    privateCalls.push(route.request().url());
    await route.abort();
  });
  await page.goto("/privacy");
  await expect(page.getByText("joaquindomarchi@gmail.com", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { publicInfoOpened: string[] }).publicInfoOpened,
    ),
  ).toEqual([]);
  for (const label of [
    "Leer política completa en la web",
    "Ayuda y contacto en la web",
    "Solicitar eliminación en la web",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  expect(
    await page.evaluate(
      () => (window as unknown as { publicInfoOpened: string[] }).publicInfoOpened,
    ),
  ).toEqual([origin + "/privacy", origin + "/support", origin + "/delete-account"]);
  expect(privateCalls).toEqual([]);
  await expect(page.getByText("Privacidad y ayuda", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.open = () => {
      throw new Error("Navegador no disponible");
    };
  });
  await page.getByRole("button", { name: "Ayuda y contacto en la web", exact: true }).click();
  await expect(
    page.getByText("No pudimos abrir el navegador. Puedes escribir a joaquindomarchi@gmail.com.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Volver a iniciar sesión", exact: true }),
  ).toBeVisible();
});

test("salir oculta la cuenta y conserva la descarga completa y los bytes de otras cuentas", async ({
  page,
}) => {
  const calls = await enter(page);
  const bundle = {
    version: 1,
    userId: id,
    downloadedAt: "2026-10-29T12:00:00Z",
    catalog: { version: 2, exercises: [] },
    library: { version: 2, userId: id, folders: [], routines: [] },
    week: null,
    history: {},
  };
  const raw = JSON.stringify({ version: 1, userId: id, bundle, previousBundle: null });
  await seedCompleteDownloads(page, raw);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("is:offline:active-user"))).toBeNull();
  expect(await completeDownloadRows(page)).toEqual([
    { userId: id, raw },
    { userId: other, raw: "other complete cache" },
  ]);
  expect(calls.filter((path) => path.endsWith("training-download"))).toEqual([]);
});
