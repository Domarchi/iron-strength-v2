export type SyncEnvironment = {
  active: boolean;
  reachable: boolean | null;
  online: boolean;
  key: string;
};
const delays = [5000, 15000, 30000, 60000] as const;
/** Foreground coordinator only. Connectivity signals never count as a server confirmation. */
export class SyncScheduler {
  private environment: SyncEnvironment | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean | null> | null = null;
  private failures = 0;
  private disposed = false;
  constructor(
    private run: (manual?: boolean) => Promise<boolean>,
    private onError?: (error: unknown) => void,
  ) {}
  private eligible() {
    const e = this.environment;
    return !this.disposed && e?.active === true && e.reachable !== false && !!e.key;
  }
  private cancelTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private arm(delay: number) {
    this.cancelTimer();
    if (!this.eligible()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.execute();
    }, delay);
  }
  update(next: SyncEnvironment) {
    if (this.disposed) return;
    const previous = this.environment;
    if (
      previous &&
      previous.active === next.active &&
      previous.reachable === next.reachable &&
      previous.online === next.online &&
      previous.key === next.key
    )
      return;
    this.environment = { ...next };
    this.cancelTimer();
    if (!this.eligible() || this.running) return;
    const resumed = previous && (!previous.active || previous.reachable === false);
    this.failures = 0;
    this.arm(next.online || resumed ? 0 : delays[0]);
  }
  private execute(manual = false): Promise<boolean | null> {
    if (this.running) return this.running;
    if (!this.eligible()) return Promise.resolve(null);
    const key = this.environment!.key;
    let work: Promise<boolean>;
    try {
      work = this.run(manual);
    } catch (e) {
      work = Promise.reject(e);
    }
    const operation = work
      .catch((error) => {
        try {
          this.onError?.(error);
        } catch {
          /* An error presentation must not break the retry guard. */
        }
        return true;
      })
      .then((retry) => {
        if (this.eligible()) {
          if (this.environment!.key !== key) {
            this.failures = 0;
            this.arm(this.environment!.online ? 0 : delays[0]);
          } else if (retry) this.arm(delays[Math.min(this.failures++, delays.length - 1)]);
        }
        return retry;
      });
    this.running = operation;
    void operation
      .finally(() => {
        if (this.running === operation) this.running = null;
      })
      .catch(() => {});
    return operation;
  }
  manual() {
    this.cancelTimer();
    this.failures = 0;
    return this.execute(true);
  }
  dispose() {
    this.disposed = true;
    this.cancelTimer();
  }
}
