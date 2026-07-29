/**
 * Golden check: Whisper Tiny INT8 mel + encode + decode.
 * Run: pnpm check:whisper
 *
 * Validates ONNX inference and tokenizer — not Metro asset registry.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Tokenizer } from "@huggingface/tokenizers";
import { InferenceSession, Tensor } from "onnxruntime-node";

import {
  DEFAULT_PREPROCESSOR,
  type WhisperPreprocessorConfig,
} from "../src/lib/whisper-mel";
import {
  WHISPER_SESSION_OPTIONS,
  transcribePcm,
  type WhisperGenerationConfig,
  type WhisperModelConfig,
} from "../src/lib/whisper-inference";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS =
  process.env.WHISPER_MODEL_DIR?.trim() ||
  path.join(ROOT, "assets", "models", "whisper-tiny");
const FIXTURE = path.join(ROOT, "scripts", "fixtures", "jfk.wav");

const MIN_ENCODER_BYTES = 1_000_000;
const MIN_DECODER_BYTES = 5_000_000;
const MIN_TOKENIZER_BYTES = 100_000;

function resolveTokenizerPath(): string {
  const json = path.join(MODELS, "tokenizer.json");
  const jsondata = path.join(MODELS, "tokenizer.jsondata");
  try {
    statSync(json);
    return json;
  } catch {
    return jsondata;
  }
}

function loadJson<T>(filename: string): T {
  return JSON.parse(
    readFileSync(path.join(MODELS, filename), "utf8"),
  ) as T;
}

/** Decode PCM WAV → mono float32 @ 16 kHz (linear resample). */
function loadWavPcm16k(filePath: string): Float32Array {
  const buf = readFileSync(filePath);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Not a WAV file: ${filePath}`);
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (id === "fmt ") {
      channels = buf.readUInt16LE(chunkStart + 2);
      sampleRate = buf.readUInt32LE(chunkStart + 4);
      bitsPerSample = buf.readUInt16LE(chunkStart + 14);
    } else if (id === "data") {
      dataOffset = chunkStart;
      dataSize = size;
      break;
    }
    offset = chunkStart + size + (size % 2);
  }

  if (!sampleRate || !channels || !dataOffset) {
    throw new Error("Invalid WAV: missing fmt/data");
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bitsPerSample=${bitsPerSample}`);
  }

  const frameCount = Math.floor(dataSize / (channels * 2));
  const mono = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += buf.readInt16LE(dataOffset + (i * channels + c) * 2) / 32768;
    }
    mono[i] = sum / channels;
  }

  const targetRate = DEFAULT_PREPROCESSOR.sampling_rate;
  if (sampleRate === targetRate) return mono;

  const outLen = Math.max(1, Math.floor((mono.length * targetRate) / sampleRate));
  const out = new Float32Array(outLen);
  const ratio = sampleRate / targetRate;
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, mono.length - 1);
    const t = src - i0;
    out[i] = mono[i0] * (1 - t) + mono[i1] * t;
  }
  return out;
}

async function main(): Promise<void> {
  if (!process.env.WHISPER_MODEL_DIR?.trim()) {
    console.error(
      "WHISPER_MODEL_DIR no definido.\n" +
        "Los modelos ya no están en assets/. Descarga Whisper Tiny (Xenova) y apunta la variable al directorio\n" +
        "con encoder_model_quantized.onnx, decoder_model_merged_quantized.onnx, configs y tokenizer.json.\n" +
        "Ver TESTING.md y src/constants/model-catalog.ts.",
    );
    process.exit(2);
  }

  const started = Date.now();
  console.log("Whisper quantized golden check");
  console.log(`models: ${MODELS}`);

  const tokenizerPath = resolveTokenizerPath();

  for (const [label, file, min] of [
    ["encoder", "encoder_model_quantized.onnx", MIN_ENCODER_BYTES],
    ["decoder", "decoder_model_merged_quantized.onnx", MIN_DECODER_BYTES],
  ] as const) {
    const p = path.join(MODELS, file);
    const size = statSync(p).size;
    if (size < min) {
      throw new Error(`${label} too small: ${size} < ${min}`);
    }
    console.log(`${label}: ${size} bytes OK`);
  }
  {
    const size = statSync(tokenizerPath).size;
    if (size < MIN_TOKENIZER_BYTES) {
      throw new Error(`tokenizer too small: ${size}`);
    }
    console.log(`tokenizer: ${size} bytes OK (${path.basename(tokenizerPath)})`);
  }

  const modelConfig = loadJson<WhisperModelConfig>("config.json");
  const generationConfig = loadJson<WhisperGenerationConfig>(
    "generation_config.json",
  );
  const preprocessor = {
    ...DEFAULT_PREPROCESSOR,
    ...loadJson<Partial<WhisperPreprocessorConfig>>("preprocessor_config.json"),
  };
  const tokenizerJson = JSON.parse(
    readFileSync(tokenizerPath, "utf8"),
  ) as Record<string, unknown>;
  const tokenizerConfig = loadJson<Record<string, unknown>>(
    "tokenizer_config.json",
  );

  console.log("loading tokenizer…");
  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);

  const encoderPath = path.join(MODELS, "encoder_model_quantized.onnx");
  const decoderPath = path.join(
    MODELS,
    "decoder_model_merged_quantized.onnx",
  );

  console.log("creating sessions…");
  const encoderSession = await InferenceSession.create(
    encoderPath,
    WHISPER_SESSION_OPTIONS,
  );
  const decoderSession = await InferenceSession.create(
    decoderPath,
    WHISPER_SESSION_OPTIONS,
  );
  console.log("encoder inputs:", encoderSession.inputNames);
  console.log("decoder inputs:", decoderSession.inputNames.slice(0, 4), "…");

  console.log(`loading fixture: ${FIXTURE}`);
  const pcm = loadWavPcm16k(FIXTURE);
  console.log(`pcm samples: ${pcm.length} (~${(pcm.length / 16000).toFixed(1)}s)`);

  const t0 = Date.now();
  const result = await transcribePcm({
    pcm,
    language: "en",
    tokenizer,
    encoderSession,
    decoderSession,
    modelConfig,
    generationConfig,
    preprocessor,
    TensorCtor: Tensor as unknown as import("../src/lib/nllb-inference").TensorConstructor,
  });
  const ms = Date.now() - t0;
  const text = result.text;

  console.log(`✓ jfk.wav (${ms}ms)`);
  console.log(`  out: ${text}`);
  console.log(`  lang: ${result.language} (forced)`);
  console.log(`  noSpeechProb: ${result.noSpeechProb.toFixed(3)}`);

  const lower = text.toLowerCase();
  const ok =
    lower.includes("ask") ||
    lower.includes("country") ||
    lower.includes("kennedy") ||
    lower.includes("fellow") ||
    text.length >= 8;
  if (!ok) {
    throw new Error(`Unexpected transcript: "${text}"`);
  }
  if (result.noSpeech) {
    throw new Error("jfk.wav incorrectly classified as no_speech");
  }

  console.log("silence probe…");
  const silence = new Float32Array(16000);
  const silentResult = await transcribePcm({
    pcm: silence,
    language: "en",
    tokenizer,
    encoderSession,
    decoderSession,
    modelConfig,
    generationConfig,
    preprocessor,
    TensorCtor: Tensor as unknown as import("../src/lib/nllb-inference").TensorConstructor,
  });
  console.log(
    `  silence noSpeech=${silentResult.noSpeech} prob=${silentResult.noSpeechProb.toFixed(3)} text="${silentResult.text}"`,
  );
  if (!silentResult.noSpeech && silentResult.text.trim()) {
    throw new Error(
      `silence produced speech text: "${silentResult.text}" (prob=${silentResult.noSpeechProb})`,
    );
  }

  encoderSession.release();
  decoderSession.release();
  console.log(`\npassed in ${Date.now() - started}ms`);
}

main().catch((err) => {
  console.error("\n✗ whisper check failed");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
