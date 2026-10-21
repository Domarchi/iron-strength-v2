import { createServer, request as forward } from "node:http";
import type { AddressInfo } from "node:net";
import { test as base } from "@playwright/test";

// Un origen por prueba permite cortar la red real sin interceptar el service worker.
// WebKit setOffline falla antes de que el worker pueda responder (Playwright #42775).
type Network = {
  url: string;
  offline: boolean;
  blocked: Set<string>;
  lostResponses: Set<string>;
  stopAfterLoss: Set<string>;
  apiEvents: { path: string; method: string; outcome: string }[];
  holds: Map<string, Promise<void>>;
};
export const test = base.extend<{ network: Network }>({
  network: async ({}, provide) => {
    const network: Network = {
      url: "",
      offline: false,
      blocked: new Set(),
      lostResponses: new Set(),
      stopAfterLoss: new Set(),
      apiEvents: [],
      holds: new Map(),
    };
    const server = createServer(async (req, res) => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      const apiEvent = path.startsWith("/api/")
        ? { path, method: req.method ?? "GET", outcome: "received" }
        : null;
      if (apiEvent) network.apiEvents.push(apiEvent);
      if (network.offline || network.blocked.has(path)) {
        // Una respuesta fallida cerrada evita que WebKit deje fetch pendiente al cerrar
        // la última página. Nunca se reenvía a la API real durante el corte.
        if (path.startsWith("/api/")) {
          if (apiEvent) apiEvent.outcome = "blocked 503";
          res.writeHead(503, { "Content-Type": "application/json", Connection: "close" });
          res.end(JSON.stringify({ error: "Isolated network unavailable" }));
        } else req.socket.destroy();
        return;
      }
      if (req.method === "POST") await network.holds.get(path);
      const lose = req.method === "POST" && network.lostResponses.delete(path);
      const upstream = forward(
        {
          hostname: "127.0.0.1",
          port: 3100,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, "x-forwarded-host": req.headers.host },
        },
        (response) => {
          if (apiEvent) apiEvent.outcome = `${lose ? "lost" : "forwarded"} ${response.statusCode}`;
          if (lose) {
            response.resume();
            response.on("end", () => {
              if (network.stopAfterLoss.delete(path)) network.blocked.add(path);
              req.socket.destroy();
            });
          } else {
            res.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(res);
          }
        },
      );
      upstream.on("error", () => req.socket.destroy());
      req.pipe(upstream);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    network.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      await provide(network);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  baseURL: async ({ network }, provide) => provide(network.url),
});

// Solo estado de operaciones del almacenamiento: sin valores ni datos del entrenamiento.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const events: { kind: string; database: string; state: string }[] = [];
    Object.defineProperty(window, "__ironStorageProbe", { value: events });
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, version) => {
      const event = { kind: "open", database: name, state: "pending" };
      events.push(event);
      const request = open(name, version);
      for (const state of ["success", "error", "blocked", "upgradeneeded"])
        request.addEventListener(state, () => {
          event.state = state;
        });
      return request;
    };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) {
      const event = { kind: "transaction", database: this.name, state: "pending" };
      events.push(event);
      const tx = transaction.apply(this, args);
      for (const state of ["complete", "abort", "error"])
        tx.addEventListener(state, () => {
          event.state = state;
        });
      return tx;
    };
  });
});

// Solo texto de la interfaz de prueba local; nunca cookies, cabeceras o credenciales.
// Los logs permiten diagnosticar una página nueva aunque la página inicial ya esté cerrada.
test.afterEach(async ({ context, network }, info) => {
  if (info.status === info.expectedStatus) return;
  console.log("Offline API transport:", JSON.stringify(network.apiEvents.slice(-12)));
  for (const page of context.pages()) {
    if (!page.url().startsWith(`${network.url}/`)) continue;
    const text = await page
      .locator("body")
      .innerText({ timeout: 1000 })
      .catch(() => "No se pudo leer la pantalla de prueba.");
    const storage = await Promise.race([
      page
        .evaluate(() => ({
          visibility: document.visibilityState,
          online: navigator.onLine,
          workerState: navigator.serviceWorker?.controller?.state ?? null,
          operations: (
            window as Window & {
              __ironStorageProbe?: { kind: string; database: string; state: string }[];
            }
          ).__ironStorageProbe?.slice(-15),
        }))
        .catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve("probe timeout"), 2000)),
    ]);
    console.log("Offline storage operations:", JSON.stringify(storage));
    console.log(
      "Offline test screen:",
      JSON.stringify({ path: new URL(page.url()).pathname, text: text.slice(0, 8000) }),
    );
  }
});
