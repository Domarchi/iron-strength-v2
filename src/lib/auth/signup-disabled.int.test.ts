import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, resetUsers } from "@/test/int/helpers";

describe("registro público deshabilitado (RF-4)", () => {
  afterAll(() => resetUsers(adminClient()));

  it("un visitante no puede crear una cuenta con signUp", async () => {
    const { data, error } = await anonClient().auth.signUp({
      email: "intruso@test.local",
      password: "una-contraseña-larga-123",
    });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("el alta por la API de administración sigue funcionando (registro por invitación)", async () => {
    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: "invitado@test.local",
      password: "una-contraseña-larga-123",
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect(data.user?.email).toBe("invitado@test.local");
  });
});
