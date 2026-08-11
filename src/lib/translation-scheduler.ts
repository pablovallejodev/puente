/**
 * Latest-first, preserve-all job scheduler for on-device NLLB.
 * A new job preempts the active one; the interrupted job is re-queued after.
 */

export type ScheduledJob = {
  /** Stable identity for dedupe / UI (messageId). */
  id: string;
  /** Content key — same id + different key replaces pending/active work. */
  key: string;
};

export type JobState = "queued" | "translating" | "done" | "error";

export type SchedulerCallbacks<T extends ScheduledJob> = {
  onState?: (job: T, state: JobState) => void;
  /** Return true if the run finished successfully (not cancelled). */
  execute: (job: T, isCancelled: () => boolean) => Promise<boolean>;
};

export class LatestFirstPreserveScheduler<T extends ScheduledJob> {
  private pending: T[] = [];
  private active: { job: T; cancelled: boolean } | null = null;
  private pumping = false;
  private readonly callbacks: SchedulerCallbacks<T>;

  constructor(callbacks: SchedulerCallbacks<T>) {
    this.callbacks = callbacks;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get activeJob(): T | null {
    return this.active?.job ?? null;
  }

  clear(): void {
    if (this.active) this.active.cancelled = true;
    this.active = null;
    this.pending = [];
  }

  enqueue(job: T): void {
    this.pending = this.pending.filter((j) => j.id !== job.id);

    if (this.active) {
      if (this.active.job.id === job.id) {
        this.active.cancelled = true;
      } else if (!this.active.cancelled) {
        const interrupted = this.active.job;
        this.active.cancelled = true;
        if (!this.pending.some((j) => j.id === interrupted.id)) {
          this.pending.unshift(interrupted);
          this.callbacks.onState?.(interrupted, "queued");
        }
      }
    }

    this.pending.unshift(job);
    this.callbacks.onState?.(job, "queued");
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.pending.length > 0) {
        const job = this.pending.shift()!;
        const slot = { job, cancelled: false };
        this.active = slot;
        this.callbacks.onState?.(job, "translating");
        let ok = false;
        try {
          ok = await this.callbacks.execute(job, () => slot.cancelled);
        } catch {
          if (!slot.cancelled) {
            this.callbacks.onState?.(job, "error");
          }
          continue;
        } finally {
          if (this.active === slot) this.active = null;
        }

        if (slot.cancelled) {
          // Preempted same-id replacement: do not mark done.
          // Preempted different-id: already re-queued in enqueue.
          continue;
        }
        this.callbacks.onState?.(job, ok ? "done" : "error");
      }
    } finally {
      this.pumping = false;
      if (this.pending.length > 0) void this.pump();
    }
  }
}

export function translationJobKey(
  messageId: string,
  text: string,
  inputLocale: string,
  outputLanguage: string,
): string {
  return `${messageId}:${text.trim()}:${inputLocale}:${outputLanguage}`;
}
