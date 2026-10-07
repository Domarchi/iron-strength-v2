import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, randomPassword, resetUsers } from "@/test/int/helpers";
import { createCoach } from "./create-coach";

const admin = adminClient();

describe("createCoach (alta única del coach, DC-1)", () => {
  beforeAll(() => resetUsers(admin));
  afterAll(() => resetUsers(admin));

  it("crea el usuario y su perfil con rol coach, coach de sí mismo", async () => {
    const { id } = await createCoach(admin, {
      email: "coach@test.local",
      password: randomPassword(),
      name: "Coach de prueba",
    });

    const { data: profile } = await admin.from("profiles").select("*").eq("id", id).single();
    expect(profile).toMatchObject({
      role: "coach",
      coach_id: id,
      full_name: "Coach de prueba",
      is_active: true,
    });
  });

  it("rechaza un segundo coach con un mensaje claro y no deja usuarios huérfanos", async () => {
    await expect(
      createCoach(admin, { email: "otro@test.local", password: randomPassword(), name: "Otro" }),
    ).rejects.toThrow(/Ya existe un coach/);

    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    expect(data.users.map((u) => u.email)).toEqual(["coach@test.local"]);
  });

  it("valida los datos de entrada", async () => {
    await resetUsers(admin);
    await expect(
      createCoach(admin, { email: "no-es-correo", password: randomPassword(), name: "X" }),
    ).rejects.toThrow(/correo/i);
    await expect(
      createCoach(admin, { email: "a@test.local", password: "corta", name: "X" }),
    ).rejects.toThrow(/8 caracteres/);
    await expect(
      createCoach(admin, { email: "a@test.local", password: randomPassword(), name: "  " }),
    ).rejects.toThrow(/nombre/i);
  });
});
