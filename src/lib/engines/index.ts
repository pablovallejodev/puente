/**
 * The engine router.
 *
 * `spec.runtime.engine` decides which adapter builds the engine, so adding a
 * model that uses an existing runtime kind is a catalog entry and nothing else.
 * Everything above this module holds an `AsrEngine` or an `MtEngine` and never
 * names an engine.
 */

import { getAsrModelSpec, getMtModelSpec, type AsrModelSpec, type MtModelSpec } from '@/constants/model-catalog';
import { mapSpeechLocaleToFlores } from '@/constants/languages';
import { assertModelInstalled } from '@/lib/model-install-state';
import { isModelError, ModelError } from '@/lib/model-errors';
import { readSelectedModelId, type SelectableTask } from '@/lib/model-preferences';
import { isWhisperError, WhisperError, wrapWhisperError } from '@/lib/whisper-errors';
import { isTranslatorError, TranslatorError, wrapUnknownError } from '@/lib/translator-errors';
import { isEngineError } from '@/lib/engine-errors';
import { EngineSlot } from '@/lib/engines/slot';
import { LlamaMtEngine } from '@/lib/engines/llama-mt';
import { SherpaAsrEngine } from '@/lib/engines/sherpa-asr';
import type { AsrEngine, MtEngine } from '@/lib/engines/types';

export type { AsrEngine, AsrRequest, AsrResult, MtEngine, MtRequest } from '@/lib/engines/types';

/**
 * Two: one to hit a transient failure, one to confirm it is not transient.
 * Beyond that the user has to act — pick another model or free memory — so
 * more attempts only delay the message that says so.
 */
export const MAX_ENGINE_LOAD_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Resolve the spec and refuse early if the files are not actually on disk. */
async function specFor(task: SelectableTask, modelId: string): Promise<AsrModelSpec | MtModelSpec> {
  const spec = task === 'asr' ? getAsrModelSpec(modelId) : getMtModelSpec(modelId);
  if (!spec) {
    throw new ModelError({
      code: 'MODEL_UNKNOWN_ID',
      stage: 'catalog.resolve',
      message: `Modelo desconocido para ${task}: ${modelId}`,
      recoverable: false,
      context: { modelId, task },
    });
  }
  await assertModelInstalled(modelId);
  return spec;
}

async function createAsrEngine(modelId: string): Promise<AsrEngine> {
  const spec = (await specFor('asr', modelId)) as AsrModelSpec;
  switch (spec.runtime.engine) {
    case 'ort': {
      // Dynamic import: static ORT pulls onnxruntime-react-native JSI at cold start.
      const { OrtWhisperEngine } = await import('./ort-whisper');
      return OrtWhisperEngine.create(spec);
    }
    case 'sherpa':
      return SherpaAsrEngine.create(spec);
  }
}

async function createMtEngine(modelId: string): Promise<MtEngine> {
  const spec = (await specFor('mt', modelId)) as MtModelSpec;
  switch (spec.runtime.engine) {
    case 'ort': {
      const { OrtNllbEngine } = await import('./ort-nllb');
      return OrtNllbEngine.create(spec);
    }
    case 'llama':
      return LlamaMtEngine.create(spec);
  }
}

// ---------------------------------------------------------------------------
// Error mapping
//
// The UI distinguishes Whisper failures from translator failures, so every
// failure below is presented in the domain its caller already understands,
// whichever engine actually produced it.
// ---------------------------------------------------------------------------

const asrSlot = new EngineSlot<AsrEngine>({
  maxAttempts: MAX_ENGINE_LOAD_ATTEMPTS,
  create: createAsrEngine,
  errors: {
    noSelection: () =>
      new WhisperError({
        code: 'ENGINE_LOAD_FAILED',
        stage: 'asset.prepare',
        message: '[MODEL_NOT_INSTALLED@engine.load] No hay un modelo de transcripción seleccionado',
        recoverable: true,
        context: { modelCode: 'MODEL_NOT_INSTALLED' },
      }),
    exhausted: (attempts, modelId) =>
      new WhisperError({
        code: 'ENGINE_LOAD_FAILED',
        stage: 'session.encoder',
        message: 'Se agotaron los reintentos de carga del modelo de voz',
        recoverable: false,
        context: { attempts, modelId },
      }),
    loadFailed: (err, modelId, attempt) => {
      if (isWhisperError(err)) return err;
      if (isEngineError(err)) {
        return new WhisperError({
          code: 'ENGINE_LOAD_FAILED',
          stage: 'asset.prepare',
          message: err.toDisplayString(),
          recoverable: err.recoverable,
          context: { modelId, engineCode: err.code },
        });
      }
      if (isModelError(err)) {
        return new WhisperError({
          code: 'ENGINE_LOAD_FAILED',
          stage: 'asset.prepare',
          message: err.toDisplayString(),
          recoverable: err.recoverable,
          context: { modelId, modelCode: err.code },
        });
      }
      return wrapWhisperError(err, 'session.encoder', 'ENGINE_LOAD_FAILED', true, { modelId, attempt });
    },
  },
});

const mtSlot = new EngineSlot<MtEngine>({
  maxAttempts: MAX_ENGINE_LOAD_ATTEMPTS,
  create: createMtEngine,
  errors: {
    noSelection: () =>
      new TranslatorError({
        code: 'ENGINE_LOAD_FAILED',
        stage: 'asset.prepare',
        message: '[MODEL_NOT_INSTALLED@engine.load] No hay un modelo de traducción seleccionado',
        recoverable: true,
        context: { modelCode: 'MODEL_NOT_INSTALLED' },
      }),
    exhausted: (attempts, modelId) =>
      new TranslatorError({
        code: 'ENGINE_LOAD_FAILED',
        stage: 'session.encoder',
        message: 'Se agotaron los reintentos de carga del traductor',
        recoverable: false,
        context: { attempts, modelId },
      }),
    loadFailed: (err, modelId, attempt) => {
      if (isTranslatorError(err)) return err;
      if (isEngineError(err)) {
        return new TranslatorError({
          code: 'ENGINE_LOAD_FAILED',
          stage: 'asset.prepare',
          message: err.toDisplayString(),
          recoverable: err.recoverable,
          context: { modelId, engineCode: err.code },
        });
      }
      if (isModelError(err)) {
        return new TranslatorError({
          code: 'ENGINE_LOAD_FAILED',
          stage: 'asset.prepare',
          message: err.toDisplayString(),
          recoverable: err.recoverable,
          context: { modelId, modelCode: err.code },
        });
      }
      return wrapUnknownError(err, 'session.encoder', 'ENGINE_LOAD_FAILED', true, { modelId, attempt });
    },
  },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function loadAsrEngine(forceRetry = false, modelId?: string): Promise<AsrEngine> {
  const id = modelId ?? (await readSelectedModelId('asr'));
  return asrSlot.load(id, forceRetry);
}

export async function loadMtEngine(forceRetry = false, modelId?: string): Promise<MtEngine> {
  const id = modelId ?? (await readSelectedModelId('mt'));
  return mtSlot.load(id, forceRetry);
}

export function resetAsrEngine(): void {
  asrSlot.reset();
}

export function resetMtEngine(): void {
  mtSlot.reset();
}

/**
 * Whether two locales mean the same translation target.
 *
 * Compared through FLORES rather than by string so es-ES and es-MX are
 * recognised as one language, while zh-CN and zh-TW stay two.
 */
export function isSameLanguage(a: string, b: string): boolean {
  if (a === b) return true;
  const left = mapSpeechLocaleToFlores(a);
  return left != null && left === mapSpeechLocaleToFlores(b);
}
