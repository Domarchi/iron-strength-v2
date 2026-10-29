import type { Page } from "@playwright/test";
export async function readDownloadCache(page: Page, userId: string) {
  return page.evaluate(
    (userId) =>
      new Promise<string | null>((resolve, reject) => {
        const opening = indexedDB.open("iron-strength-training-download", 1);
        opening.onerror = () => reject(Error("open"));
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction("bundles", "readonly"),
            get = tx.objectStore("bundles").get(userId);
          let raw: string | null = null;
          get.onsuccess = () => {
            raw = get.result?.raw ?? null;
          };
          tx.oncomplete = () => {
            db.close();
            resolve(raw);
          };
          tx.onabort = tx.onerror = () => {
            db.close();
            reject(Error("read"));
          };
        };
      }),
    userId,
  );
}
export async function writeDownloadCache(page: Page, userId: string, raw: string) {
  await page.evaluate(
    ({ userId, raw }) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("iron-strength-training-download", 1);
        opening.onerror = () => reject(Error("open"));
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction("bundles", "readwrite");
          tx.objectStore("bundles").put({ userId, raw });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = tx.onerror = () => {
            db.close();
            reject(Error("write"));
          };
        };
      }),
    { userId, raw },
  );
}

/** Scope to the accessible route; inactive Expo screens may remain mounted offscreen. */
export function downloadCard(page: Page) {
  return page.getByRole("heading", { name: "Sin conexión", exact: true }).locator("..");
}
