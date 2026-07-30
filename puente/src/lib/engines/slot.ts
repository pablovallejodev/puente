/**
 * One loaded engine at a time, per task.
 *
 * Two models never coexist in memory: a phone that can hold Whisper Small and
 * NLLB at once cannot hold two ASR models, and the failure mode is the process
 * being killed mid-conversation. The slot therefore disposes the previous
 * engine before creating the next one whenever the selected model changes.
 *
 * It also caps retries. A model that fails to load usually fails for a reason
 * that will not change — a truncated download, a missing native module — and
 * retrying it on every render turns one error into a loop of them.
 */

export type SlotErrorFactory = {
  /** No model is selected for this task yet. */
  noSelection(): Error;
  /** Retries are used up; only an explicit user action should reset them. */
  exhausted(attempts: number, modelId: string): Error;
  /** Creation failed. Receives the raw failure so it can be classified. */
  loadFailed(err: unknown, modelId: string, attempt: number): Error;
};

export type SlotOptions<T> = {
  maxAttempts: number;
  create(modelId: string): Promise<T>;
  errors: SlotErrorFactory;
};

export class EngineSlot<T extends { dispose(): void }> {
  private inFlight: Promise<T> | null = null;
  private cached: T | null = null;
  private cachedId: string | null = null;
  private loadingId: string | null = null;
  private attempts = 0;

  constructor(private readonly options: SlotOptions<T>) {}

  get modelId(): string | null {
    return this.cachedId;
  }

  get attemptsUsed(): number {
    return this.attempts;
  }

  reset(): void {
    this.cached?.dispose();
    this.cached = null;
    this.inFlight = null;
    this.cachedId = null;
    this.loadingId = null;
    // External reset (model select) starts a fresh attempt budget.
    this.attempts = 0;
  }

  async load(modelId: string | null, forceRetry = false): Promise<T> {
    if (!modelId) throw this.options.errors.noSelection();

    if (this.cached && this.cachedId === modelId && !forceRetry) {
      return this.cached;
    }

    // A different model than the cached one — or than the one currently
    // loading — invalidates both, and the attempt budget belongs to the model,
    // not to the slot.
    const switching =
      (this.cachedId != null && this.cachedId !== modelId) ||
      (this.loadingId != null && this.loadingId !== modelId);

    if (forceRetry || switching) {
      this.reset();
      this.attempts = 0;
    }

    if (this.inFlight) return this.inFlight;

    if (this.attempts >= this.options.maxAttempts) {
      throw this.options.errors.exhausted(this.attempts, modelId);
    }

    this.attempts += 1;
    const attempt = this.attempts;
    this.loadingId = modelId;

    this.inFlight = this.options
      .create(modelId)
      .then((engine) => {
        // A reset raced with this load: the caller no longer wants it.
        if (this.loadingId !== modelId) {
          engine.dispose();
          throw this.options.errors.loadFailed(
            new Error("Carga cancelada por un cambio de modelo"),
            modelId,
            attempt,
          );
        }
        this.cached = engine;
        this.cachedId = modelId;
        this.loadingId = null;
        return engine;
      })
      .catch((err: unknown) => {
        this.inFlight = null;
        this.cached = null;
        this.cachedId = null;
        this.loadingId = null;
        throw this.options.errors.loadFailed(err, modelId, attempt);
      });

    return this.inFlight;
  }
}
