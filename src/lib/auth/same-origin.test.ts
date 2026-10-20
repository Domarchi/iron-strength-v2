import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./same-origin";
describe("origen del envío JSON", () => {
  it("usa el host público aunque Next reconstruya una dirección interna", () => {
    expect(
      isSameOrigin(
        new Request("http://localhost:3100/api/workouts/sync", {
          headers: { origin: "http://127.0.0.1:3100", host: "127.0.0.1:3100" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        new Request("http://internal/api/workouts/sync", {
          headers: {
            origin: "https://iron.example",
            host: "iron.example",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).toBe(true);
  });
  it("rechaza origen ausente, ajeno, esquema diferente y host inyectado", () => {
    for (const origin of [
      "",
      "null",
      "https://otra.example",
      "http://iron.example",
      "https://iron.example/otro",
    ])
      expect(
        isSameOrigin(
          new Request("http://internal/api/workouts/sync", {
            headers: { origin, host: "iron.example", "x-forwarded-proto": "https" },
          }),
        ),
      ).toBe(false);
    expect(
      isSameOrigin(
        new Request("http://localhost/api/workouts/sync", {
          headers: {
            origin: "http://otra.example",
            host: "localhost",
            "x-forwarded-host": "otra.example",
          },
        }),
      ),
    ).toBe(false);
  });
});
