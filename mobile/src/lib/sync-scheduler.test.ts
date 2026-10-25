import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncScheduler } from "./sync-scheduler";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const online = { active: true, reachable: true, online: true, key: "first" };
it("trabajo nuevo online se inicia y una confirmación no genera un bucle", async () => {
  const run = vi.fn(async () => false),
    s = new SyncScheduler(run);
  s.update(online);
  await vi.advanceTimersByTimeAsync(0);
  expect(run).toHaveBeenCalledTimes(1);
  s.update(online);
  await vi.advanceTimersByTimeAsync(60000);
  expect(run).toHaveBeenCalledTimes(1);
  s.update({ ...online, key: "second" });
  await vi.advanceTimersByTimeAsync(0);
  expect(run).toHaveBeenCalledTimes(2);
  s.dispose();
});
it("servicio sin conexión usa esperas crecientes y no reintenta inmediatamente al fallar", async () => {
  const run = vi.fn(async () => true),
    s = new SyncScheduler(run);
  s.update({ ...online, online: false });
  await vi.advanceTimersByTimeAsync(4999);
  expect(run).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(15000);
  expect(run).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(30000);
  expect(run).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(60000);
  expect(run).toHaveBeenCalledTimes(5);
  s.dispose();
});
it("sin red o en segundo plano no inicia; volver al primer plano o recuperar red adelanta la comprobación", async () => {
  const run = vi.fn(async () => false),
    s = new SyncScheduler(run);
  s.update({ ...online, reachable: false });
  await vi.advanceTimersByTimeAsync(60000);
  expect(run).not.toHaveBeenCalled();
  s.update(online);
  await vi.advanceTimersByTimeAsync(0);
  expect(run).toHaveBeenCalledTimes(1);
  s.update({ ...online, active: false, key: "second" });
  expect(await s.manual()).toBeNull();
  await vi.advanceTimersByTimeAsync(60000);
  expect(run).toHaveBeenCalledTimes(1);
  s.update({ ...online, key: "second" });
  await vi.advanceTimersByTimeAsync(0);
  expect(run).toHaveBeenCalledTimes(2);
  s.dispose();
});
it("el botón manual adelanta el intento y comparte una operación que ya está en vuelo", async () => {
  let done!: (retry: boolean) => void;
  const run = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          done = resolve;
        }),
    ),
    s = new SyncScheduler(run);
  s.update({ ...online, online: false });
  const a = s.manual(),
    b = s.manual();
  expect(run).toHaveBeenCalledTimes(1);
  done(false);
  await Promise.all([a, b]);
  await vi.advanceTimersByTimeAsync(60000);
  expect(run).toHaveBeenCalledTimes(1);
  s.dispose();
});
it("desmontar cancela esperas y una respuesta tardía no inicia otro intento", async () => {
  let done!: (retry: boolean) => void;
  const run = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          done = resolve;
        }),
    ),
    s = new SyncScheduler(run);
  s.update(online);
  const active = s.manual();
  s.dispose();
  done(true);
  await active;
  await vi.advanceTimersByTimeAsync(120000);
  expect(run).toHaveBeenCalledTimes(1);
});
