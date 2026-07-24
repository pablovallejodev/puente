import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { Tokenizer } from "@huggingface/tokenizers";
import { InferenceSession, Tensor } from "onnxruntime-react-native";

import { speechLocaleToWhisperLang } from "@/constants/whisper-languages";
import {
  DEFAULT_PREPROCESSOR,
  type WhisperPreprocessorConfig,
} from "@/lib/whisper-mel";
import {
  WHISPER_SESSION_OPTIONS,
  transcribePcm,
  type WhisperGenerationConfig,
  type WhisperModelConfig,
} from "@/lib/whisper-inference";
import {
  isWhisperError,
  WhisperError,
  wrapWhisperError,
} from "@/lib/whisper-errors";
import type { TensorConstructor } from "@/lib/nllb-inference";

const MODEL_CONFIG = require("@/assets/models/whisper-tiny/config.json") as WhisperModelConfig;
const GENERATION_CONFIG =
  require("@/assets/models/whisper-tiny/generation_config.json") as WhisperGenerationConfig;
const PREPROCESSOR_CONFIG = {
  ...DEFAULT_PREPROCESSOR,
  ...(require("@/assets/models/whisper-tiny/preprocessor_config.json") as Partial<WhisperPreprocessorConfig>),
};
const TOKENIZER_CONFIG =
  require("@/assets/models/whisper-tiny/tokenizer_config.json") as Record<
    string,
    unknown
  >;
const TOKENIZER_RAW_ASSET = require("@/assets/models/whisper-tiny/tokenizer.jsondata");
const ENCODER_ASSET = require("@/assets/models/whisper-tiny/encoder_model_quantized.onnx");
const DECODER_ASSET = require("@/assets/models/whisper-tiny/decoder_model_merged_quantized.onnx");

export const MODEL_VERSION = "whisper-tiny-int8-q";

const MODEL_DIR = `${FileSystem.documentDirectory ?? ""}whisper/${MODEL_VERSION}/`;
const ENCODER_PATH = `${MODEL_DIR}encoder_model_quantized.onnx`;
const DECODER_PATH = `${MODEL_DIR}decoder_model_merged_quantized.onnx`;

function toOrtPath(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

function assertRawAssetModule(moduleRef: unknown, label: string): number {
  if (typeof moduleRef !== "number") {
    throw new WhisperError({
      code: "ASSET_UNAVAILABLE",
      stage: "tokenizer.load",
      message: `Asset ${label} mal empaquetado (tipo ${typeof moduleRef}). Reinstala la APK.`,
      recoverable: false,
      context: { label, receivedType: typeof moduleRef },
    });
  }
  return moduleRef;
}

function isAssetRegistryError(message: string): boolean {
  return message.includes("missing from the asset registry");
}

async function loadTokenizerJson(): Promise<Record<string, unknown>> {
  const label = "tokenizer";
  try {
    const moduleId = assertRawAssetModule(TOKENIZER_RAW_ASSET, label);
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    if (!asset.localUri) {
      throw new WhisperError({
        code: "ASSET_UNAVAILABLE",
        stage: "tokenizer.load",
        message: `No se pudo resolver la ruta del asset ${label}`,
        recoverable: true,
        context: { label },
      });
    }
    const text = await FileSystem.readAsStringAsync(asset.localUri);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      throw new WhisperError({
        code: "TOKENIZER_LOAD_FAILED",
        stage: "tokenizer.load",
        message: `Tokenizer ${label} parseado vacío o inválido`,
        recoverable: true,
        context: { label },
      });
    }
    return parsed;
  } catch (err) {
    if (isWhisperError(err)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const registryMissing = isAssetRegistryError(message);
    throw new WhisperError({
      code: registryMissing ? "ASSET_UNAVAILABLE" : "TOKENIZER_LOAD_FAILED",
      stage: "tokenizer.load",
      message: registryMissing
        ? `Asset ${label} no está en el registro. Reinstala la APK.`
        : message,
      recoverable: !registryMissing,
      context: { label },
    });
  }
}

async function ensureDirectory(dirPath: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dirPath);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  }
}

async function copyAssetToPath(
  assetModule: unknown,
  destPath: string,
  label: string,
): Promise<string> {
  try {
    const moduleId = assertRawAssetModule(assetModule, label);
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    if (!asset.localUri) {
      throw new WhisperError({
        code: "ASSET_UNAVAILABLE",
        stage: "asset.prepare",
        message: `No se pudo resolver la ruta del asset ${label}`,
        recoverable: true,
        context: { label },
      });
    }

    const expectedSize =
      "filesize" in asset && typeof asset.filesize === "number"
        ? asset.filesize
        : undefined;
    const destInfo = await FileSystem.getInfoAsync(destPath);
    if (
      destInfo.exists &&
      expectedSize !== undefined &&
      destInfo.size === expectedSize
    ) {
      return destPath;
    }
    if (destInfo.exists && expectedSize === undefined) {
      await FileSystem.deleteAsync(destPath, { idempotent: true });
    }

    await ensureDirectory(MODEL_DIR);
    const tempPath = `${destPath}.tmp`;
    try {
      await FileSystem.copyAsync({ from: asset.localUri, to: tempPath });
      const tempInfo = await FileSystem.getInfoAsync(tempPath);
      if (
        expectedSize !== undefined &&
        tempInfo.exists &&
        tempInfo.size !== expectedSize
      ) {
        throw new WhisperError({
          code: "ASSET_INCOMPLETE",
          stage: "asset.prepare",
          message: `Copia incompleta de ${label}`,
          recoverable: true,
          context: {
            label,
            expectedBytes: expectedSize,
            actualBytes: tempInfo.size ?? 0,
          },
        });
      }
      if (destInfo.exists) {
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      }
      await FileSystem.moveAsync({ from: tempPath, to: destPath });
      return destPath;
    } catch (err) {
      await FileSystem.deleteAsync(tempPath, { idempotent: true });
      if (isWhisperError(err)) throw err;
      throw wrapWhisperError(err, "asset.prepare", "ASSET_COPY_FAILED", true, {
        label,
      });
    }
  } catch (err) {
    if (isWhisperError(err)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const registryMissing = isAssetRegistryError(message);
    throw new WhisperError({
      code: registryMissing ? "ASSET_UNAVAILABLE" : "ASSET_COPY_FAILED",
      stage: "asset.prepare",
      message: registryMissing
        ? `Asset ${label} no está en el registro. Reinstala la APK.`
        : message,
      recoverable: !registryMissing,
      context: { label },
    });
  }
}

async function prepareModelFiles(): Promise<{ encoder: string; decoder: string }> {
  if (!FileSystem.documentDirectory) {
    throw new WhisperError({
      code: "ASSET_UNAVAILABLE",
      stage: "asset.prepare",
      message: "Directorio de documentos no disponible en este dispositivo",
      recoverable: false,
    });
  }
  const [encoder, decoder] = await Promise.all([
    copyAssetToPath(ENCODER_ASSET, ENCODER_PATH, "encoder"),
    copyAssetToPath(DECODER_ASSET, DECODER_PATH, "decoder"),
  ]);
  return {
    encoder: toOrtPath(encoder),
    decoder: toOrtPath(decoder),
  };
}

function releaseSession(session: InferenceSession): void {
  try {
    if (typeof session.release === "function") {
      session.release();
    }
  } catch {
    /* best effort */
  }
}

export class WhisperEngine {
  private tokenizer: Tokenizer;
  private encoderSession: InferenceSession;
  private decoderSession: InferenceSession;
  private modelConfig: WhisperModelConfig;
  private generationConfig: WhisperGenerationConfig;
  private preprocessor: WhisperPreprocessorConfig;

  private constructor(
    tokenizer: Tokenizer,
    encoderSession: InferenceSession,
    decoderSession: InferenceSession,
    modelConfig: WhisperModelConfig,
    generationConfig: WhisperGenerationConfig,
    preprocessor: WhisperPreprocessorConfig,
  ) {
    this.tokenizer = tokenizer;
    this.encoderSession = encoderSession;
    this.decoderSession = decoderSession;
    this.modelConfig = modelConfig;
    this.generationConfig = generationConfig;
    this.preprocessor = preprocessor;
  }

  static async create(): Promise<WhisperEngine> {
    let modelPaths: { encoder: string; decoder: string };
    try {
      modelPaths = await prepareModelFiles();
    } catch (err) {
      if (isWhisperError(err)) throw err;
      throw wrapWhisperError(err, "asset.prepare", "ASSET_COPY_FAILED", true);
    }

    let tokenizerJson: Record<string, unknown>;
    try {
      tokenizerJson = await loadTokenizerJson();
    } catch (err) {
      if (isWhisperError(err)) throw err;
      throw wrapWhisperError(err, "tokenizer.load", "TOKENIZER_LOAD_FAILED", true);
    }

    let tokenizer: Tokenizer;
    try {
      tokenizer = new Tokenizer(tokenizerJson, TOKENIZER_CONFIG);
    } catch (err) {
      throw wrapWhisperError(err, "tokenizer.load", "TOKENIZER_LOAD_FAILED", true);
    }

    let encoderSession: InferenceSession;
    try {
      encoderSession = await InferenceSession.create(
        modelPaths.encoder,
        WHISPER_SESSION_OPTIONS,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("install") ||
        message.includes("OrtApi is not initialized")
      ) {
        throw new WhisperError({
          code: "ORT_NOT_REGISTERED",
          stage: "session.encoder",
          message:
            "onnxruntime-react-native no está registrado. Ejecuta pnpm install && npx expo prebuild --clean y reconstruye la app.",
          recoverable: false,
        });
      }
      throw wrapWhisperError(
        err,
        "session.encoder",
        "SESSION_ENCODER_FAILED",
        true,
      );
    }

    let decoderSession: InferenceSession;
    try {
      decoderSession = await InferenceSession.create(
        modelPaths.decoder,
        WHISPER_SESSION_OPTIONS,
      );
    } catch (err) {
      releaseSession(encoderSession);
      throw wrapWhisperError(
        err,
        "session.decoder",
        "SESSION_DECODER_FAILED",
        true,
      );
    }

    return new WhisperEngine(
      tokenizer,
      encoderSession,
      decoderSession,
      MODEL_CONFIG,
      GENERATION_CONFIG,
      PREPROCESSOR_CONFIG,
    );
  }

  /** Transcribe PCM float32 mono @ 16 kHz. `speechLocale` is BCP-47. */
  async transcribe(pcm: Float32Array, speechLocale: string): Promise<string> {
    const language = speechLocaleToWhisperLang(speechLocale);
    return transcribePcm({
      pcm,
      language,
      tokenizer: this.tokenizer,
      encoderSession: this.encoderSession as unknown as import("@/lib/nllb-inference").OrtSession,
      decoderSession: this.decoderSession as unknown as import("@/lib/nllb-inference").OrtSession,
      modelConfig: this.modelConfig,
      generationConfig: this.generationConfig,
      preprocessor: this.preprocessor,
      TensorCtor: Tensor as unknown as TensorConstructor,
    });
  }

  dispose(): void {
    releaseSession(this.encoderSession);
    releaseSession(this.decoderSession);
  }
}

let enginePromise: Promise<WhisperEngine> | null = null;
let engineLoadAttempts = 0;
let cachedEngine: WhisperEngine | null = null;

export const MAX_WHISPER_LOAD_ATTEMPTS = 2;

export function resetWhisperEngine(): void {
  if (cachedEngine) {
    cachedEngine.dispose();
    cachedEngine = null;
  }
  enginePromise = null;
}

export async function loadWhisperEngine(
  forceRetry = false,
): Promise<WhisperEngine> {
  if (forceRetry) {
    resetWhisperEngine();
    engineLoadAttempts = 0;
  }

  if (!enginePromise) {
    if (engineLoadAttempts >= MAX_WHISPER_LOAD_ATTEMPTS) {
      throw new WhisperError({
        code: "ENGINE_LOAD_FAILED",
        stage: "session.encoder",
        message: "Se agotaron los reintentos de carga de Whisper",
        recoverable: false,
        context: { attempts: engineLoadAttempts },
      });
    }

    engineLoadAttempts += 1;
    enginePromise = WhisperEngine.create()
      .then((engine) => {
        cachedEngine = engine;
        return engine;
      })
      .catch((err) => {
        enginePromise = null;
        cachedEngine = null;
        if (isWhisperError(err)) throw err;
        throw wrapWhisperError(
          err,
          "session.encoder",
          "ENGINE_LOAD_FAILED",
          true,
          { attempt: engineLoadAttempts },
        );
      });
  }

  return enginePromise;
}
