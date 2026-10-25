/** Keep the exclusive SQLite updater from racing ordinary KV writes on this JS runtime. */
export function createStorageQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function run<T>(operation: () => Promise<T>): Promise<T> {
    const next = tail.then(operation, operation);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
