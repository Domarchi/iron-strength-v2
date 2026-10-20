import { parseWeekPackage, type WeekPackage } from "./package";
export const OFFLINE_DB = "iron-strength-offline";
const STORE = "weeks";
export const weekPackageKey = (userId: string, programId: string, weekStart: string) => [
  userId,
  programId,
  weekStart,
];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(new Error("Este navegador no permite guardar semanas en el dispositivo."));
    const request = indexedDB.open(OFFLINE_DB, 1);
    let failed = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: ["userId", "program.id", "weekStart"] }).createIndex(
          "userId",
          "userId",
        );
    };
    request.onerror = () =>
      reject(new Error("No se pudo abrir el almacenamiento del dispositivo."));
    request.onblocked = () => {
      failed = true;
      reject(new Error("Cierra las otras pestañas de la app y vuelve a intentarlo."));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (failed) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result: T;
    let synchronousError: unknown;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(
        new Error(
          (synchronousError instanceof DOMException ? synchronousError.name : tx.error?.name) ===
            "QuotaExceededError"
            ? "No hay espacio suficiente. Libera espacio y vuelve a descargar. La descarga anterior se conserva."
            : "No se pudo guardar o leer la semana. La descarga anterior se conserva.",
        ),
      );
    };
    tx.onerror = () => {
      /* onabort informa el resultado de toda la transacción. */
    };
    try {
      run(tx.objectStore(STORE), (value) => {
        result = value;
      });
    } catch (error) {
      synchronousError = error;
      tx.abort();
    }
  });
}
export async function saveWeekPackage(value: unknown, userId: string): Promise<WeekPackage> {
  const pack = parseWeekPackage(value, userId);
  if (!pack) throw new Error("La descarga está incompleta o pertenece a otra cuenta.");
  return transaction("readwrite", (store, result) => {
    const put = store.put(pack);
    put.onsuccess = () => {
      const read = store.get(weekPackageKey(userId, pack.program.id, pack.weekStart));
      read.onsuccess = () => {
        const saved = parseWeekPackage(read.result, userId);
        if (!saved) {
          store.transaction.abort();
          return;
        }
        result(saved);
      };
    };
  });
}
export async function loadWeekPackage(
  userId: string,
  programId: string,
  weekStart: string,
): Promise<WeekPackage | null> {
  return transaction("readonly", (store, result) => {
    const request = store.get(weekPackageKey(userId, programId, weekStart));
    request.onsuccess = () => {
      if (request.result === undefined) return result(null);
      const pack = parseWeekPackage(request.result, userId);
      if (!pack || pack.program.id !== programId || pack.weekStart !== weekStart) {
        store.transaction.abort();
        return;
      }
      result(pack);
    };
  });
}
export async function listWeekPackages(userId: string): Promise<WeekPackage[]> {
  return transaction("readonly", (store, result) => {
    const request = store.index("userId").getAll(userId);
    request.onsuccess = () => {
      const packs = (request.result as unknown[]).map((p) => parseWeekPackage(p, userId));
      if (packs.some((p) => !p)) {
        store.transaction.abort();
        return;
      }
      result((packs as WeekPackage[]).sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt)));
    };
  });
}
