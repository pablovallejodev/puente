export type ModelStage =
  | "catalog.resolve"
  | "prefs.read"
  | "prefs.write"
  | "network.check"
  | "download.start"
  | "download.file"
  | "download.verify"
  | "download.finalize"
  | "install.check"
  | "select.apply"
  | "engine.load"
  | "storage.space"
  | "gate.ready";

export type ModelErrorCode =
  | "MODEL_UNKNOWN_ID"
  | "MODEL_NOT_INSTALLED"
  | "MODEL_INCOMPLETE"
  | "MODEL_SIZE_MISMATCH"
  | "MODEL_ALREADY_DOWNLOADING"
  | "MODEL_DOWNLOAD_OFFLINE"
  | "MODEL_DOWNLOAD_HTTP"
  | "MODEL_DOWNLOAD_FAILED"
  | "MODEL_DOWNLOAD_CANCELLED"
  | "MODEL_DOWNLOAD_TIMEOUT"
  | "MODEL_DISK_FULL"
  | "MODEL_FINALIZE_FAILED"
  | "MODEL_SELECT_NOT_INSTALLED"
  | "MODEL_SELECT_FAILED"
  | "MODEL_PREFS_READ_FAILED"
  | "MODEL_PREFS_WRITE_FAILED"
  | "MODEL_DELETE_ACTIVE_FORBIDDEN"
  | "MODEL_ENGINE_PATH_MISSING"
  | "MODEL_GATE_INCOMPLETE";

export type ModelErrorInfo = {
  code: ModelErrorCode;
  stage: ModelStage;
  message: string;
  recoverable: boolean;
  context?: Record<string, string | number | boolean>;
};

export class ModelError extends Error {
  readonly code: ModelErrorCode;
  readonly stage: ModelStage;
  readonly recoverable: boolean;
  readonly context?: Record<string, string | number | boolean>;

  constructor(info: ModelErrorInfo) {
    super(info.message);
    this.name = "ModelError";
    this.code = info.code;
    this.stage = info.stage;
    this.recoverable = info.recoverable;
    this.context = info.context;
  }

  toDisplayString(): string {
    const ctx = this.context
      ? Object.entries(this.context)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")
      : "";
    return `[${this.code}@${this.stage}] ${this.message}${ctx ? ` (${ctx})` : ""}`;
  }
}

export function isModelError(err: unknown): err is ModelError {
  return err instanceof ModelError;
}

export function wrapModelError(
  err: unknown,
  stage: ModelStage,
  code: ModelErrorCode,
  recoverable: boolean,
  context?: Record<string, string | number | boolean>,
): ModelError {
  if (err instanceof ModelError) return err;
  const cause = err instanceof Error ? err.message : String(err);
  const diskFull =
    /ENOSPC|no space|disk full|out of space/i.test(cause);
  return new ModelError({
    code: diskFull ? "MODEL_DISK_FULL" : code,
    stage: diskFull ? "storage.space" : stage,
    message: cause,
    recoverable: diskFull ? true : recoverable,
    context,
  });
}
