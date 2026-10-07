import { createHash, randomBytes } from "node:crypto";

export const INVITATION_TTL_DAYS = 7;

// 32 bytes aleatorios en base64url (43 caracteres, apto para una URL).
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

// En la base solo se guarda el hash: ver un registro de invitations no permite usar el enlace.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
