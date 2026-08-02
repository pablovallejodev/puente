/**
 * Model catalog vocabulary.
 *
 * A model is described along three independent axes, so a new model is data,
 * not code:
 *
 *   task    what it does           asr | mt | vad
 *   engine  what executes it       ort | sherpa | llama
 *   runtime what that engine needs (discriminated by engine + kind)
 *
 * Adding a model whose engine and runtime kind already exist is a single entry
 * in models.ts. Adding a new runtime kind means one new adapter in lib/engines.
 */

import { TRADUCTOR_LANGUAGES } from "@/constants/traductor-languages";

export type ModelTask = "asr" | "mt" | "vad";

export type EngineId = "ort" | "sherpa" | "llama";

export const ENGINE_LABEL: Record<EngineId, string> = {
  ort: "ONNX Runtime",
  sherpa: "sherpa-onnx",
  llama: "llama.cpp",
};

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export type ModelFileSpec = {
  /** Path inside the installed model directory. */
  relativePath: string;
  /** Absolute Hugging Face resolve URL. */
  url: string;
  /** Exact byte size from the Hugging Face tree API; verified on download. */
  expectedBytes: number;
};

// ---------------------------------------------------------------------------
// Licensing
// ---------------------------------------------------------------------------

/**
 * Licence matters for this project beyond legal hygiene: Puente ships on
 * F-Droid and is built by and for the EU community, so a model whose licence
 * excludes the EU cannot be in the catalog at all — however good it is.
 */
export type ModelLicense = {
  id: string;
  label: string;
  /** False for research/non-commercial licences such as CC-BY-NC. */
  allowsCommercialUse: boolean;
  url: string;
};

export const LICENSE = {
  apache2: {
    id: "apache-2.0",
    label: "Apache 2.0",
    allowsCommercialUse: true,
    url: "https://www.apache.org/licenses/LICENSE-2.0",
  },
  mit: {
    id: "mit",
    label: "MIT",
    allowsCommercialUse: true,
    url: "https://opensource.org/license/mit",
  },
  ccByNc4: {
    id: "cc-by-nc-4.0",
    label: "CC BY-NC 4.0",
    allowsCommercialUse: false,
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
} as const satisfies Record<string, ModelLicense>;

// ---------------------------------------------------------------------------
// Memory tiers
// ---------------------------------------------------------------------------

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export { GB, MB };

/**
 * Minimum-RAM tiers, in bytes, calibrated against *reported* memory.
 *
 * Device.totalMemory returns what the kernel sees, which is 4-8% below the
 * marketed capacity because the bootloader reserves memory before Android
 * starts: a "12 GB" phone reports ~11.1-11.6 GB. Thresholds therefore sit
 * under the round number they gate, or every device would fail its own tier.
 *
 * The tiers are deliberately one step more conservative than the raw weight
 * size suggests. Reported total is not available memory: a phone with 12 GB
 * installed and a browser plus a chat app in the background has far less, and
 * ONNX Runtime allocates the whole graph up front — it either fits or the
 * process dies. A pessimistic tier costs a warning label; an optimistic one
 * costs a crash mid-conversation.
 */
export const RAM_TIER = {
  /** "3 GB" class. */
  entry: 2.7 * GB,
  /** "4 GB" class. */
  low: 3.6 * GB,
  /** "6 GB" class. */
  mid: 5.5 * GB,
  /** "8 GB" class. */
  high: 7.3 * GB,
  /** "12 GB" class. */
  flagship: 11 * GB,
} as const;

/**
 * Catalog footprint class for UI badges — ordered by peak RAM, not by quality.
 *
 * 1 RAM baja · 2 media-baja · 3 media · 4 alta
 */
export type ModelRamTier = 1 | 2 | 3 | 4;

export const RAM_TIER_LABEL: Record<ModelRamTier, string> = {
  1: "RAM baja",
  2: "RAM media-baja",
  3: "RAM media",
  4: "RAM alta",
};

// ---------------------------------------------------------------------------
// Runtime configuration, per engine
// ---------------------------------------------------------------------------

/**
 * Encoder/decoder Whisper exported by Optimum, decoded by our own loop.
 * File names are the ones the downloader writes, not the HF repo paths.
 */
export type OrtWhisperRuntime = {
  engine: "ort";
  kind: "whisper";
  encoderFile: string;
  decoderFile: string;
  configFile: string;
  generationConfigFile: string;
  preprocessorFile: string;
  tokenizerFile: string;
  tokenizerConfigFile: string;
};

/** Encoder/decoder NLLB exported by Optimum, decoded by our own loop. */
export type OrtNllbRuntime = {
  engine: "ort";
  kind: "nllb";
  encoderFile: string;
  decoderFile: string;
  configFile: string;
  generationConfigFile: string;
  tokenizerFile: string;
  tokenizerConfigFile: string;
};

/** Silero VAD v5: one small graph with a recurrent state we carry ourselves. */
export type OrtSileroVadRuntime = {
  engine: "ort";
  kind: "silero-vad";
  modelFile: string;
  /** Frame size in samples the graph expects at 16 kHz. */
  frameSamples: number;
};

/**
 * sherpa-onnx model types, mirroring STTModelType in the React Native binding.
 * Only the ones present in this catalog are listed.
 *
 * `transducer` covers icefall Zipformer offline (encoder/decoder/joiner).
 * `nemo_transducer` is Parakeet TDT. They share the same native file layout but
 * different detectors, so they stay distinct.
 */
export type SherpaModelType =
  | "transducer"
  | "nemo_transducer"
  | "whisper"
  | "sense_voice"
  | "moonshine";

export type SherpaAsrRuntime = {
  engine: "sherpa";
  kind: "offline-asr";
  /**
   * Passed explicitly to createSTT instead of relying on auto-detection.
   *
   * sherpa-onnx still cross-checks the type against the *directory name*
   * (see GetSttPathHints in the native detector: "sense", "parakeet", "tdt",
   * "whisper", "moonshine"). The model id becomes that directory name, so
   * renaming an id can break loading even though every file is intact.
   */
  modelType: SherpaModelType;
  /** Prefer *.int8.onnx when both precisions are present in the folder. */
  preferInt8: boolean;
  /** Language hint for the model types that accept one. */
  language?: string;
};

/**
 * GGUF through llama.cpp. Covers both decoder-only translators (salamandraTA)
 * and encoder-decoder ones (MADLAD/T5) — llama.rn calls llama_encode when the
 * model reports an encoder, so both work through the same completion API.
 */
export type LlamaMtRuntime = {
  engine: "llama";
  kind: "gguf-mt";
  ggufFile: string;
  /** How the source text is turned into a prompt for this model family. */
  promptStyle: "madlad-tag" | "salamandra-instruct";
  /** Context window; kept small because translation turns are short. */
  contextSize: number;
  /** Upper bound on generated tokens per turn. */
  maxTokens: number;
};

export type AsrRuntime = OrtWhisperRuntime | SherpaAsrRuntime;
export type MtRuntime = OrtNllbRuntime | LlamaMtRuntime;
export type VadRuntime = OrtSileroVadRuntime;
export type ModelRuntime = AsrRuntime | MtRuntime | VadRuntime;

// ---------------------------------------------------------------------------
// Language coverage
// ---------------------------------------------------------------------------

/** App language ids (ISO 639-1, plus `yue`) — the shared Whisper ∩ NLLB list. */
export const ALL_LANGUAGE_IDS: readonly string[] = TRADUCTOR_LANGUAGES.map(
  (l) => l.id,
);

/**
 * How an ASR model reports the language it just heard.
 *
 * `none` is the awkward case: transducers like Parakeet transcribe many
 * languages but never say which one, so Universal mode has nothing to hand the
 * translator. The catalog states it and the UI warns instead of the engine
 * failing halfway through a conversation.
 */
export type LanguageDetection = "auto" | "fixed-single" | "none";

// ---------------------------------------------------------------------------
// Model specs
// ---------------------------------------------------------------------------

type ModelSpecBase = {
  /**
   * Stable identifier, also the on-disk directory name.
   *
   * Never change it for a published model: users would silently re-download,
   * and sherpa-onnx derives part of its model detection from this string.
   */
  id: string;
  /**
   * On-disk namespace under documentDirectory/models/.
   *
   * Separate from `task` purely for backwards compatibility: models shipped
   * before the multi-engine catalog live under "whisper" and "nllb" and must
   * stay there so existing installs keep working.
   */
  storage: string;
  label: string;
  shortLabel: string;
  /** One line for the model card: what you gain and what you pay. */
  qualityTag: string;
  /** Why this specific repository and quantisation, in the model card. */
  sourceNote: string;
  hfRepoId: string;
  hfRepoUrl: string;
  license: ModelLicense;
  /** App language ids this model can handle. */
  languageIds: readonly string[];
  /** Sum of file sizes; the download total. */
  diskBytes: number;
  /**
   * Peak resident memory while this model alone is loaded (weights + arena +
   * activations). Shown as "RAM máxima". Always budget it together with the
   * other task's model — see pairFitsDevice.
   */
  peakRamBytes: number;
  /**
   * Minimum Device.totalMemory before this model is a reasonable pick next to
   * the default companion (NLLB for ASR, Tiny for MT). Pair pressure still
   * wins when the selected companion is heavier.
   */
  minRecommendedRamBytes: number;
  /** Footprint class for badges (1 = lightest … 4 = heaviest). */
  ramTier: ModelRamTier;
  files: ModelFileSpec[];
};

export type AsrModelSpec = ModelSpecBase & {
  task: "asr";
  runtime: AsrRuntime;
  languageDetection: LanguageDetection;
};

export type MtModelSpec = ModelSpecBase & {
  task: "mt";
  runtime: MtRuntime;
};

export type VadModelSpec = ModelSpecBase & {
  task: "vad";
  runtime: VadRuntime;
};

export type ModelSpec = AsrModelSpec | MtModelSpec | VadModelSpec;

/** Engine that will execute a given spec. */
export function engineOf(spec: ModelSpec): EngineId {
  return spec.runtime.engine;
}
