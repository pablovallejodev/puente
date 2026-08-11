/**
 * Failures in the model lifecycle: catalog lookup, download, verification,
 * installation, selection and preference storage.
 *
 * Every code is documented in lib/errors/error-catalog.ts.
 */

import {
  causeMessage,
  DiagnosticError,
  looksLikeDiskFull,
  type DiagnosticContext,
  type DiagnosticInfo,
} from "@/lib/errors/diagnostic";

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

/** Runtime list so `check:errors` can prove every code is documented. */
export const MODEL_ERROR_CODES = [
  "MODEL_UNKNOWN_ID",
  "MODEL_NOT_INSTALLED",
  "MODEL_INCOMPLETE",
  "MODEL_SIZE_MISMATCH",
  "MODEL_ALREADY_DOWNLOADING",
  "MODEL_DOWNLOAD_OFFLINE",
  "MODEL_DOWNLOAD_HTTP",
  "MODEL_DOWNLOAD_FAILED",
  "MODEL_DOWNLOAD_CANCELLED",
  "MODEL_DOWNLOAD_PAUSED",
  "MODEL_DOWNLOAD_TIMEOUT",
  "MODEL_DISK_FULL",
  "MODEL_FINALIZE_FAILED",
  "MODEL_SELECT_NOT_INSTALLED",
  "MODEL_SELECT_FAILED",
  "MODEL_PREFS_READ_FAILED",
  "MODEL_PREFS_WRITE_FAILED",
  "MODEL_DELETE_ACTIVE_FORBIDDEN",
  "MODEL_ENGINE_PATH_MISSING",
  "MODEL_GATE_INCOMPLETE",
] as const;

export type ModelErrorCode = (typeof MODEL_ERROR_CODES)[number];

export type ModelErrorInfo = DiagnosticInfo<ModelErrorCode, ModelStage>;

export class ModelError extends DiagnosticError<ModelErrorCode, ModelStage> {
  constructor(info: ModelErrorInfo) {
    super("model", info);
    this.name = "ModelError";
  }
}

export function isModelError(err: unknown): err is ModelError {
  return err instanceof ModelError;
}

/**
 * A full disk masquerades as a generic write failure at whatever stage it hit,
 * so it is reclassified here rather than at each call site.
 */
export function wrapModelError(
  err: unknown,
  stage: ModelStage,
  code: ModelErrorCode,
  recoverable: boolean,
  context?: DiagnosticContext,
): ModelError {
  if (err instanceof ModelError) return err;
  const cause = causeMessage(err);
  const diskFull = looksLikeDiskFull(cause);
  return new ModelError({
    code: diskFull ? "MODEL_DISK_FULL" : code,
    stage: diskFull ? "storage.space" : stage,
    message: cause,
    recoverable: diskFull ? true : recoverable,
    context,
  });
}
