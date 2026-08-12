/**
 * Engine contracts.
 *
 * An engine is a loaded model ready to answer. Everything above this line —
 * hooks, scheduler, UI — talks only to `AsrEngine` and `MtEngine` and never
 * learns whether the answer came from ONNX Runtime, sherpa-onnx or llama.cpp.
 *
 * Two conventions make the adapters interchangeable:
 *
 *   ASR speaks app language ids  ("es", "yue"), which are also Whisper codes.
 *   MT speaks BCP-47 locales     ("es-ES", "zh-TW").
 *
 * MT keeps locales rather than ids because the script matters: zh-TW and zh-CN
 * are the same id but different FLORES codes, and collapsing them here would
 * lose information no adapter could recover. Each adapter maps the locale into
 * its own code space (FLORES for NLLB, `<2xx>` tags for MADLAD, language names
 * for SalamandraTA) and raises LANGUAGE_UNSUPPORTED when it cannot.
 */

import type { EngineId, LanguageDetection } from '@/constants/model-catalog';
import type { WhisperTranscribeResult } from '@/lib/whisper-inference';

/**
 * Reused verbatim from the Whisper pipeline rather than redefined: every field
 * is engine-neutral, and a parallel type would only invite the two to drift.
 */
export type AsrResult = WhisperTranscribeResult;

export type AsrRequest = {
  /** App language id to force, or "auto" to let the engine decide. */
  language: 'auto' | string;
  /**
   * Language detected in the previous chunk of this conversation.
   *
   * Detection from a two-second fragment is unreliable; reusing the previous
   * answer when the current one is not confident keeps a conversation from
   * flipping languages mid-sentence. Engines that cannot detect ignore it.
   */
  stickyLanguage?: string | null;
  shouldCancel?: () => boolean;
};

export interface AsrEngine {
  readonly modelId: string;
  readonly engineId: EngineId;
  /** What this model can tell the caller about the language it just heard. */
  readonly languageDetection: LanguageDetection;
  /**
   * PCM must be mono float32 at 16 kHz.
   *
   * A cancelled or silent chunk resolves with `noSpeech` set and empty text
   * rather than rejecting: the caller drops it and moves on, and a room going
   * quiet is not an error.
   */
  transcribe(pcm: Float32Array, request: AsrRequest): Promise<AsrResult>;
  dispose(): void;
}

export type MtRequest = {
  shouldCancel?: () => boolean;
};

export interface MtEngine {
  readonly modelId: string;
  readonly engineId: EngineId;
  /** False when this model has no code for that locale; the UI can warn early. */
  supportsLocale(locale: string): boolean;
  /** Resolves null when cancelled mid-decode. */
  translate(text: string, srcLocale: string, tgtLocale: string, request?: MtRequest): Promise<string | null>;
  dispose(): void;
}
