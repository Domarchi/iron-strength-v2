import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const lifetime = 30 * 24 * 60 * 60 * 1000;
const identifier = /^iron-strength-(\d{8}T\d{6}Z)-[a-f0-9]{8}$/;
type FailureCode = "unsafe_root" | "invalid_backup" | "no_current_backup" | "delete_failed";
type Result = {
  ok: boolean;
  code?: FailureCode;
  eligible: string[];
  deleted: string[];
  skipped: number;
  errors: { id: string; code: FailureCode }[];
};
type Backup = { id: string; expires: number; manifest: string; cipher: string; key: string };

async function privatePath(file: string, directory: boolean) {
  const info = await lstat(file);
  return (
    !info.isSymbolicLink() &&
    (directory ? info.isDirectory() : info.isFile() && info.nlink === 1) &&
    info.uid === process.getuid?.() &&
    (info.mode & 0o777) === (directory ? 0o700 : 0o600)
  );
}

async function inspect(
  id: string,
  directory: string,
  keyDirectory: string,
): Promise<Backup | null> {
  const manifest = path.join(directory, `${id}.json`);
  if (!(await privatePath(manifest, false))) throw Error("invalid");
  const info = await lstat(manifest);
  if (info.size > 32 * 1024) throw Error("invalid");
  const parsed: unknown = JSON.parse(await readFile(manifest, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("invalid");
  const data = parsed as Record<string, unknown>;
  if (data.version !== 1) return null;
  const cipher = path.join(directory, `${id}.tar.gz.gpg`);
  const key = path.join(keyDirectory, `${id}.key`);
  const created = typeof data.createdAt === "string" ? Date.parse(data.createdAt) : NaN;
  const expires = typeof data.expiresAt === "string" ? Date.parse(data.expiresAt) : NaN;
  if (
    data.host !== "F.R.I.D.A.Y" ||
    data.destination !== directory ||
    data.cipherFile !== path.basename(cipher) ||
    data.keyPath !== key ||
    data.retentionDays !== 30 ||
    !Number.isFinite(created) ||
    !Number.isFinite(expires) ||
    expires - created !== lifetime ||
    new Date(created).toISOString().slice(0, 19).replaceAll(/[-:]/g, "") + "Z" !==
      identifier.exec(id)?.[1] ||
    typeof data.cipherSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.cipherSha256) ||
    !Number.isSafeInteger(data.cipherBytes) ||
    (data.cipherBytes as number) <= 0 ||
    ![
      "decryptedBytesIdentical",
      "sourceSqlHashesVerified",
      "wrongKeyRejected",
      "corruptionRejected",
      "privatePermissionsVerified",
    ].every((field) => data[field] === true) ||
    !(await privatePath(cipher, false)) ||
    !(await privatePath(key, false))
  )
    throw Error("invalid");
  if ((await lstat(cipher)).size !== data.cipherBytes) throw Error("invalid");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(cipher)) hash.update(chunk);
  if (hash.digest("hex") !== data.cipherSha256) throw Error("invalid");
  return { id, expires, manifest, cipher, key };
}

/** Examina únicamente manifiestos propios; no interpreta sus rutas como instrucciones. */
export async function pruneBackups(options: {
  directory: string;
  keyDirectory: string;
  now: Date;
  apply?: boolean;
}): Promise<Result> {
  const { directory, keyDirectory, now, apply = false } = options;
  const result: Result = { ok: true, eligible: [], deleted: [], skipped: 0, errors: [] };
  try {
    if (
      !Number.isFinite(now.getTime()) ||
      !path.isAbsolute(directory) ||
      !path.isAbsolute(keyDirectory) ||
      directory === keyDirectory ||
      (await realpath(directory)) !== directory ||
      (await realpath(keyDirectory)) !== keyDirectory ||
      !(await privatePath(directory, true)) ||
      !(await privatePath(keyDirectory, true))
    )
      throw Error("invalid");
  } catch {
    return { ...result, ok: false, code: "unsafe_root" };
  }
  const valid: Backup[] = [];
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return { ...result, ok: false, code: "unsafe_root" };
  }
  for (const name of names.sort()) {
    if (!name.endsWith(".json") || !identifier.test(name.slice(0, -5))) continue;
    const id = name.slice(0, -5);
    try {
      const backup = await inspect(id, directory, keyDirectory);
      if (!backup) result.skipped++;
      else if (backup.expires - lifetime > now.getTime()) throw Error("invalid");
      else valid.push(backup);
    } catch {
      result.errors.push({ id, code: "invalid_backup" });
    }
  }
  const expired = valid.filter((backup) => backup.expires <= now.getTime());
  result.eligible = expired.map((backup) => backup.id);
  if (expired.length && !valid.some((backup) => backup.expires > now.getTime()))
    return { ...result, ok: false, code: "no_current_backup" };
  if (apply)
    for (const backup of expired) {
      try {
        // Revalidar antes de retirar cada conjunto; un fallo conserva lo que quede e informa.
        if (!(await inspect(backup.id, directory, keyDirectory))) throw Error("invalid");
        await unlink(backup.cipher);
        await unlink(backup.key);
        await unlink(backup.manifest);
        result.deleted.push(backup.id);
      } catch {
        result.errors.push({ id: backup.id, code: "delete_failed" });
      }
    }
  result.ok = result.errors.length === 0;
  return result;
}
