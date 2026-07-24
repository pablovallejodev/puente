/**
 * ONNX model catalog — Hugging Face Xenova (verified 2026-07-24).
 * Only `*_quantized` / `decoder_model_merged_quantized` (validated runtime format).
 */

export type ModelFamily = "whisper" | "nllb";

export type ModelFileSpec = {
  /** Path relative to the installed model directory (and often to HF repo). */
  relativePath: string;
  /** Absolute Hugging Face resolve URL. */
  url: string;
  /** Exact Content-Length from HF CDN. */
  expectedBytes: number;
};

export type ModelSpec = {
  id: string;
  family: ModelFamily;
  label: string;
  shortLabel: string;
  /** Speed / reliability tag shown on the card. */
  qualityTag: string;
  hfRepoId: string;
  hfRepoUrl: string;
  /** Total download size (sum of files). */
  diskBytes: number;
  /** Peak RAM estimate for UI. */
  approxRamBytes: number;
  /** Warn on card if device RAM is below this. */
  minRecommendedRamBytes: number;
  files: ModelFileSpec[];
};

const HF = "https://huggingface.co";

function hfFile(repoId: string, path: string, expectedBytes: number): ModelFileSpec {
  return {
    relativePath: path.includes("/") ? path.split("/").pop()! : path,
    url: `${HF}/${repoId}/resolve/main/${path}`,
    expectedBytes,
  };
}

/** ONNX files keep their HF basename; configs from repo root use basename. */
function whisperFiles(
  repoId: string,
  sizes: {
    encoder: number;
    decoder: number;
    config: number;
    generation: number;
    preprocessor: number;
    tokenizerConfig: number;
    tokenizer: number;
  },
): ModelFileSpec[] {
  return [
    hfFile(repoId, "onnx/encoder_model_quantized.onnx", sizes.encoder),
    hfFile(repoId, "onnx/decoder_model_merged_quantized.onnx", sizes.decoder),
    hfFile(repoId, "config.json", sizes.config),
    hfFile(repoId, "generation_config.json", sizes.generation),
    hfFile(repoId, "preprocessor_config.json", sizes.preprocessor),
    hfFile(repoId, "tokenizer_config.json", sizes.tokenizerConfig),
    hfFile(repoId, "tokenizer.json", sizes.tokenizer),
  ];
}

function nllbFiles(
  repoId: string,
  sizes: {
    encoder: number;
    decoder: number;
    config: number;
    generation: number;
    tokenizerConfig: number;
    tokenizer: number;
    specialTokens: number;
  },
): ModelFileSpec[] {
  return [
    hfFile(repoId, "onnx/encoder_model_quantized.onnx", sizes.encoder),
    hfFile(repoId, "onnx/decoder_model_merged_quantized.onnx", sizes.decoder),
    hfFile(repoId, "config.json", sizes.config),
    hfFile(repoId, "generation_config.json", sizes.generation),
    hfFile(repoId, "tokenizer_config.json", sizes.tokenizerConfig),
    hfFile(repoId, "tokenizer.json", sizes.tokenizer),
    hfFile(repoId, "special_tokens_map.json", sizes.specialTokens),
  ];
}

function diskTotal(files: ModelFileSpec[]): number {
  return files.reduce((sum, f) => sum + f.expectedBytes, 0);
}

const WHISPER_TINY_FILES = whisperFiles("Xenova/whisper-tiny", {
  encoder: 10_124_910,
  decoder: 30_727_765,
  config: 2_248,
  generation: 3_716,
  preprocessor: 339,
  tokenizerConfig: 282_683,
  tokenizer: 2_480_466,
});

const WHISPER_BASE_FILES = whisperFiles("Xenova/whisper-base", {
  encoder: 23_200_850,
  decoder: 53_707_539,
  config: 2_248,
  generation: 3_776,
  preprocessor: 339,
  tokenizerConfig: 282_683,
  tokenizer: 2_480_466,
});

const WHISPER_SMALL_FILES = whisperFiles("Xenova/whisper-small", {
  encoder: 92_324_809,
  decoder: 156_780_950,
  config: 2_232,
  generation: 3_837,
  preprocessor: 339,
  tokenizerConfig: 282_683,
  tokenizer: 2_480_466,
});

const NLLB_FILES = nllbFiles("Xenova/nllb-200-distilled-600M", {
  encoder: 419_120_483,
  decoder: 475_505_771,
  config: 873,
  generation: 189,
  tokenizerConfig: 544,
  tokenizer: 17_331_224,
  specialTokens: 3_548,
});

export const WHISPER_MODELS: ModelSpec[] = [
  {
    id: "whisper-tiny-q",
    family: "whisper",
    label: "Whisper Tiny",
    shortLabel: "Tiny",
    qualityTag: "Más rápido, menos fiable",
    hfRepoId: "Xenova/whisper-tiny",
    hfRepoUrl: `${HF}/Xenova/whisper-tiny`,
    diskBytes: diskTotal(WHISPER_TINY_FILES),
    approxRamBytes: 400 * 1024 * 1024,
    minRecommendedRamBytes: 2 * 1024 * 1024 * 1024,
    files: WHISPER_TINY_FILES,
  },
  {
    id: "whisper-base-q",
    family: "whisper",
    label: "Whisper Base",
    shortLabel: "Base",
    qualityTag: "Equilibrio velocidad / fiabilidad",
    hfRepoId: "Xenova/whisper-base",
    hfRepoUrl: `${HF}/Xenova/whisper-base`,
    diskBytes: diskTotal(WHISPER_BASE_FILES),
    approxRamBytes: 650 * 1024 * 1024,
    minRecommendedRamBytes: 4 * 1024 * 1024 * 1024,
    files: WHISPER_BASE_FILES,
  },
  {
    id: "whisper-small-q",
    family: "whisper",
    label: "Whisper Small",
    shortLabel: "Small",
    qualityTag: "Más lento, más fiable",
    hfRepoId: "Xenova/whisper-small",
    hfRepoUrl: `${HF}/Xenova/whisper-small`,
    diskBytes: diskTotal(WHISPER_SMALL_FILES),
    approxRamBytes: 1.4 * 1024 * 1024 * 1024,
    minRecommendedRamBytes: 6 * 1024 * 1024 * 1024,
    files: WHISPER_SMALL_FILES,
  },
];

export const NLLB_MODELS: ModelSpec[] = [
  {
    id: "nllb-600m-q8",
    family: "nllb",
    label: "NLLB 600M Q8",
    shortLabel: "600M",
    qualityTag: "Único tamaño apto para móvil (cuantizado validado)",
    hfRepoId: "Xenova/nllb-200-distilled-600M",
    hfRepoUrl: `${HF}/Xenova/nllb-200-distilled-600M`,
    diskBytes: diskTotal(NLLB_FILES),
    approxRamBytes: 1.2 * 1024 * 1024 * 1024,
    minRecommendedRamBytes: 4 * 1024 * 1024 * 1024,
    files: NLLB_FILES,
  },
];

export const ALL_MODELS: ModelSpec[] = [...WHISPER_MODELS, ...NLLB_MODELS];

export function getModelSpec(id: string): ModelSpec | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

export function requireModelSpec(id: string): ModelSpec {
  const spec = getModelSpec(id);
  if (!spec) {
    throw new Error(`Unknown model id: ${id}`);
  }
  return spec;
}

const GB = 1024 * 1024 * 1024;

/** Recommend Whisper by device RAM; NLLB is always the single 600M Q8. */
export function recommendForDevice(totalMemoryBytes: number | null): {
  whisperId: string;
  nllbId: string;
} {
  const nllbId = NLLB_MODELS[0].id;
  if (totalMemoryBytes == null || totalMemoryBytes < 4 * GB) {
    return { whisperId: "whisper-tiny-q", nllbId };
  }
  if (totalMemoryBytes < 6 * GB) {
    return { whisperId: "whisper-base-q", nllbId };
  }
  return { whisperId: "whisper-small-q", nllbId };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}
