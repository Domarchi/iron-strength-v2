import { invitationTokenSchema, recoveryTokenSchema } from "./contracts";
/** The production scheme is registered by Expo; Go users can paste the same HTTPS link. */
export function nativeAccessLink(kind: "invite" | "reset", token: string): string | null {
  if (!(kind === "invite" ? invitationTokenSchema : recoveryTokenSchema).safeParse(token).success)
    return null;
  const url = new URL("iron-strength://access");
  url.searchParams.set("kind", kind);
  url.searchParams.set("token", token);
  return url.toString();
}
