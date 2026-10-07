import { describe, expect, it } from "vitest";
import { generateToken, hashToken, INVITATION_TTL_DAYS } from "./token";

describe("tokens de invitación", () => {
  it("genera tokens largos, distintos y seguros para una URL", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes en base64url, sin relleno
  });

  it("el hash es sha256 en hexadecimal, estable y no revela el token", () => {
    const token = generateToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token.slice(0, 8));
    expect(hashToken(generateToken())).not.toBe(hashToken(token));
  });

  it("las invitaciones duran 7 días (RF-1)", () => {
    expect(INVITATION_TTL_DAYS).toBe(7);
  });
});
