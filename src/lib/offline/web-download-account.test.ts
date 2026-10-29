import { expect, it, vi } from "vitest";
import { DownloadController } from "./download-controller";
import { trainingDownloadFixture } from "@/test/fixtures/training-download";
import { reserveWebDownloadAccount } from "./web-download-account";
it("espera el commit de una descarga antes de reservar el bloqueo que esa descarga necesita", async () => {
  const bundle = trainingDownloadFixture(),
    events: string[] = [];
  let complete!: (v: unknown) => void,
    raw: string | null = null;
  const fetched = new Promise<unknown>((r) => {
    complete = r;
  });
  const c = new DownloadController(
    bundle.userId,
    {
      get: async () => raw,
      compareAndSet: async (_key, _before, next) => {
        events.push("download-commit");
        raw = next;
      },
    },
    () => fetched,
    () => true,
  );
  await c.restore();
  const pending = c.download();
  const reserved = reserveWebDownloadAccount(c, async () => {
    events.push("training-reserved");
    return () => {
      events.push("training-released");
    };
  });
  expect(c.getSnapshot().reserved).toBe(true);
  expect(events).toEqual([]);
  complete(bundle);
  const release = await reserved;
  expect(await pending).toBe(true);
  expect(events).toEqual(["download-commit", "training-reserved"]);
  expect(await c.download()).toBe(false);
  release();
  release();
  expect(events).toEqual(["download-commit", "training-reserved", "training-released"]);
  expect(c.getSnapshot().reserved).toBe(false);
});
it("libera la descarga si falla la reserva del entrenamiento", async () => {
  const release = vi.fn(),
    reserve = vi.fn(async () => release);
  await expect(
    reserveWebDownloadAccount({ reserve }, async () => {
      throw Error("training unavailable");
    }),
  ).rejects.toThrow("training unavailable");
  expect(release).toHaveBeenCalledTimes(1);
});
it("si falla reservar la descarga no toma la reserva de entrenamiento", async () => {
  const second = vi.fn();
  await expect(
    reserveWebDownloadAccount(
      {
        reserve: async () => {
          throw Error("download unavailable");
        },
      },
      second,
    ),
  ).rejects.toThrow("download unavailable");
  expect(second).not.toHaveBeenCalled();
});
it("incluso un fallo al liberar la segunda reserva libera la primera", async () => {
  const release = vi.fn();
  const done = await reserveWebDownloadAccount({ reserve: async () => release }, async () => () => {
    throw Error("release failed");
  });
  expect(done).toThrow("release failed");
  expect(release).toHaveBeenCalledTimes(1);
  done();
  expect(release).toHaveBeenCalledTimes(1);
});
