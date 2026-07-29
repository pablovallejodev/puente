/**
 * Shared diagnostic shape for every Puente failure.
 *
 * Every error in the app answers the same four questions, so a log line is
 * always enough to locate the fault without a debugger attached:
 *
 *   [DOMAIN/CODE@stage] message (key=value, …)
 *
 *   domain      which subsystem owns the failure (model, whisper, translator, engine)
 *   code        the stable, greppable identifier — documented in error-catalog.ts
 *   stage       the exact step of the pipeline that threw
 *   recoverable whether retrying the same action can plausibly succeed
 *   context     the values needed to reproduce it (ids, paths, sizes, probabilities)
 *
 * Codes are part of the debugging contract: renaming one is a breaking change
 * for anyone reading logs or issue reports. Add new codes instead.
 */

export type DiagnosticDomain = "model" | "whisper" | "translator" | "engine";

export type DiagnosticContext = Record<string, string | number | boolean>;

export type DiagnosticInfo<TCode extends string, TStage extends string> = {
  code: TCode;
  stage: TStage;
  message: string;
  recoverable: boolean;
  context?: DiagnosticContext;
};

export type DiagnosticSnapshot = {
  domain: DiagnosticDomain;
  code: string;
  stage: string;
  message: string;
  recoverable: boolean;
  context?: DiagnosticContext;
};

function formatContext(context?: DiagnosticContext): string {
  if (!context) return "";
  const entries = Object.entries(context);
  if (entries.length === 0) return "";
  return ` (${entries.map(([k, v]) => `${k}=${v}`).join(", ")})`;
}

/**
 * Base class for all typed Puente errors. Subclasses narrow `code` and `stage`
 * to their own domain unions so an invalid pair fails at compile time.
 */
export abstract class DiagnosticError<
  TCode extends string = string,
  TStage extends string = string,
> extends Error {
  readonly domain: DiagnosticDomain;
  readonly code: TCode;
  readonly stage: TStage;
  readonly recoverable: boolean;
  readonly context?: DiagnosticContext;

  protected constructor(
    domain: DiagnosticDomain,
    info: DiagnosticInfo<TCode, TStage>,
  ) {
    super(info.message);
    this.domain = domain;
    this.code = info.code;
    this.stage = info.stage;
    this.recoverable = info.recoverable;
    this.context = info.context;
  }

  /** Single-line form shown in the UI and written to logs. */
  toDisplayString(): string {
    return `[${this.code}@${this.stage}] ${this.message}${formatContext(this.context)}`;
  }

  /** Same as `toDisplayString()` but prefixed with the owning subsystem. */
  toLogString(): string {
    return `[${this.domain}/${this.code}@${this.stage}] ${this.message}${formatContext(this.context)}`;
  }

  toSnapshot(): DiagnosticSnapshot {
    return {
      domain: this.domain,
      code: this.code,
      stage: this.stage,
      message: this.message,
      recoverable: this.recoverable,
      context: this.context,
    };
  }
}

export function isDiagnosticError(err: unknown): err is DiagnosticError {
  return err instanceof DiagnosticError;
}

/** Message of any thrown value, without assuming it is an `Error`. */
export function causeMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Native allocation failures surface with wildly different wording per runtime. */
export function looksLikeOutOfMemory(message: string): boolean {
  return /out of memory|\bOOM\b|bad_alloc|failed to allocate|cannot allocate|allocation failed/i.test(
    message,
  );
}

/** Filesystem-full failures, likewise. */
export function looksLikeDiskFull(message: string): boolean {
  return /ENOSPC|no space|disk full|out of space/i.test(message);
}

/**
 * A native module that was never linked into the binary. Distinguishing this
 * from a genuine runtime fault matters: the fix is a rebuild, not a retry.
 */
export function looksLikeMissingNativeModule(message: string): boolean {
  return /is not initialized|doesn't seem to be linked|not registered|Cannot find native module|requireNativeModule|TurboModuleRegistry|native module .* is null/i.test(
    message,
  );
}
