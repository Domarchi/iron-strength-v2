// Captura las filas de cada propuesta. Uso: node docs/design-refresh/brand/capture.cjs (servidor estático en 8110).
const { chromium } = require("@playwright/test");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1900, height: 900 },
    deviceScaleFactor: 1,
  });
  const msgs = [];
  page.on("console", (m) => m.type() === "error" && msgs.push(m.text()));
  page.on("pageerror", (e) => msgs.push(String(e)));
  await page.goto("http://127.0.0.1:8110/index.html");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const out = path.join(__dirname, "captures");
  for (const p of ["a", "b"]) {
    const rows = page.locator(`#${p} .row`);
    const n = await rows.count();
    for (let i = 1; i < n; i++) {
      const theme = i === 1 ? "dark" : "light";
      await rows.nth(i).screenshot({ path: path.join(out, `${p}-${theme}.png`) });
    }
  }
  console.log("errores de consola:", JSON.stringify(msgs));
  await browser.close();
})();
