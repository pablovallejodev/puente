/**
 * Failures in the ONNX Runtime speech-recognition pipeline Puente runs itself:
 * mel extraction, encoder, language probe and the greedy decode loop.
 *
 * Engines that transcribe through a native backend (sherpa-onnx) raise
 * EngineError instead; the transcriptor hook handles both.
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
} from '@/lib/errors/diagnostic';

export type WhisperStage =
  | 'asset.prepare'
  | 'tokenizer.load'
  | 'session.encoder'
  | 'session.decoder'
  | 'mel.extract'
  | 'encode.run'
  | 'decode.run'
  | 'decode.output'
  | 'audio.capture'
  | 'lang.detect'
  | 'lang.resolve';

/** Runtime list so `check:errors` can prove every code is documented. */
export const WHISPER_ERROR_CODES = [
  'ASSET_UNAVAILABLE',
  'ASSET_COPY_FAILED',
  'ASSET_INCOMPLETE',
  'TOKENIZER_LOAD_FAILED',
  'SESSION_ENCODER_FAILED',
  'SESSION_DECODER_FAILED',
  'ORT_NOT_REGISTERED',
  'LANGUAGE_UNSUPPORTED',
  'MEL_FAILED',
  'ENCODE_FAILED',
  'DECODE_FAILED',
  'DECODE_EMPTY',
  'ENGINE_LOAD_FAILED',
  'AUDIO_FAILED',
  'OUT_OF_MEMORY',
  'LANG_DETECT_FAILED',
  'LANG_DETECT_EMPTY',
  'LANG_DETECT_LOW_CONFIDENCE',
  'LANG_DETECT_AUDIO_TOO_SHORT',
  'LANG_DETECT_UNSUPPORTED',
] as const;

export type WhisperErrorCode = (typeof WHISPER_ERROR_CODES)[number];

export type WhisperErrorInfo = DiagnosticInfo<WhisperErrorCode, WhisperStage>;

export class WhisperError extends DiagnosticError<WhisperErrorCode, WhisperStage> {
  constructor(info: WhisperErrorInfo) {
    super('whisper', info);
    this.name = 'WhisperError';
  }
}

export function isWhisperError(err: unknown): err is WhisperError {
  return err instanceof WhisperError;
}

/** OOM is never worth retrying, so it overrides the caller's recoverable flag. */
export function wrapWhisperError(
  err: unknown,
  stage: WhisperStage,
  code: WhisperErrorCode,
  recoverable: boolean,
  context?: DiagnosticContext,
): WhisperError {
  if (err instanceof WhisperError) return err;
  const cause = causeMessage(err);
  const oom = looksLikeOutOfMemory(cause);
  if (!oom && looksLikeReleasedSession(cause)) {
    return new WhisperError({
      code: 'ENCODE_FAILED',
      stage,
      message: cause,
      recoverable: true,
      context: { ...context, disposed: true },
    });
  }
  return new WhisperError({
    code: oom ? 'OUT_OF_MEMORY' : code,
    stage,
    message: cause,
    recoverable: oom ? false : recoverable,
    context,
  });
}
