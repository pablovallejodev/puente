/**
 * Translation through llama.cpp (GGUF), via llama.rn.
 *
 * Covers the two model families in the catalog that ONNX Runtime cannot host
 * usefully on a phone:
 *
 *   SalamandraTA 2B  decoder-only, instruction-tuned, Apache 2.0, European.
 *                    Best quality available here for European pairs, and the
 *                    only model that treats Catalan, Galician, Basque and
 *                    Occitan as first-class rather than as long-tail noise.
 *   MADLAD-400 3B    encoder-decoder (T5). llama.cpp calls llama_encode before
 *                    generating, so it runs through the same completion API.
 *                    Chosen for language coverage, not for speed.
 *
 * The native module is optional; a build without it must say so rather than
 * crash, so it is required lazily.
 */

import { findTraductorLanguageByLocale } from '@/constants/traductor-languages';
import type { LlamaMtRuntime, MtModelSpec } from '@/constants/model-catalog';
import { EngineError, moduleUnavailable, wrapEngineError } from '@/lib/engine-errors';
import { getModelFilePath, toNativePath } from '@/lib/model-paths';
import type { MtEngine, MtRequest } from '@/lib/engines/types';

const PACKAGE = 'llama.rn';

// ---------------------------------------------------------------------------
// Native module surface
// ---------------------------------------------------------------------------

type CompletionResult = { text: string; content: string };

type CompletionRequest = {
  prompt?: string;
  messages?: { role: 'user'; content: string }[];
  jinja?: boolean;
  n_predict?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  penalty_repeat?: number;
  penalty_last_n?: number;
  seed?: number;
  stop?: string[];
};

type LlamaContextLike = {
  completion(params: CompletionRequest): Promise<CompletionResult>;
  stopCompletion(): Promise<void>;
  isJinjaSupported(): boolean;
  release(): Promise<void>;
};

type LlamaModule = {
  initLlama(params: {
    model: string;
    n_ctx?: number;
    n_threads?: number;
    n_gpu_layers?: number;
    use_mlock?: boolean;
    use_mmap?: boolean;
  }): Promise<LlamaContextLike>;
};

function loadModule(): LlamaModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('llama.rn') as LlamaModule;
  } catch (err) {
    throw moduleUnavailable('llama.cpp', PACKAGE, err);
  }
}

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------

/**
 * Sampling for translation: as close to greedy as llama.cpp allows.
 *
 * Creativity is a defect here — the answer is supposed to be determined by the
 * input — so temperature is 0 and the repetition penalty is only a backstop
 * against the decoding loops a quantised 2B model still falls into.
 */
const SAMPLING = {
  temperature: 0,
  top_k: 1,
  top_p: 1,
  penalty_repeat: 1.05,
  penalty_last_n: 64,
  seed: 0,
} as const;

type PromptParts = Pick<CompletionRequest, 'prompt' | 'messages' | 'jinja' | 'stop'>;

function buildPrompt(
  runtime: LlamaMtRuntime,
  text: string,
  src: { id: string; label: string },
  tgt: { id: string; label: string },
  jinjaSupported: boolean,
): PromptParts {
  if (runtime.promptStyle === 'madlad-tag') {
    // MADLAD's training format: a target-language tag prepended to the source.
    // Its tags are ISO 639-1, which is what the app uses for language ids.
    return { prompt: `<2${tgt.id}> ${text}`, stop: ['\n'] };
  }

  // SalamandraTA. The instruct model's documented prompt, sent through the
  // GGUF's own chat template when llama.cpp can apply one.
  const instruction = `Translate the following text from ${src.label} into ${tgt.label}.\n${src.label}: ${text}\n${tgt.label}:`;
  if (jinjaSupported) {
    return {
      messages: [{ role: 'user', content: instruction }],
      jinja: true,
      stop: ['\n'],
    };
  }
  // Without a template, fall back to the base model's bracket format, which
  // salamandraTA also understands because the instruct model continues it.
  return { prompt: `[${src.label}] ${text} \n[${tgt.label}]`, stop: ['\n'] };
}

/**
 * Strip what an instruction-tuned model adds around the answer.
 *
 * A 2B model asked to translate sometimes answers "English: Hello" or wraps the
 * result in quotes. Removing a leading `Label:` is safe because the label is
 * one we just wrote into the prompt.
 */
function cleanOutput(raw: string, targetLabel: string): string {
  let text = raw.trim();
  const prefix = new RegExp(`^${targetLabel}\\s*:\\s*`, 'i');
  text = text.replace(prefix, '').trim();
  if (text.length >= 2 && /^["“'](.*)["”']$/s.test(text)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

// ---------------------------------------------------------------------------

export class LlamaMtEngine implements MtEngine {
  readonly engineId = 'llama' as const;

  private context: LlamaContextLike | null;
  private readonly jinjaSupported: boolean;

  private constructor(
    private readonly spec: MtModelSpec,
    private readonly runtime: LlamaMtRuntime,
    context: LlamaContextLike,
  ) {
    this.context = context;
    this.jinjaSupported = runtime.promptStyle === 'salamandra-instruct' && safeIsJinjaSupported(context);
  }

  get modelId(): string {
    return this.spec.id;
  }

  static async create(spec: MtModelSpec): Promise<LlamaMtEngine> {
    const runtime = spec.runtime as LlamaMtRuntime;
    const llama = loadModule();

    let context: LlamaContextLike;
    try {
      context = await llama.initLlama({
        model: toNativePath(getModelFilePath(spec, runtime.ggufFile)),
        n_ctx: runtime.contextSize,
        n_threads: 4,
        // No GPU offload: Android has no usable backend here, and on iOS Metal
        // competes with the UI for the same unified memory the model already
        // fills.
        n_gpu_layers: 0,
        // mmap keeps the weights file-backed so the OS can evict pages under
        // pressure instead of killing the app; mlock would defeat exactly that.
        use_mmap: true,
        use_mlock: false,
      });
    } catch (err) {
      throw wrapEngineError(err, 'engine.init', 'ENGINE_INIT_FAILED', false, {
        modelId: spec.id,
        contextSize: runtime.contextSize,
      });
    }

    return new LlamaMtEngine(spec, runtime, context);
  }

  supportsLocale(locale: string): boolean {
    const language = findTraductorLanguageByLocale(locale);
    return language != null && this.spec.languageIds.includes(language.id);
  }

  async translate(text: string, srcLocale: string, tgtLocale: string, request?: MtRequest): Promise<string | null> {
    const context = this.context;
    if (!context) {
      throw new EngineError({
        code: 'ENGINE_DISPOSED',
        stage: 'mt.run',
        message: `El motor ${this.spec.id} ya fue liberado`,
        recoverable: true,
      });
    }

    const src = this.resolveLanguage(srcLocale, 'input');
    const tgt = this.resolveLanguage(tgtLocale, 'output');
    if (request?.shouldCancel?.()) return null;

    let result: CompletionResult;
    try {
      result = await context.completion({
        ...SAMPLING,
        ...buildPrompt(this.runtime, text, src, tgt, this.jinjaSupported),
        n_predict: this.runtime.maxTokens,
      });
    } catch (err) {
      // A cancellation raced with the completion; the caller is discarding the
      // result anyway, so report nothing rather than an error.
      if (request?.shouldCancel?.()) return null;
      throw wrapEngineError(err, 'mt.run', 'ENGINE_RUN_FAILED', true, {
        modelId: this.spec.id,
        srcLocale,
        tgtLocale,
      });
    }

    if (request?.shouldCancel?.()) return null;

    const cleaned = cleanOutput(result.content || result.text, tgt.label);
    if (!cleaned) {
      throw new EngineError({
        code: 'ENGINE_OUTPUT_EMPTY',
        stage: 'mt.run',
        message: `${this.spec.label} no devolvió traducción`,
        recoverable: true,
        context: { modelId: this.spec.id, srcLocale, tgtLocale },
      });
    }
    return cleaned;
  }

  private resolveLanguage(locale: string, role: 'input' | 'output'): { id: string; label: string } {
    const language = findTraductorLanguageByLocale(locale);
    if (!language || !this.spec.languageIds.includes(language.id)) {
      throw new EngineError({
        code: 'ENGINE_LANGUAGE_UNSUPPORTED',
        stage: 'mt.language',
        message: `${this.spec.label} no admite este idioma (${role}): ${locale}`,
        recoverable: false,
        context: { modelId: this.spec.id, locale, role },
      });
    }
    return language;
  }

  dispose(): void {
    const context = this.context;
    this.context = null;
    if (!context) return;
    void context
      .stopCompletion()
      .catch(() => {
        /* nothing running */
      })
      .then(() => context.release())
      .catch(() => {
        /* best effort */
      });
  }
}

function safeIsJinjaSupported(context: LlamaContextLike): boolean {
  try {
    return context.isJinjaSupported();
  } catch {
    return false;
  }
}
