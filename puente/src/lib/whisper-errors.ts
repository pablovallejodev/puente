export type WhisperStage =
  | "asset.prepare"
  | "tokenizer.load"
  | "session.encoder"
  | "session.decoder"
  | "mel.extract"
  | "encode.run"
  | "decode.run"
  | "decode.output"
  | "audio.capture"
  | "lang.detect"
  | "lang.resolve";

export type WhisperErrorCode =
  | "ASSET_UNAVAILABLE"
  | "ASSET_COPY_FAILED"
  | "ASSET_INCOMPLETE"
  | "TOKENIZER_LOAD_FAILED"
  | "SESSION_ENCODER_FAILED"
  | "SESSION_DECODER_FAILED"
  | "ORT_NOT_REGISTERED"
  | "LANGUAGE_UNSUPPORTED"
  | "MEL_FAILED"
  | "ENCODE_FAILED"
  | "DECODE_FAILED"
  | "DECODE_EMPTY"
  | "ENGINE_LOAD_FAILED"
  | "AUDIO_FAILED"
  | "OUT_OF_MEMORY"
  | "LANG_DETECT_FAILED"
  | "LANG_DETECT_EMPTY"
  | "LANG_DETECT_LOW_CONFIDENCE"
  | "LANG_DETECT_AUDIO_TOO_SHORT"
  | "LANG_DETECT_UNSUPPORTED";

export type WhisperErrorInfo = {
  code: WhisperErrorCode;
  stage: WhisperStage;
  message: string;
  recoverable: boolean;
  context?: Record<string, string | number | boolean>;
};

export class WhisperError extends Error {
  readonly code: WhisperErrorCode;
  readonly stage: WhisperStage;
  readonly recoverable: boolean;
  readonly context?: Record<string, string | number | boolean>;

  constructor(info: WhisperErrorInfo) {
    super(info.message);
    this.name = "WhisperError";
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

export function isWhisperError(err: unknown): err is WhisperError {
  return err instanceof WhisperError;
}

export function wrapWhisperError(
  err: unknown,
  stage: WhisperStage,
  code: WhisperErrorCode,
  recoverable: boolean,
  context?: Record<string, string | number | boolean>,
): WhisperError {
  if (err instanceof WhisperError) return err;
  const cause = err instanceof Error ? err.message : String(err);
  const oom =
    cause.includes("memory") ||
    cause.includes("OOM") ||
    cause.includes("allocate");
  return new WhisperError({
    code: oom ? "OUT_OF_MEMORY" : code,
    stage,
    message: cause,
    recoverable: oom ? false : recoverable,
    context,
  });
}
