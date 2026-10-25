import { expect, it } from "vitest";
import { createStorageQueue } from "./storage-queue";
it("una transacción de descarga no se solapa con series y un fallo no envenena la cola", async () => {
  const run = createStorageQueue(),
    calls: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const download = run(async () => {
    calls.push("download:start");
    await held;
    calls.push("download:end");
  });
  const series = run(async () => {
    calls.push("series");
    return 12;
  });
  await Promise.resolve();
  expect(calls).toEqual(["download:start"]);
  release();
  await download;
  expect(await series).toBe(12);
  const failed = run(async () => {
    calls.push("failure");
    throw Error("quota");
  });
  const next = run(async () => {
    calls.push("next");
  });
  await expect(failed).rejects.toThrow("quota");
  await next;
  expect(calls).toEqual(["download:start", "download:end", "series", "failure", "next"]);
});
