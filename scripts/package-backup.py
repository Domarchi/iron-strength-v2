import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import stat
import subprocess
import tarfile
import tempfile
import sys
import socket

def require(condition, message):
    if not condition:
        raise ValueError(message)


os.umask(0o077)
if len(sys.argv) != 2 or socket.gethostname() != "F.R.I.D.A.Y":
    raise SystemExit("Uso local: python3 scripts/package-backup.py CARPETA_PRIVADA")
source = Path(sys.argv[1]).resolve()
require(source.is_dir() and stat.S_IMODE(source.stat().st_mode) == 0o700, "Origen no privado")
destination = Path("/home/friday/Backups/Iron-Strength")
keys = Path("/home/friday/.local/share/iron-strength-backup/keys")
for directory in (destination, keys):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(not directory.is_symlink(), "Destino enlazado no permitido")
    require(directory.stat().st_uid == os.getuid(), "Propietario incorrecto")
    require(stat.S_IMODE(directory.stat().st_mode) == 0o700, "Permisos de directorio incorrectos")

manifest = json.loads((source / "manifest.json").read_text())
before = json.loads((source / "remote-hashes.json").read_text())["rows"][0]["jsonb_agg"]
after = json.loads((source / "remote-hashes-after.json").read_text())["rows"][0]["jsonb_agg"]
require(before == after, "Datos cambiaron durante el respaldo")
expected = {item["name"]: item for item in manifest}
require(set(expected) == {
    "roles.sql", "schema.sql", "managed-schema.sql", "data.sql",
    "history-schema.sql", "history-data.sql",
}, "Volcados incompletos")
storage = json.loads((source / "storage-verification.json").read_text())
require(storage["bucket"] == "progress-photos" and storage["verified"] is True, "Storage no verificado")
photos = sorted((source / "photos").rglob("*")) if (source / "photos").exists() else []
require(all(not item.is_symlink() for item in photos), "Enlace en fotos no permitido")
photo_files = [item for item in photos if item.is_file()]
require(len(photo_files) == storage["remoteObjects"], "Fotos incompletas")
names = list(expected) + [
    "manifest.json", "remote-hashes.json", "remote-hashes-after.json",
    "remote-policies.json", "audit.json", "storage-verification.json",
]
names += [item.relative_to(source).as_posix() for item in photo_files]
contents = {}
for name in names:
    require(not Path(name).is_absolute() and ".." not in Path(name).parts, "Ruta de archivo incorrecta")
    path = source / name
    require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(source), "Archivo no permitido")
    require(stat.S_IMODE(path.stat().st_mode) == 0o600, "Archivo no privado")
    data = path.read_bytes()
    if name in expected:
        require(len(data) == expected[name]["bytes"], "No se pudo verificar el respaldo")
        require(hashlib.sha256(data).hexdigest() == expected[name]["sha256"], "No se pudo verificar el respaldo")
    contents[name] = data
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
    for name, data in contents.items():
        entry = tarfile.TarInfo(name)
        entry.size = len(data)
        entry.mode = 0o600
        archive.addfile(entry, io.BytesIO(data))
payload = buffer.getvalue()
now = dt.datetime.now(dt.timezone.utc)
identifier = now.strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4)
base = "iron-strength-" + identifier
key_path = keys / (base + ".key")
cipher_path = destination / (base + ".tar.gz.gpg")
key = secrets.token_hex(32).encode() + b"\n"
with key_path.open("xb") as handle:
    handle.write(key)
    handle.flush()
    os.fsync(handle.fileno())

with tempfile.TemporaryDirectory(prefix="iron-strength-gpg-") as temporary:
    home = Path(temporary)
    common = ["gpg", "--no-options", "--homedir", str(home), "--batch", "--no-tty", "--pinentry-mode", "loopback", "--no-symkey-cache"]

    def run(data, password, arguments, output=subprocess.PIPE):
        read_fd, write_fd = os.pipe()
        try:
            os.write(write_fd, password)
            os.close(write_fd)
            write_fd = -1
            return subprocess.run(common + ["--passphrase-fd", str(read_fd)] + arguments, input=data, stdout=output, stderr=subprocess.PIPE, pass_fds=(read_fd,), timeout=60)
        finally:
            os.close(read_fd)
            if write_fd >= 0:
                os.close(write_fd)

    try:
        with cipher_path.open("xb") as output:
            encrypted = run(payload, key, ["--cipher-algo", "AES256", "--s2k-mode", "3", "--s2k-digest-algo", "SHA256", "--s2k-count", "65011712", "--symmetric"], output)
            require(encrypted.returncode == 0, "El cifrado falló")
            output.flush()
            os.fsync(output.fileno())
        cipher = cipher_path.read_bytes()
        restored = run(cipher, key_path.read_bytes(), ["--decrypt"])
        require(restored.returncode == 0 and restored.stdout == payload, "Descifrado distinto del original")
        with tarfile.open(fileobj=io.BytesIO(restored.stdout), mode="r:gz") as archive:
            require(archive.getnames() == names, "No se pudo verificar el respaldo")
            for name, data in contents.items():
                require(archive.extractfile(name).read() == data, "Contenido recuperado distinto")
        wrong_key = run(cipher, secrets.token_hex(32).encode() + b"\n", ["--decrypt"], subprocess.DEVNULL)
        require(wrong_key.returncode != 0, "Clave incorrecta aceptada")
        corrupted = bytearray(cipher)
        corrupted[-25] ^= 0x40
        damaged = run(bytes(corrupted), key, ["--decrypt"], subprocess.DEVNULL)
        require(damaged.returncode != 0, "Corrupción aceptada")
    finally:
        subprocess.run(["gpgconf", "--homedir", str(home), "--kill", "gpg-agent"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)

for path in (key_path, cipher_path):
    require(stat.S_IMODE(path.stat().st_mode) == 0o600, "No se pudo verificar el respaldo")
proof = {
    "version": 1,
    "destination": str(destination),
    "host": "F.R.I.D.A.Y",
    "cipherFile": cipher_path.name,
    "keyPath": str(key_path),
    "cipherSha256": hashlib.sha256(cipher).hexdigest(),
    "cipherBytes": len(cipher),
    "createdAt": now.isoformat(),
    "expiresAt": (now + dt.timedelta(days=30)).isoformat(),
    "retentionDays": 30,
    "filesVerified": len(contents),
    "decryptedBytesIdentical": True,
    "sourceSqlHashesVerified": True,
    "wrongKeyRejected": True,
    "corruptionRejected": True,
    "privatePermissionsVerified": True,
    "sourceAlreadyRestored": None,
    "stableDuringBackup": True,
    "remoteObjects": storage["remoteObjects"],
    "tables": len(before),
    "rows": sum(item["rows"] for item in before),
    "newDatabaseRestorePerformed": False,
    "offsite": False,
    "separatePhysicalDisk": False,
    "keyOnSameHost": True,
    "filesDeleted": [],
    "remoteWrites": False,
}
proof_path = destination / (base + ".json")
with proof_path.open("x") as output:
    json.dump(proof, output, indent=2)
    output.write("\n")
private_proof = source / "encrypted-copy-proof.json"
with private_proof.open("x") as output:
    json.dump(proof, output, indent=2)
    output.write("\n")
print(json.dumps({name: value for name, value in proof.items() if name not in ("keyPath", "sourceAlreadyRestored")}, indent=2))
