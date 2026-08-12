/**
 * Failures owned by the engine layer: loading a backend, adapting a model to
 * it, and running inference through it.
 *
 * Distinct from WhisperError / TranslatorError, which describe the ONNX Runtime
 * pipeline Puente implements itself. Anything that goes through sherpa-onnx or
 * llama.rn — or that is about engine selection rather than inference — lands here.
 *
 * Every code is documented in lib/errors/error-catalog.ts.
 */

import {
  causeMessage,
  DiagnosticError,
  looksLikeMissingNativeModule,
  looksLikeOutOfMemory,
  looksLikeReleasedSession,
  type DiagnosticContext,
  type DiagnosticInfo,
} from '@/lib/errors/diagnostic';

export type EngineStage =
  | 'engine.resolve'
  | 'engine.module'
  | 'engine.init'
  | 'engine.dispose'
  | 'asr.run'
  | 'asr.language'
  | 'mt.run'
  | 'mt.language'
  | 'vad.load'
  | 'vad.run';

/**
 * Declared as an array so the code list exists at runtime: `check:errors`
 * walks it to prove every code is documented in the error catalog.
 */
export const ENGINE_ERROR_CODES = [
  'ENGINE_MODULE_UNAVAILABLE',
  'ENGINE_TASK_MISMATCH',
  'ENGINE_UNSUPPORTED_MODEL',
  'ENGINE_INIT_FAILED',
  'ENGINE_RUN_FAILED',
  'ENGINE_LANGUAGE_UNSUPPORTED',
  'ENGINE_OUTPUT_EMPTY',
  'ENGINE_NO_LANGUAGE_DETECTION',
  'ENGINE_DISPOSED',
  'ENGINE_OUT_OF_MEMORY',
  'VAD_MODEL_MISSING',
  'VAD_INIT_FAILED',
  'VAD_RUN_FAILED',
] as const;

export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

export type EngineErrorInfo = DiagnosticInfo<EngineErrorCode, EngineStage>;

export class EngineError extends DiagnosticError<EngineErrorCode, EngineStage> {
  constructor(info: EngineErrorInfo) {
    super('engine', info);
    this.name = 'EngineError';
  }
}

export function isEngineError(err: unknown): err is EngineError {
  return err instanceof EngineError;
}

/** True when the failure means the native session was already released. */
export function isDisposedEngineFailure(err: unknown): boolean {
  if (isEngineError(err) && err.code === 'ENGINE_DISPOSED') return true;
  if (err instanceof DiagnosticError && err.context?.disposed === true) {
    return true;
  }
  return looksLikeReleasedSession(causeMessage(err));
}

/**
 * Wrap a native failure, upgrading the code when the message reveals a cause we
 * can name precisely. A missing native module needs a rebuild and an OOM needs
 * a smaller model — neither is worth retrying, so both are marked unrecoverable.
 */
export function wrapEngineError(
  err: unknown,
  stage: EngineStage,
  code: EngineErrorCode,
  recoverable: boolean,
  context?: DiagnosticContext,
): EngineError {
  if (err instanceof EngineError) return err;
  const message = causeMessage(err);

  if (looksLikeMissingNativeModule(message)) {
    return new EngineError({
      code: 'ENGINE_MODULE_UNAVAILABLE',
      stage: 'engine.module',
      message,
      recoverable: false,
      context,
    });
  }
  if (looksLikeOutOfMemory(message)) {
    return new EngineError({
      code: 'ENGINE_OUT_OF_MEMORY',
      stage,
      message,
      recoverable: false,
      context,
    });
  }
  if (looksLikeReleasedSession(message)) {
    return new EngineError({
      code: 'ENGINE_DISPOSED',
      stage,
      message,
      recoverable: true,
      context,
    });
  }

  return new EngineError({ code, stage, message, recoverable, context });
}

/** The native side of an optional engine is missing; only a rebuild fixes it. */
export function moduleUnavailable(engine: string, packageName: string, err: unknown): EngineError {
  return new EngineError({
    code: 'ENGINE_MODULE_UNAVAILABLE',
    stage: 'engine.module',
    message: `El motor ${engine} no está disponible en esta build (${packageName}). Ejecuta pnpm install && npx expo prebuild --clean y reconstruye la app.`,
    recoverable: false,
    context: { engine, packageName, cause: causeMessage(err) },
  });
}
