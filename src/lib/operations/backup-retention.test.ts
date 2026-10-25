import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, lstat, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { pruneBackups } from "./backup-retention";

const now = new Date("2026-10-25T12:00:00Z");
const days = 30 * 24 * 60 * 60 * 1000;
let root: string;
let directory: string;
let keyDirectory: string;

async function fixture(createdAt: string, suffix: string) {
  const date = new Date(createdAt);
  const stamp = date.toISOString().slice(0, 19).replaceAll(/[-:]/g, "");
  const id = `iron-strength-${stamp}Z-${suffix}`;
  const cipher = Buffer.from(`encrypted fixture ${suffix}`);
  const keyPath = path.join(keyDirectory, `${id}.key`);
  const metadata = {
    version: 1,
    host: "F.R.I.D.A.Y",
    destination: directory,
    cipherFile: `${id}.tar.gz.gpg`,
    keyPath,
    cipherSha256: createHash("sha256").update(cipher).digest("hex"),
    cipherBytes: cipher.length,
    createdAt: date.toISOString(),
    expiresAt: new Date(date.getTime() + days).toISOString(),
    retentionDays: 30,
    decryptedBytesIdentical: true,
    sourceSqlHashesVerified: true,
    wrongKeyRejected: true,
    corruptionRejected: true,
    privatePermissionsVerified: true,
  };
  const manifest = path.join(directory, `${id}.json`);
  const encrypted = path.join(directory, metadata.cipherFile);
  await writeFile(manifest, JSON.stringify(metadata), { mode: 0o600 });
  await writeFile(encrypted, cipher, { mode: 0o600 });
  await writeFile(keyPath, "fixture key", { mode: 0o600 });
  return { id, manifest, encrypted, keyPath, metadata };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "is-retention-"));
  directory = path.join(root, "backups");
  keyDirectory = path.join(root, "keys");
  await mkdir(directory, { mode: 0o700 });
  await mkdir(keyDirectory, { mode: 0o700 });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("retención de respaldos locales", () => {
  it("solo retira el par vencido y su clave, conservando la copia vigente", async () => {
    const old = await fixture("2026-09-25T12:00:00Z", "aaaaaaaa");
    const fresh = await fixture("2026-10-25T11:00:00Z", "bbbbbbbb");
    const result = await pruneBackups({ directory, keyDirectory, now, apply: true });
    expect(result).toMatchObject({ ok: true, eligible: [old.id], deleted: [old.id] });
    for (const file of [old.manifest, old.encrypted, old.keyPath])
      await expect(lstat(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(fresh.encrypted)).toEqual(Buffer.from("encrypted fixture bbbbbbbb"));
    expect((await lstat(fresh.keyPath)).isFile()).toBe(true);
  });

  it("muestra una vista previa sin eliminar antes de --apply", async () => {
    const old = await fixture("2026-09-25T12:00:00Z", "aaaaaaaa");
    await fixture("2026-10-25T11:00:00Z", "bbbbbbbb");
    expect(await pruneBackups({ directory, keyDirectory, now })).toMatchObject({
      ok: true,
      eligible: [old.id],
      deleted: [],
    });
    expect((await lstat(old.encrypted)).isFile()).toBe(true);
  });

  it("no vence una copia un milisegundo antes de los 30 días", async () => {
    await fixture("2026-09-25T12:00:00.001Z", "aaaaaaaa");
    expect(await pruneBackups({ directory, keyDirectory, now, apply: true })).toMatchObject({
      ok: true,
      eligible: [],
      deleted: [],
    });
  });

  it("conserva todo e informa si la última copia válida ya venció", async () => {
    const old = await fixture("2026-09-01T12:00:00Z", "aaaaaaaa");
    expect(await pruneBackups({ directory, keyDirectory, now, apply: true })).toMatchObject({
      ok: false,
      code: "no_current_backup",
      deleted: [],
    });
    expect((await lstat(old.keyPath)).isFile()).toBe(true);
  });

  it("no confía en un hash que ya no coincide", async () => {
    const old = await fixture("2026-09-01T12:00:00Z", "aaaaaaaa");
    await fixture("2026-10-25T11:00:00Z", "bbbbbbbb");
    await writeFile(old.encrypted, "corrupted");
    const result = await pruneBackups({ directory, keyDirectory, now, apply: true });
    expect(result).toMatchObject({ ok: false, deleted: [] });
    expect(result.errors).toContainEqual({ id: old.id, code: "invalid_backup" });
    expect((await lstat(old.keyPath)).isFile()).toBe(true);
  });

  it.each([
    "keyPath",
    "cipherFile",
    "expiresAt",
    "retentionDays",
    "createdAt",
    "decryptedBytesIdentical",
  ])("rechaza metadatos alterados en %s", async (field) => {
    const old = await fixture("2026-09-01T12:00:00Z", "aaaaaaaa");
    await fixture("2026-10-25T11:00:00Z", "bbbbbbbb");
    await writeFile(
      old.manifest,
      JSON.stringify({
        ...old.metadata,
        [field]: field === "keyPath" ? path.join(root, "other.key") : "unexpected",
      }),
    );
    const result = await pruneBackups({ directory, keyDirectory, now, apply: true });
    expect(result.deleted).toEqual([]);
    expect(result.errors).toContainEqual({ id: old.id, code: "invalid_backup" });
    expect((await lstat(old.encrypted)).isFile()).toBe(true);
  });

  it("omite versiones desconocidas y archivos ajenos", async () => {
    const unknown = await fixture("2026-09-01T12:00:00Z", "aaaaaaaa");
    await writeFile(unknown.manifest, JSON.stringify({ ...unknown.metadata, version: 2 }));
    await writeFile(path.join(directory, "user-notes.txt"), "private");
    expect(await pruneBackups({ directory, keyDirectory, now, apply: true })).toMatchObject({
      ok: true,
      skipped: 1,
      deleted: [],
    });
    expect(await readFile(path.join(directory, "user-notes.txt"), "utf8")).toBe("private");
  });

  it("no sigue un enlace en el cifrado hacia otro archivo", async () => {
    const old = await fixture("2026-09-01T12:00:00Z", "aaaaaaaa");
    await fixture("2026-10-25T11:00:00Z", "bbbbbbbb");
    const outside = path.join(root, "outside.gpg");
    await writeFile(outside, "external", { mode: 0o600 });
    await rm(old.encrypted);
    await symlink(outside, old.encrypted);
    expect(await pruneBackups({ directory, keyDirectory, now, apply: true })).toMatchObject({
      ok: false,
      deleted: [],
    });
    expect(await readFile(outside, "utf8")).toBe("external");
  });

  it("rechaza un directorio raíz enlazado", async () => {
    const linked = path.join(root, "linked");
    await symlink(directory, linked);
    expect(await pruneBackups({ directory: linked, keyDirectory, now, apply: true })).toMatchObject(
      { ok: false, code: "unsafe_root", deleted: [] },
    );
  });
});
