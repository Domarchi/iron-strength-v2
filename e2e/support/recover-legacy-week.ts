import { expect, type Page } from "@playwright/test";
import { parseNativeWeek } from "../../src/lib/mobile/download-contract";
import { COACH } from "./db";
/** Recovery fixture only: current UI no longer creates partial legacy packages. */
export async function recoverLegacyWeek(
  page: Page,
  email = COACH.email,
  password = COACH.password,
) {
  const auth = await page.request.post("/api/mobile/v1/auth/login", { data: { email, password } });
  expect(auth.status()).toBe(200);
  const identity = await auth.json();
  const response = await page.request.get("/api/mobile/v1/week/download", {
    headers: { Authorization: `Bearer ${identity.accessToken}` },
  });
  expect(response.status()).toBe(200);
  const record = parseNativeWeek(await response.json(), identity.profile.id);
  if (!record?.pack) throw Error("Legacy fixture unavailable");
  await page.evaluate(async (pack) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("iron-strength-offline", 1);
      open.onupgradeneeded = () =>
        open.result
          .createObjectStore("weeks", { keyPath: ["userId", "program.id", "weekStart"] })
          .createIndex("userId", "userId");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("weeks", "readwrite");
        tx.objectStore("weeks").put(pack);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, record.pack);
  return record.pack;
}
