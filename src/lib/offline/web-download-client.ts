import { z } from "zod";
import { bundleSchema, type Bundle } from "./training-bundle";
import { DownloadFault } from "./download-controller";
const LIMIT = 16777216;
async function readJson(response: Response): Promise<unknown> {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get("content-type") ?? ""))
    throw new DownloadFault("format");
  if (Number(response.headers.get("content-length")) > LIMIT) {
    await response.body?.cancel().catch(() => {});
    throw new DownloadFault("capacity");
  }
  if (!response.body) throw new DownloadFault("format");
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    text = "";
  try {
    for (;;) {
      const part = await reader.read().catch(() => {
        throw new DownloadFault("network");
      });
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > LIMIT) {
        await reader.cancel().catch(() => {});
        throw new DownloadFault("capacity");
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}
/** A captured account guards the cookie identity; it never selects a different owner's data. */
export async function readWebTrainingDownload(
  userId: string,
  transport: typeof fetch = fetch,
): Promise<Bundle> {
  const owner = z
    .uuid()
    .transform((v) => v.toLowerCase())
    .safeParse(userId);
  if (!owner.success) throw new DownloadFault("account_changed");
  let response: Response;
  try {
    response = await transport("/api/training/download", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "X-Iron-Strength-Account": owner.data },
    });
  } catch {
    throw new DownloadFault("network");
  }
  let raw: unknown;
  try {
    raw = await readJson(response);
  } catch (error) {
    if (response.status === 401) throw new DownloadFault("unauthorized");
    if (!response.ok) throw new DownloadFault("network");
    throw error instanceof DownloadFault ? error : new DownloadFault("format");
  }
  if (!response.ok) {
    const code = z
      .object({ version: z.literal(1), error: z.object({ code: z.string() }) })
      .safeParse(raw);
    if (response.status === 401) throw new DownloadFault("unauthorized");
    if (code.success && code.data.error.code === "account_changed" && response.status === 403)
      throw new DownloadFault("account_changed");
    if (code.success && code.data.error.code === "capacity" && response.status === 409)
      throw new DownloadFault("capacity");
    throw new DownloadFault("network");
  }
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) throw new DownloadFault("format");
  if (parsed.data.userId !== owner.data) throw new DownloadFault("account_changed");
  return parsed.data;
}
