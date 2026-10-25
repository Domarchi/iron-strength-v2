import { expect, it, vi } from "vitest";
import { MobileClient, type Transport } from "./client";
import type { WorkoutPayload } from "../../../src/lib/workout/runner-state";
const id = "11111111-1111-4111-8111-111111111111";
const session = {
  version: 1,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4000000000,
  profile: { id, fullName: "Ana", email: "ana@example.test", role: "student" },
};
const payload: WorkoutPayload = {
  id,
  programId: id,
  programSessionId: id,
  sessionLabel: "A",
  startedAt: "2026-10-24T15:00:00Z",
  finishedAt: "2026-10-24T15:10:00Z",
  durationSeconds: 600,
  sets: [
    {
      exerciseId: id,
      exerciseName: "Sentadilla",
      position: 0,
      setNumber: 1,
      weightKg: 50,
      reps: 10,
      isWarmup: false,
    },
  ],
};
async function setup() {
  let raw: string | null = null;
  const transport = vi.fn<Transport>(async () => Response.json(session));
  const client = new MobileClient(
    "https://iron-strength-seven.vercel.app",
    {
      get: async () => raw,
      set: async (value) => {
        raw = value;
      },
      remove: async () => {
        raw = null;
      },
    },
    transport,
  );
  await client.login(session.profile.email, "Synthetic-password");
  return { client, transport };
}
it("solo una confirmación coincidente invalida las consultas abiertas de la cuenta", async () => {
  const { client, transport } = await setup();
  const initial = client.getDataRevision();
  transport.mockResolvedValueOnce(
    Response.json({
      version: 1,
      ok: true,
      status: "created",
      workoutId: "22222222-2222-4222-8222-222222222222",
    }),
  );
  await expect(client.saveWorkout(payload, id)).rejects.toMatchObject({ code: "identity" });
  expect(client.getDataRevision()).toBe(initial);
  transport.mockResolvedValueOnce(
    Response.json({ version: 1, ok: true, status: "duplicate", workoutId: id }),
  );
  await client.saveWorkout(payload, id);
  expect(client.getDataRevision()).toBe(initial + 1);
});
it("una señal de desconexión retira el bearer de memoria sin inferir otra identidad", async () => {
  const { client, transport } = await setup();
  client.connectionLost();
  expect(client.getSnapshot()).toMatchObject({
    status: "authenticated",
    mode: "offline",
    session: { profile: session.profile, accessToken: null, expiresAt: null },
  });
  await expect(client.week()).rejects.toMatchObject({ code: "offline" });
  expect(transport).toHaveBeenCalledTimes(1);
});
