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
  holds: Map<string, Promise<void>>;
};
export const test = base.extend<{ network: Network }>({
  network: async ({}, provide) => {
    const network: Network = {
      url: "",
      offline: false,
      blocked: new Set(),
      lostResponses: new Set(),
      holds: new Map(),
    };
    const server = createServer(async (req, res) => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (network.offline || network.blocked.has(path)) {
        req.socket.destroy();
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
          if (lose) {
            response.resume();
            response.on("end", () => req.socket.destroy());
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
