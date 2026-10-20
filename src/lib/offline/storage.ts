import { parseWeekPackage, type WeekPackage } from "./package";
export const OFFLINE_DB = "iron-strength-offline";
export const WORKOUT_QUEUE_DB = "iron-strength-workout-queue";
const STORE = "weeks";
export const weekPackageKey = (userId: string, programId: string, weekStart: string) => [
  userId,
  programId,
  weekStart,
];

function openDatabase(storeName: "weeks" | "queue"): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(new Error("Este navegador no permite guardar datos en el dispositivo."));
    const request = indexedDB.open(storeName === "weeks" ? OFFLINE_DB : WORKOUT_QUEUE_DB, 1);
    let failed = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (storeName === "queue" && !db.objectStoreNames.contains("queue"))
        db.createObjectStore("queue", { keyPath: ["userId", "workoutId"] }).createIndex(
          "userId",
          "userId",
        );
      if (storeName === "weeks" && !db.objectStoreNames.contains(STORE))
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
export async function offlineTransaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, result: (value: T) => void) => void,
  storeName: "weeks" | "queue" = "weeks",
): Promise<T> {
  const db = await openDatabase(storeName);
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
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
            ? storeName === "weeks"
              ? "No hay espacio suficiente. Libera espacio y vuelve a descargar. La descarga anterior se conserva."
              : "No hay espacio suficiente para guardar el entrenamiento en este dispositivo."
            : storeName === "weeks"
              ? "No se pudo guardar o leer la semana. La descarga anterior se conserva."
              : "No se pudo acceder a los entrenamientos pendientes. Sus datos se conservan.",
        ),
      );
    };
    tx.onerror = () => {
      /* onabort informa el resultado de toda la transacción. */
    };
    try {
      run(tx.objectStore(storeName), (value) => {
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
  return offlineTransaction("readwrite", (store, result) => {
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
  return offlineTransaction("readonly", (store, result) => {
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
  return offlineTransaction("readonly", (store, result) => {
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
