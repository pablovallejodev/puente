/**
 * The model catalog.
 *
 * Every `expectedBytes` below is the exact size reported by the Hugging Face
 * tree API (`/api/models/{repo}/tree/main?recursive=true`), verified 2026-07-29.
 * The downloader rejects a file whose size differs by more than 1%, so these
 * are load-bearing numbers, not documentation. When a repository publishes a
 * new revision of a file, downloads start failing with MODEL_SIZE_MISMATCH and
 * the fix is to re-read the API and update the number here.
 *
 * Selection criteria for every entry:
 *   - a quantisation that actually fits a phone (int8 for ONNX, Q4 for GGUF);
 *   - a repository that publishes loose files, since Puente downloads
 *     file-by-file and cannot unpack the .tar.bz2 archives sherpa-onnx usually
 *     distributes;
 *   - a licence usable in the EU. This is why Tencent's HY-MT1.5-1.8B is
 *     absent despite being the strongest mobile translator available: its
 *     licence states it does not apply in the European Union, the United
 *     Kingdom or South Korea, which makes shipping it here unlicensed use.
 *
 * NLLB-200 distilled 1.3B is also absent on purpose: community ONNX exports
 * publish encoder + decoder + decoder_with_past as three separate graphs, and
 * Puente's ORT decoder loop needs the Optimum *merged* decoder
 * (`decoder_model_merged_quantized.onnx`) that Xenova ships for the 600M. Until
 * a merged 1.3B export exists, SalamandraTA / MADLAD cover the quality step up.
 */

import {
  ALL_LANGUAGE_IDS,
  GB,
  LICENSE,
  MB,
  RAM_TIER,
  type AsrModelSpec,
  type ModelFileSpec,
  type MtModelSpec,
  type VadModelSpec,
} from '@/constants/model-catalog/types';

const HF = 'https://huggingface.co';

/** Files keep their Hugging Face basename inside the model directory. */
function hfFile(repoId: string, path: string, expectedBytes: number): ModelFileSpec {
  const relativePath = path.includes('/') ? path.split('/').pop()! : path;
  return {
    relativePath,
    url: `${HF}/${repoId}/resolve/main/${path}`,
    expectedBytes,
  };
}

function repoUrl(repoId: string): string {
  return `${HF}/${repoId}`;
}

function diskTotal(files: ModelFileSpec[]): number {
  return files.reduce((sum, f) => sum + f.expectedBytes, 0);
}

// ---------------------------------------------------------------------------
// Language coverage sets
// ---------------------------------------------------------------------------

/** Parakeet TDT 0.6B v3: the 24 official EU languages plus Russian and Ukrainian. */
const PARAKEET_V3_LANGUAGE_IDS = [
  'bg',
  'hr',
  'cs',
  'da',
  'nl',
  'en',
  'et',
  'fi',
  'fr',
  'de',
  'el',
  'hu',
  'it',
  'lv',
  'lt',
  'mt',
  'pl',
  'pt',
  'ro',
  'sk',
  'sl',
  'es',
  'sv',
  'ru',
  'uk',
] as const;

/** salamandraTA-2B, intersected with the languages this app offers. */
const SALAMANDRA_LANGUAGE_IDS = [
  'bg',
  'ca',
  'hr',
  'cs',
  'cy',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'eu',
  'fi',
  'fr',
  'gl',
  'hu',
  'it',
  'lt',
  'lv',
  'mt',
  'nl',
  'nn',
  'no',
  'oc',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'sr',
  'sv',
  'uk',
] as const;

const SENSE_VOICE_LANGUAGE_IDS = ['zh', 'en', 'ja', 'ko', 'yue'] as const;

const ENGLISH_ONLY = ['en'] as const;

// ---------------------------------------------------------------------------
// Shared file-set builders
// ---------------------------------------------------------------------------

type WhisperSizes = {
  encoder: number;
  decoder: number;
  config: number;
  generation: number;
  preprocessor: number;
  tokenizerConfig: number;
  tokenizer: number;
};

function whisperOrtFiles(repoId: string, s: WhisperSizes): ModelFileSpec[] {
  return [
    hfFile(repoId, 'onnx/encoder_model_quantized.onnx', s.encoder),
    hfFile(repoId, 'onnx/decoder_model_merged_quantized.onnx', s.decoder),
    hfFile(repoId, 'config.json', s.config),
    hfFile(repoId, 'generation_config.json', s.generation),
    hfFile(repoId, 'preprocessor_config.json', s.preprocessor),
    hfFile(repoId, 'tokenizer_config.json', s.tokenizerConfig),
    hfFile(repoId, 'tokenizer.json', s.tokenizer),
  ];
}

const WHISPER_ORT_RUNTIME = {
  engine: 'ort',
  kind: 'whisper',
  encoderFile: 'encoder_model_quantized.onnx',
  decoderFile: 'decoder_model_merged_quantized.onnx',
  configFile: 'config.json',
  generationConfigFile: 'generation_config.json',
  preprocessorFile: 'preprocessor_config.json',
  tokenizerFile: 'tokenizer.json',
  tokenizerConfigFile: 'tokenizer_config.json',
} as const;

// ---------------------------------------------------------------------------
// ASR — ONNX Runtime (Whisper, decoded by our own loop)
// ---------------------------------------------------------------------------

const WHISPER_TINY_FILES = whisperOrtFiles('Xenova/whisper-tiny', {
  encoder: 10_124_910,
  decoder: 30_727_765,
  config: 2_248,
  generation: 3_716,
  preprocessor: 339,
  tokenizerConfig: 282_683,
  tokenizer: 2_480_466,
});

const WHISPER_BASE_FILES = whisperOrtFiles('Xenova/whisper-base', {
  encoder: 23_200_850,
  decoder: 53_707_539,
  config: 2_248,
  generation: 3_776,
  preprocessor: 339,
  tokenizerConfig: 282_683,
  tokenizer: 2_480_466,
});

const ORT_ASR_MODELS: AsrModelSpec[] = [
  {
    id: 'whisper-tiny-q',
    storage: 'whisper',
    task: 'asr',
    label: 'Whisper Tiny',
    shortLabel: 'Tiny',
    qualityTag: 'Más rápido, menos fiable',
    sourceNote: 'Exportación INT8 de Xenova, la referencia de facto para Whisper en ONNX Runtime.',
    hfRepoId: 'Xenova/whisper-tiny',
    hfRepoUrl: repoUrl('Xenova/whisper-tiny'),
    license: LICENSE.mit,
    languageIds: ALL_LANGUAGE_IDS,
    languageDetection: 'auto',
    diskBytes: diskTotal(WHISPER_TINY_FILES),
    peakRamBytes: 600 * MB,
    // Floor of the catalog: nothing lighter exists for Universal mode.
    minRecommendedRamBytes: RAM_TIER.entry,
    ramTier: 1,
    files: WHISPER_TINY_FILES,
    runtime: WHISPER_ORT_RUNTIME,
  },
  {
    id: 'whisper-base-q',
    storage: 'whisper',
    task: 'asr',
    label: 'Whisper Base',
    shortLabel: 'Base',
    qualityTag: 'Equilibrio velocidad / fiabilidad',
    sourceNote: 'Exportación INT8 de Xenova, la referencia de facto para Whisper en ONNX Runtime.',
    hfRepoId: 'Xenova/whisper-base',
    hfRepoUrl: repoUrl('Xenova/whisper-base'),
    license: LICENSE.mit,
    languageIds: ALL_LANGUAGE_IDS,
    languageDetection: 'auto',
    diskBytes: diskTotal(WHISPER_BASE_FILES),
    peakRamBytes: 1.2 * GB,
    // With NLLB, pair peak needs ~8 GB class (see PAIR_BUDGET_FRACTION).
    minRecommendedRamBytes: RAM_TIER.high,
    ramTier: 2,
    files: WHISPER_BASE_FILES,
    runtime: WHISPER_ORT_RUNTIME,
  },
];

// ---------------------------------------------------------------------------
// ASR — sherpa-onnx (native decoding: beam search and endpointing in C++)
// ---------------------------------------------------------------------------
//
// Model ids double as directory names and sherpa-onnx's native detector reads
// them: "parakeet"/"tdt" select the NeMo transducer path, "whisper", "sense"
// and "moonshine" select theirs. Keep the keyword in the id when editing.

const PARAKEET_REPO = 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8';
const PARAKEET_FILES: ModelFileSpec[] = [
  hfFile(PARAKEET_REPO, 'encoder.int8.onnx', 652_184_281),
  hfFile(PARAKEET_REPO, 'decoder.int8.onnx', 11_845_275),
  hfFile(PARAKEET_REPO, 'joiner.int8.onnx', 6_355_277),
  hfFile(PARAKEET_REPO, 'tokens.txt', 93_939),
];

const SHERPA_WHISPER_TURBO_REPO = 'csukuangfj/sherpa-onnx-whisper-turbo';
const SHERPA_WHISPER_TURBO_FILES: ModelFileSpec[] = [
  hfFile(SHERPA_WHISPER_TURBO_REPO, 'turbo-encoder.int8.onnx', 674_716_297),
  hfFile(SHERPA_WHISPER_TURBO_REPO, 'turbo-decoder.int8.onnx', 361_080_764),
  hfFile(SHERPA_WHISPER_TURBO_REPO, 'turbo-tokens.txt', 816_730),
];

const SENSE_VOICE_REPO = 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17';
const SENSE_VOICE_FILES: ModelFileSpec[] = [
  hfFile(SENSE_VOICE_REPO, 'model.int8.onnx', 239_233_841),
  hfFile(SENSE_VOICE_REPO, 'tokens.txt', 315_894),
];

const MOONSHINE_REPO = 'csukuangfj/sherpa-onnx-moonshine-base-en-int8';
const MOONSHINE_FILES: ModelFileSpec[] = [
  hfFile(MOONSHINE_REPO, 'preprocess.onnx', 14_077_290),
  hfFile(MOONSHINE_REPO, 'encode.int8.onnx', 50_311_494),
  hfFile(MOONSHINE_REPO, 'uncached_decode.int8.onnx', 122_120_451),
  hfFile(MOONSHINE_REPO, 'cached_decode.int8.onnx', 99_983_837),
  hfFile(MOONSHINE_REPO, 'tokens.txt', 436_688),
];

/** Offline Zipformer (icefall) — English, tiny footprint for low-end phones. */
const ZIPFORMER_EN_REPO = 'csukuangfj/sherpa-onnx-zipformer-small-en-2023-06-26';
const ZIPFORMER_EN_FILES: ModelFileSpec[] = [
  hfFile(ZIPFORMER_EN_REPO, 'encoder-epoch-99-avg-1.int8.onnx', 26_015_366),
  hfFile(ZIPFORMER_EN_REPO, 'decoder-epoch-99-avg-1.int8.onnx', 1_307_236),
  hfFile(ZIPFORMER_EN_REPO, 'joiner-epoch-99-avg-1.int8.onnx', 259_335),
  hfFile(ZIPFORMER_EN_REPO, 'tokens.txt', 5_048),
];

const SHERPA_ASR_MODELS: AsrModelSpec[] = [
  {
    id: 'sherpa-parakeet-tdt-0.6b-v3-int8',
    storage: 'sherpa-asr',
    task: 'asr',
    label: 'Parakeet TDT 0.6B v3',
    shortLabel: 'Parakeet v3',
    qualityTag: '25 idiomas europeos · muy preciso y sin alucinar',
    sourceNote:
      'Conversión oficial a sherpa-onnx del transductor de NVIDIA. Decodifica en C++, no en JavaScript, así que va muy por delante de Whisper a igualdad de tamaño.',
    hfRepoId: PARAKEET_REPO,
    hfRepoUrl: repoUrl(PARAKEET_REPO),
    license: LICENSE.apache2,
    languageIds: PARAKEET_V3_LANGUAGE_IDS,
    // A transducer emits text without ever naming the language, so Universal
    // mode cannot know what to translate into.
    languageDetection: 'none',
    diskBytes: diskTotal(PARAKEET_FILES),
    // Community: ~1.2 GB resident on load; peak with decode ~1.8 GB.
    peakRamBytes: 1.8 * GB,
    minRecommendedRamBytes: RAM_TIER.flagship,
    ramTier: 3,
    files: PARAKEET_FILES,
    runtime: {
      engine: 'sherpa',
      kind: 'offline-asr',
      modelType: 'nemo_transducer',
      preferInt8: true,
    },
  },
  {
    id: 'sherpa-whisper-turbo-int8',
    storage: 'sherpa-asr',
    task: 'asr',
    label: 'Whisper Turbo (sherpa)',
    shortLabel: 'Turbo nativo',
    qualityTag: 'Whisper Turbo decodificado en nativo · solo gama alta',
    sourceNote:
      'Mismo modelo que Whisper Large v3 Turbo pero ejecutado por sherpa-onnx: el bucle de decodificación vive en C++ en vez de cruzar el puente de JavaScript en cada token.',
    hfRepoId: SHERPA_WHISPER_TURBO_REPO,
    hfRepoUrl: repoUrl(SHERPA_WHISPER_TURBO_REPO),
    license: LICENSE.mit,
    languageIds: ALL_LANGUAGE_IDS,
    languageDetection: 'auto',
    diskBytes: diskTotal(SHERPA_WHISPER_TURBO_FILES),
    peakRamBytes: 3.5 * GB,
    minRecommendedRamBytes: RAM_TIER.flagship,
    ramTier: 4,
    files: SHERPA_WHISPER_TURBO_FILES,
    runtime: {
      engine: 'sherpa',
      kind: 'offline-asr',
      modelType: 'whisper',
      preferInt8: true,
    },
  },
  {
    id: 'sherpa-sense-voice-multi-int8',
    storage: 'sherpa-asr',
    task: 'asr',
    label: 'SenseVoice Small',
    shortLabel: 'SenseVoice',
    qualityTag: 'Chino, inglés, japonés, coreano y cantonés · muy rápido',
    sourceNote:
      'Conversión oficial a sherpa-onnx del modelo de FunAudioLLM. Un único grafo CTC de 228 MB: la opción más ligera con calidad alta en estos cinco idiomas.',
    hfRepoId: SENSE_VOICE_REPO,
    hfRepoUrl: repoUrl(SENSE_VOICE_REPO),
    license: LICENSE.apache2,
    languageIds: SENSE_VOICE_LANGUAGE_IDS,
    languageDetection: 'auto',
    diskBytes: diskTotal(SENSE_VOICE_FILES),
    peakRamBytes: 550 * MB,
    minRecommendedRamBytes: RAM_TIER.mid,
    ramTier: 2,
    files: SENSE_VOICE_FILES,
    runtime: {
      engine: 'sherpa',
      kind: 'offline-asr',
      modelType: 'sense_voice',
      preferInt8: true,
    },
  },
  {
    id: 'sherpa-moonshine-base-en-int8',
    storage: 'sherpa-asr',
    task: 'asr',
    label: 'Moonshine Base (inglés)',
    shortLabel: 'Moonshine',
    qualityTag: 'Solo inglés · pensado para gama baja',
    sourceNote:
      'Conversión oficial a sherpa-onnx del modelo de Useful Sensors. Procesa audio de longitud variable en vez de rellenar hasta 30 segundos como Whisper, así que las frases cortas salen mucho antes.',
    hfRepoId: MOONSHINE_REPO,
    hfRepoUrl: repoUrl(MOONSHINE_REPO),
    license: LICENSE.mit,
    languageIds: ENGLISH_ONLY,
    languageDetection: 'fixed-single',
    diskBytes: diskTotal(MOONSHINE_FILES),
    peakRamBytes: 900 * MB,
    minRecommendedRamBytes: RAM_TIER.mid,
    ramTier: 2,
    files: MOONSHINE_FILES,
    runtime: {
      engine: 'sherpa',
      kind: 'offline-asr',
      modelType: 'moonshine',
      preferInt8: true,
      language: 'en',
    },
  },
  {
    id: 'sherpa-zipformer-small-en-int8',
    storage: 'sherpa-asr',
    task: 'asr',
    label: 'Zipformer Small (inglés)',
    shortLabel: 'Zipformer',
    qualityTag: 'Solo inglés · el más ligero del catálogo',
    sourceNote:
      'Conversión oficial a sherpa-onnx del Zipformer offline de icefall (2023-06-26). ~28 MB int8: la opción de gama baja cuando solo hace falta inglés y hay que caber en poca RAM.',
    hfRepoId: ZIPFORMER_EN_REPO,
    hfRepoUrl: repoUrl(ZIPFORMER_EN_REPO),
    license: LICENSE.apache2,
    languageIds: ENGLISH_ONLY,
    languageDetection: 'fixed-single',
    diskBytes: diskTotal(ZIPFORMER_EN_FILES),
    peakRamBytes: 200 * MB,
    minRecommendedRamBytes: RAM_TIER.entry,
    ramTier: 1,
    files: ZIPFORMER_EN_FILES,
    runtime: {
      engine: 'sherpa',
      kind: 'offline-asr',
      modelType: 'transducer',
      preferInt8: true,
      language: 'en',
    },
  },
];

// ---------------------------------------------------------------------------
// MT — ONNX Runtime (NLLB, decoded by our own loop)
// ---------------------------------------------------------------------------

const NLLB_REPO = 'Xenova/nllb-200-distilled-600M';
const NLLB_FILES: ModelFileSpec[] = [
  hfFile(NLLB_REPO, 'onnx/encoder_model_quantized.onnx', 419_120_483),
  hfFile(NLLB_REPO, 'onnx/decoder_model_merged_quantized.onnx', 475_505_771),
  hfFile(NLLB_REPO, 'config.json', 873),
  hfFile(NLLB_REPO, 'generation_config.json', 189),
  hfFile(NLLB_REPO, 'tokenizer_config.json', 544),
  hfFile(NLLB_REPO, 'tokenizer.json', 17_331_224),
  hfFile(NLLB_REPO, 'special_tokens_map.json', 3_548),
];

const ORT_MT_MODELS: MtModelSpec[] = [
  {
    id: 'nllb-600m-q8',
    storage: 'nllb',
    task: 'mt',
    label: 'NLLB 200 · 600M Q8',
    shortLabel: 'NLLB 600M',
    qualityTag: '97 idiomas · el más compatible',
    sourceNote:
      'Exportación INT8 de Xenova. Cubre todos los idiomas de la app; es la opción segura cuando el par no está en los modelos más nuevos.',
    hfRepoId: NLLB_REPO,
    hfRepoUrl: repoUrl(NLLB_REPO),
    // Non-commercial. Fine for a free app, but it is why NLLB cannot be the
    // only translator in a catalog aimed at reuse.
    license: LICENSE.ccByNc4,
    languageIds: ALL_LANGUAGE_IDS,
    diskBytes: diskTotal(NLLB_FILES),
    peakRamBytes: 1.3 * GB,
    minRecommendedRamBytes: RAM_TIER.mid,
    ramTier: 2,
    files: NLLB_FILES,
    runtime: {
      engine: 'ort',
      kind: 'nllb',
      encoderFile: 'encoder_model_quantized.onnx',
      decoderFile: 'decoder_model_merged_quantized.onnx',
      configFile: 'config.json',
      generationConfigFile: 'generation_config.json',
      tokenizerFile: 'tokenizer.json',
      tokenizerConfigFile: 'tokenizer_config.json',
    },
  },
];

// ---------------------------------------------------------------------------
// MT — llama.cpp (GGUF)
// ---------------------------------------------------------------------------

const SALAMANDRA_REPO = 'BSC-LT/salamandraTA-2B-instruct-GGUF';
const SALAMANDRA_FILES: ModelFileSpec[] = [hfFile(SALAMANDRA_REPO, 'salamandrata_2b_inst_q4.gguf', 1_517_617_504)];

const MADLAD_REPO = 'mtsdurica/madlad400-3b-mt-Q4_K_M-GGUF';
const MADLAD_FILES: ModelFileSpec[] = [hfFile(MADLAD_REPO, 'madlad400-3b-mt-q4_k_m.gguf', 1_858_124_864)];

const LLAMA_MT_MODELS: MtModelSpec[] = [
  {
    id: 'salamandrata-2b-instruct-q4',
    storage: 'llama-mt',
    task: 'mt',
    label: 'SalamandraTA 2B',
    shortLabel: 'Salamandra',
    qualityTag: '33 idiomas europeos · la mejor calidad en gama alta',
    sourceNote:
      'GGUF Q4 publicado por el propio Barcelona Supercomputing Center. Modelo europeo, Apache 2.0 y especializado en traducción, incluidos catalán, gallego, euskera y occitano, que los modelos generalistas tratan mal.',
    hfRepoId: SALAMANDRA_REPO,
    hfRepoUrl: repoUrl(SALAMANDRA_REPO),
    license: LICENSE.apache2,
    languageIds: SALAMANDRA_LANGUAGE_IDS,
    diskBytes: diskTotal(SALAMANDRA_FILES),
    peakRamBytes: 2.4 * GB,
    minRecommendedRamBytes: RAM_TIER.flagship,
    ramTier: 4,
    files: SALAMANDRA_FILES,
    runtime: {
      engine: 'llama',
      kind: 'gguf-mt',
      ggufFile: 'salamandrata_2b_inst_q4.gguf',
      promptStyle: 'salamandra-instruct',
      contextSize: 1024,
      maxTokens: 256,
    },
  },
  {
    id: 'madlad400-3b-mt-q4',
    storage: 'llama-mt',
    task: 'mt',
    label: 'MADLAD-400 3B',
    shortLabel: 'MADLAD',
    qualityTag: 'Más de 400 idiomas · el más lento',
    sourceNote:
      'GGUF Q4_K_M del modelo de Google. Es encoder-decoder (T5); llama.cpp lo soporta llamando a llama_encode antes de generar. Elígelo por cobertura de idiomas poco frecuentes, no por velocidad.',
    hfRepoId: MADLAD_REPO,
    hfRepoUrl: repoUrl(MADLAD_REPO),
    license: LICENSE.apache2,
    languageIds: ALL_LANGUAGE_IDS,
    diskBytes: diskTotal(MADLAD_FILES),
    peakRamBytes: 2.8 * GB,
    minRecommendedRamBytes: RAM_TIER.flagship,
    ramTier: 4,
    files: MADLAD_FILES,
    runtime: {
      engine: 'llama',
      kind: 'gguf-mt',
      ggufFile: 'madlad400-3b-mt-q4_k_m.gguf',
      promptStyle: 'madlad-tag',
      contextSize: 1024,
      maxTokens: 256,
    },
  },
];

// ---------------------------------------------------------------------------
// VAD — Silero v5
// ---------------------------------------------------------------------------

const SILERO_REPO = 'onnx-community/silero-vad';
const SILERO_FILES: ModelFileSpec[] = [hfFile(SILERO_REPO, 'onnx/model.onnx', 2_243_022)];

const VAD_MODELS: VadModelSpec[] = [
  {
    id: 'silero-vad-v5',
    storage: 'vad',
    task: 'vad',
    label: 'Silero VAD v5',
    shortLabel: 'VAD',
    qualityTag: '2 MB · evita que el transcriptor invente frases',
    sourceNote:
      'Detector de voz real, no un umbral de volumen. Un ventilador o una puerta superan cualquier umbral de energía y Whisper responde inventando texto; Silero distingue voz de ruido y esos fragmentos no llegan a ejecutarse.',
    hfRepoId: SILERO_REPO,
    hfRepoUrl: repoUrl(SILERO_REPO),
    license: LICENSE.mit,
    languageIds: ALL_LANGUAGE_IDS,
    diskBytes: diskTotal(SILERO_FILES),
    peakRamBytes: 32 * MB,
    minRecommendedRamBytes: RAM_TIER.entry,
    ramTier: 1,
    files: SILERO_FILES,
    runtime: {
      engine: 'ort',
      kind: 'silero-vad',
      modelFile: 'model.onnx',
      // Silero v5 is trained on fixed 512-sample windows at 16 kHz (32 ms).
      frameSamples: 512,
    },
  },
];

// ---------------------------------------------------------------------------

export const ASR_MODELS: AsrModelSpec[] = [...ORT_ASR_MODELS, ...SHERPA_ASR_MODELS];

export const MT_MODELS: MtModelSpec[] = [...ORT_MT_MODELS, ...LLAMA_MT_MODELS];

export { VAD_MODELS };

/** The only VAD in the catalog; referenced directly by the segmenter. */
export const SILERO_VAD_MODEL_ID = 'silero-vad-v5';
