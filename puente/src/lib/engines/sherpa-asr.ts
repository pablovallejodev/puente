/**
 * Offline ASR through sherpa-onnx.
 *
 * Why it exists alongside the ONNX Runtime path: the decoding loop runs in C++.
 * Whisper on ORT crosses the JavaScript bridge once per generated token, which
 * is what makes it slow on a phone regardless of model size. sherpa hands over
 * the audio once and gets the text back once, and it brings beam search,
 * endpointing and transducer models (Parakeet) that have no ORT equivalent here.
 *
 * The native module is optional: a build that was not prebuilt with it must say
 * so clearly instead of crashing, so it is required lazily.
 */

import type {
  AsrModelSpec,
  SherpaAsrRuntime,
  SherpaModelType,
} from "@/constants/model-catalog";
import { whisperLangToSpeechLocale } from "@/constants/whisper-languages";
import { EngineError, moduleUnavailable, wrapEngineError } from "@/lib/engine-errors";
import { getModelDir, toNativePath } from "@/lib/model-paths";
import type { AsrEngine, AsrRequest, AsrResult } from "@/lib/engines/types";

const PACKAGE = "react-native-sherpa-onnx";

// ---------------------------------------------------------------------------
// Native module surface
// ---------------------------------------------------------------------------

type SherpaResult = {
  text: string;
  lang: string;
};

type SherpaEngine = {
  transcribeSamples(
    samples: number[],
    sampleRate: number,
  ): Promise<SherpaResult>;
  destroy(): Promise<void>;
};

type SherpaSttModule = {
  createSTT(options: {
    modelPath: { type: "file"; path: string };
    modelType?: SherpaModelType;
    preferInt8?: boolean;
    numThreads?: number;
    modelOptions?: {
      whisper?: { language?: string; task?: "transcribe" };
      senseVoice?: { language?: string; useItn?: boolean };
    };
  }): Promise<SherpaEngine>;
};

function loadModule(): SherpaSttModule {
  try {
    // Required lazily: importing at module scope would run the TurboModule
    // lookup during the first render of any screen that touches the catalog.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-sherpa-onnx/stt") as SherpaSttModule;
  } catch (err) {
    throw moduleUnavailable("sherpa-onnx", PACKAGE, err);
  }
}

/**
 * Model types whose language is fixed when the recognizer is built.
 *
 * sherpa exposes no way to change it afterwards, so switching between Universal
 * and a forced language means rebuilding — see `ensureLanguage` below.
 */
const LANGUAGE_AT_INIT: ReadonlySet<SherpaModelType> = new Set([
  "whisper",
  "sense_voice",
]);

/** sherpa reports the language as a Whisper special token, e.g. "<|es|>". */
function parseLang(raw: string): string {
  const match = /^<\|([a-z-]+)\|>$/i.exec(raw.trim());
  return (match?.[1] ?? raw.trim()).toLowerCase();
}

// ---------------------------------------------------------------------------

export class SherpaAsrEngine implements AsrEngine {
  readonly engineId = "sherpa" as const;

  private native: SherpaEngine | null;
  /** Language the current recognizer was built with; "" means auto-detect. */
  private builtLanguage: string;

  private constructor(
    private readonly spec: AsrModelSpec,
    private readonly runtime: SherpaAsrRuntime,
    native: SherpaEngine,
    builtLanguage: string,
  ) {
    this.native = native;
    this.builtLanguage = builtLanguage;
  }

  get modelId(): string {
    return this.spec.id;
  }

  get languageDetection(): AsrModelSpec["languageDetection"] {
    return this.spec.languageDetection;
  }

  static async create(spec: AsrModelSpec): Promise<SherpaAsrEngine> {
    const runtime = spec.runtime as SherpaAsrRuntime;
    const language = runtime.language ?? "";
    const native = await SherpaAsrEngine.build(spec, runtime, language);
    return new SherpaAsrEngine(spec, runtime, native, language);
  }

  private static async build(
    spec: AsrModelSpec,
    runtime: SherpaAsrRuntime,
    language: string,
  ): Promise<SherpaEngine> {
    const stt = loadModule();
    try {
      return await stt.createSTT({
        modelPath: { type: "file", path: toNativePath(getModelDir(spec)) },
        // Passed explicitly rather than relying on auto-detection, which
        // guesses from filenames and directory names.
        modelType: runtime.modelType,
        preferInt8: runtime.preferInt8,
        // Matches the ORT encoder budget: four threads is where a mid-range
        // big.LITTLE cluster stops gaining and starts contending with the UI.
        numThreads: 4,
        modelOptions: {
          // An empty language makes sherpa detect it; anything else forces it.
          whisper: { language, task: "transcribe" },
          senseVoice: { language, useItn: true },
        },
      });
    } catch (err) {
      throw wrapEngineError(err, "engine.init", "ENGINE_INIT_FAILED", false, {
        modelId: spec.id,
        modelType: runtime.modelType,
        language: language || "auto",
      });
    }
  }

  /**
   * Rebuild the recognizer when the requested language no longer matches the
   * one it was built with.
   *
   * Ponytail: costs a full model reload (about a second for Turbo). Acceptable
   * because it only happens when the user changes the input language, not per
   * chunk. Upgrade path: keep one recognizer per language if sherpa ever grows
   * a runtime language setter.
   */
  private async ensureLanguage(requested: string): Promise<SherpaEngine> {
    if (!this.native) {
      throw new EngineError({
        code: "ENGINE_DISPOSED",
        stage: "asr.run",
        message: `El motor ${this.spec.id} ya fue liberado`,
        recoverable: true,
      });
    }
    if (
      !LANGUAGE_AT_INIT.has(this.runtime.modelType) ||
      requested === this.builtLanguage
    ) {
      return this.native;
    }

    const previous = this.native;
    this.native = null;
    await previous.destroy().catch(() => {
      // A recognizer that fails to free is a leak, not a reason to refuse the
      // rebuild the user is waiting for.
    });
    const next = await SherpaAsrEngine.build(this.spec, this.runtime, requested);
    this.native = next;
    this.builtLanguage = requested;
    return next;
  }

  async transcribe(pcm: Float32Array, request: AsrRequest): Promise<AsrResult> {
    const requested = request.language === "auto" ? "" : request.language;
    const native = await this.ensureLanguage(requested);

    let result: SherpaResult;
    try {
      // Ponytail: the binding takes a plain number[], so a 12-second chunk
      // copies ~192k elements across the bridge. Measurable but far below the
      // inference cost. Upgrade path: an ArrayBuffer overload in the binding.
      result = await native.transcribeSamples(Array.from(pcm), 16000);
    } catch (err) {
      throw wrapEngineError(err, "asr.run", "ENGINE_RUN_FAILED", true, {
        modelId: this.spec.id,
        samples: pcm.length,
      });
    }

    const text = result.text.trim();
    const detected = parseLang(result.lang ?? "");
    // Fall back in the order the caller can trust: what the model said, then
    // what the caller forced, then the language carried over from the previous
    // chunk. Transducers report nothing, so for them only the last two apply.
    const language =
      detected || requested || request.stickyLanguage?.trim() || "";

    return {
      text,
      language,
      // sherpa commits to a language without publishing a score. Reporting 1
      // for "it told us" and 0 for "we guessed" keeps the field meaningful
      // against the ORT path, which reports a real softmax peak.
      languageProb: detected ? 1 : 0,
      speechLocale: (language && whisperLangToSpeechLocale(language)) || "",
      usedSticky: !detected && !requested && Boolean(request.stickyLanguage),
      noSpeech: text.length === 0,
      noSpeechProb: text.length === 0 ? 1 : 0,
    };
  }

  dispose(): void {
    const native = this.native;
    this.native = null;
    void native?.destroy().catch(() => {
      /* best effort */
    });
  }
}
