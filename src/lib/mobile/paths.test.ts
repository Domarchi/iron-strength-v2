import { expect, it } from "vitest";
import { isMobileEndpointPath } from "./paths";
import { accessDecision } from "../auth/route-access";
it("solo los endpoints móviles exactos llegan a su guarda JWT; las pantallas siguen protegidas", () => {
  for (const path of [
    "/api/mobile/v1/week",
    "/api/mobile/v1/workouts",
    "/api/mobile/v1/progress",
    "/api/mobile/v1/workouts/11111111-1111-4111-8111-111111111111",
    "/api/mobile/v1/auth/login",
    "/api/mobile/v1/auth/invitation",
    "/api/mobile/v1/auth/register",
    "/api/mobile/v1/auth/reset-password",
    "/api/mobile/v1/auth/refresh",
    "/api/mobile/v1/auth/logout",
    "/api/mobile/v1/account/delete",
    "/api/mobile/v1/sessions/11111111-1111-4111-8111-111111111111",
  ]) {
    expect(isMobileEndpointPath(path)).toBe(true);
    expect(accessDecision(path, false)).toBe("allow");
  }
  for (const path of [
    "/week",
    "/coach",
    "/api/mobile/v1/anything",
    "/api/mobile/v1/account/delete/other",
    "/api/mobile/v1/auth/register/extra",
    "/api/mobile/v1/workouts/not-uuid",
    "/api/mobile/v1/workouts/other/extra",
    "/api/mobile/v1/week/other",
    "/api/mobile/v1/sessions/not-uuid",
  ]) {
    expect(isMobileEndpointPath(path)).toBe(false);
    expect(accessDecision(path, false)).toBe("redirect-login");
  }
});
