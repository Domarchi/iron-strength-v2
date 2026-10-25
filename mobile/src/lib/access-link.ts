import { invitationTokenSchema, recoveryTokenSchema } from "../../../src/lib/mobile/contracts";
export type AccessTicket = { kind: "invite" | "reset"; token: string };
export function accessTicket(kind: unknown, token: unknown): AccessTicket | null {
  if (kind !== "invite" && kind !== "reset") return null;
  return (kind === "invite" ? invitationTokenSchema : recoveryTokenSchema).safeParse(token).success
    ? { kind, token: token as string }
    : null;
}
export function parseAccessLink(value: string, origin: string): AccessTicket | null {
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.hash) return null;
    if (["iron-strength:", "iron-strength-preview:", "iron-strength-dev:"].includes(url.protocol)) {
      if (url.port || url.hostname !== "access" || (url.pathname && url.pathname !== "/"))
        return null;
      const keys = [...url.searchParams.keys()];
      if (keys.length !== 2 || !keys.includes("kind") || !keys.includes("token")) return null;
      return accessTicket(url.searchParams.get("kind"), url.searchParams.get("token"));
    }
    if (url.origin !== origin || url.search) return null;
    const match = /^\/(invite|reset)\/([^/]+)$/.exec(url.pathname);
    return match ? accessTicket(match[1], match[2]) : null;
  } catch {
    return null;
  }
}
