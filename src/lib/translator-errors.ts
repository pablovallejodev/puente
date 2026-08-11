/**
 * Failures in the ONNX Runtime translation pipeline Puente runs itself:
 * tokenizer, encoder, and the greedy decode loop.
 *
 * Engines that translate through a native backend (llama.rn) raise EngineError
 * instead; the translator hook handles both.
 *
 * Every code is documented in lib/errors/error-catalog.ts.
 */

import {
  causeMessage,
  DiagnosticError,
  looksLikeOutOfMemory,
  looksLikeReleasedSession,
  type DiagnosticContext,
  type DiagnosticInfo,
} from "@/lib/errors/diagnostic";

export type TranslatorStage =
  | "asset.prepare"
  | "tokenizer.load"
  | "session.encoder"
  | "session.decoder"
  | "encode.run"
  | "decode.run"
  | "decode.output";

/** Runtime list so `check:errors` can prove every code is documented. */
export const TRANSLATOR_ERROR_CODES = [
  "ASSET_UNAVAILABLE",
  "ASSET_COPY_FAILED",
  "ASSET_INCOMPLETE",
  "TOKENIZER_LOAD_FAILED",
  "SESSION_ENCODER_FAILED",
  "SESSION_DECODER_FAILED",
  "ORT_NOT_REGISTERED",
  "LANGUAGE_UNSUPPORTED",
  "INPUT_TOO_LONG",
  "ENCODE_FAILED",
  "DECODE_FAILED",
  "DECODE_EMPTY",
  "ENGINE_LOAD_FAILED",
  "TRANSLATE_FAILED",
  "OUT_OF_MEMORY",
] as const;

export type TranslatorErrorCode = (typeof TRANSLATOR_ERROR_CODES)[number];

export type TranslatorErrorInfo = DiagnosticInfo<
  TranslatorErrorCode,
  TranslatorStage
>;

export class TranslatorError extends DiagnosticError<
  TranslatorErrorCode,
  TranslatorStage
> {
  constructor(info: TranslatorErrorInfo) {
    super("translator", info);
    this.name = "TranslatorError";
  }
}

export function isTranslatorError(err: unknown): err is TranslatorError {
  return err instanceof TranslatorError;
}

/** OOM is never worth retrying, so it overrides the caller's recoverable flag. */
export function wrapUnknownError(
  err: unknown,
  stage: TranslatorStage,
  code: TranslatorErrorCode,
  recoverable: boolean,
  context?: DiagnosticContext,
): TranslatorError {
  if (err instanceof TranslatorError) return err;
  const cause = causeMessage(err);
  const oom = looksLikeOutOfMemory(cause);
  if (!oom && looksLikeReleasedSession(cause)) {
    return new TranslatorError({
      code: "ENCODE_FAILED",
      stage,
      message: cause,
      recoverable: true,
      context: { ...context, disposed: true },
    });
  }
  return new TranslatorError({
    code: oom ? "OUT_OF_MEMORY" : code,
    stage,
    message: cause,
    recoverable: oom ? false : recoverable,
    context,
  });
}
