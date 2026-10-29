import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { createServer } from "node:http";
import { resolve } from "node:path";
// Real storage/browser tests, separate from application offline and physical-device acceptance.
test("IndexedDB real conserva CAS/recuperación y aborta cuota, relectura o una escritura tras cambiar cuenta", async ({
  playwright,
  browserName,
}, info) => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    resolve: { alias: { "@": resolve(process.cwd(), "src") } },
    build: {
      write: false,
      target: "es2022",
      minify: false,
      lib: {
        entry: resolve(process.cwd(), "e2e/support/download-storage.entry.ts"),
        name: "IronDownloadStorageTest",
        formats: ["iife"],
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result],
    chunks = outputs
      .flatMap((r) => ("output" in r ? r.output : []))
      .filter((r) => r.type === "chunk");
  expect(chunks).toHaveLength(1);
  const code = chunks[0].code;
  const server = createServer((request, response) => {
    if (request.url === "/probe.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(code);
    } else if (request.url === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<!doctype html><meta charset="utf-8"><script src="/probe.js"></script><title>Storage test</title>',
      );
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("missing test listener");
  const url = `http://127.0.0.1:${address.port}/`,
    profile = info.outputPath("profile");
  let context: Awaited<ReturnType<typeof playwright.chromium.launchPersistentContext>> | undefined;
  const boot = async (page: Page) => {
    await page.goto(url);
    await page.waitForFunction(() => !!window.IronDownloadProbe);
  };
  try {
    context = await playwright[browserName].launchPersistentContext(profile, { headless: true });
    let page = await context.newPage();
    await boot(page);
    expect(await page.evaluate(() => window.IronDownloadProbe.first())).toEqual({
      conflict: true,
      foreign: true,
      preserved: true,
      created: true,
      updated: true,
    });
    await context.close();
    context = await playwright[browserName].launchPersistentContext(profile, { headless: true });
    page = await context.newPage();
    await boot(page);
    expect(await page.evaluate(() => window.IronDownloadProbe.cold())).toEqual({
      verified: true,
      current: "2026-10-29T13:00:00Z",
      previous: "2026-10-29T12:00:00Z",
    });
    expect(await page.evaluate(() => window.IronDownloadProbe.quota())).toEqual({
      saved: false,
      verified: false,
      preserved: true,
      code: "quota",
    });
    expect(await page.evaluate(() => window.IronDownloadProbe.mismatch())).toEqual({
      saved: false,
      verified: false,
      preserved: true,
      code: "storage",
    });
    expect(await page.evaluate(() => window.IronDownloadProbe.unknown())).toEqual({
      kept: { cleared: false, retainedUnknown: true },
      unknownIntact: true,
      removed: { cleared: true, retainedUnknown: false },
      otherIntact: true,
    });
    const second = await context.newPage();
    await boot(second);
    await page.evaluate(() => window.IronDownloadProbe.hold());
    const late = second.evaluate(() => window.IronDownloadProbe.writeAfterAccount());
    await second.waitForFunction(() => window.IronDownloadProbe.writeStarted);
    await page.evaluate(() => window.IronDownloadProbe.deleteAndRelease());
    expect(await late).toEqual({ saved: false, code: "account_changed" });
    expect(await page.evaluate(() => window.IronDownloadProbe.isolation())).toEqual({
      empty: true,
      other: true,
      training: true,
    });
  } finally {
    await context?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
