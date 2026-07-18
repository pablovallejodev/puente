export type TranslatorStage =
  | "asset.prepare"
  | "tokenizer.load"
  | "session.encoder"
  | "session.decoder"
  | "encode.run"
  | "decode.run"
  | "decode.output";

export type TranslatorErrorCode =
  | "ASSET_UNAVAILABLE"
  | "ASSET_COPY_FAILED"
  | "ASSET_INCOMPLETE"
  | "TOKENIZER_LOAD_FAILED"
  | "SESSION_ENCODER_FAILED"
  | "SESSION_DECODER_FAILED"
  | "ORT_NOT_REGISTERED"
  | "LANGUAGE_UNSUPPORTED"
  | "INPUT_TOO_LONG"
  | "ENCODE_FAILED"
  | "DECODE_FAILED"
  | "DECODE_EMPTY"
  | "ENGINE_LOAD_FAILED"
  | "TRANSLATE_FAILED"
  | "OUT_OF_MEMORY";

export type TranslatorErrorInfo = {
  code: TranslatorErrorCode;
  stage: TranslatorStage;
  message: string;
  recoverable: boolean;
  context?: Record<string, string | number | boolean>;
};

export class TranslatorError extends Error {
  readonly code: TranslatorErrorCode;
  readonly stage: TranslatorStage;
  readonly recoverable: boolean;
  readonly context?: Record<string, string | number | boolean>;

  constructor(info: TranslatorErrorInfo) {
    super(info.message);
    this.name = "TranslatorError";
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

export function isTranslatorError(err: unknown): err is TranslatorError {
  return err instanceof TranslatorError;
}

export function wrapUnknownError(
  err: unknown,
  stage: TranslatorStage,
  code: TranslatorErrorCode,
  recoverable: boolean,
  context?: Record<string, string | number | boolean>,
): TranslatorError {
  if (err instanceof TranslatorError) return err;

  const cause = err instanceof Error ? err.message : String(err);
  return new TranslatorError({
    code,
    stage,
    message: cause,
    recoverable,
    context,
  });
}
