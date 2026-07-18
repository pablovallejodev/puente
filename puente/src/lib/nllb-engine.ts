import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { Tokenizer } from "@huggingface/tokenizers";
import { InferenceSession, Tensor } from "onnxruntime-react-native";

import {
  type GenerationConfig,
  type ModelConfig,
  SESSION_OPTIONS,
  translateText,
} from "@/lib/nllb-inference";
import {
  isTranslatorError,
  TranslatorError,
  wrapUnknownError,
} from "@/lib/translator-errors";

const MODEL_CONFIG = require("@/assets/models/config.json") as ModelConfig;
const GENERATION_CONFIG =
  require("@/assets/models/generation_config.json") as GenerationConfig;
const TOKENIZER_CONFIG =
  require("@/assets/models/tokenizer_config.json") as Record<string, unknown>;
const TOKENIZER_RAW_ASSET = require("@/assets/models/tokenizer.jsondata");
const ENCODER_ASSET = require("@/assets/models/encoder_model_quantized.onnx");
const DECODER_ASSET = require("@/assets/models/decoder_model_merged_quantized.onnx");

export const MODEL_VERSION = "nllb-200-distilled-600M-q8";

const MODEL_DIR = `${FileSystem.documentDirectory ?? ""}nllb/`;
const ENCODER_PATH = `${MODEL_DIR}encoder_model_quantized.onnx`;
const DECODER_PATH = `${MODEL_DIR}decoder_model_merged_quantized.onnx`;

function toOrtPath(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

function assertRawAssetModule(
  moduleRef: unknown,
  label: string,
): number {
  if (typeof moduleRef !== "number") {
    throw new TranslatorError({
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
      throw new TranslatorError({
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
      throw new TranslatorError({
        code: "TOKENIZER_LOAD_FAILED",
        stage: "tokenizer.load",
        message: `Tokenizer ${label} parseado vacío o inválido`,
        recoverable: true,
        context: { label },
      });
    }
    return parsed;
  } catch (err) {
    if (isTranslatorError(err)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const registryMissing = isAssetRegistryError(message);
    throw new TranslatorError({
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

async function ensureDirectory(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function copyAssetToPath(
  assetModule: unknown,
  destPath: string,
  label: string,
): Promise<string> {
  let moduleId: number;
  try {
    moduleId = assertRawAssetModule(assetModule, label);
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();

    if (!asset.localUri) {
      throw new TranslatorError({
        code: "ASSET_UNAVAILABLE",
        stage: "asset.prepare",
        message: `No se pudo resolver la ruta del asset ${label}`,
        recoverable: label === "tokenizer" ? false : true,
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
      return destPath;
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
        throw new TranslatorError({
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
      if (isTranslatorError(err)) throw err;
      throw wrapUnknownError(err, "asset.prepare", "ASSET_COPY_FAILED", true, {
        label,
      });
    }
  } catch (err) {
    if (isTranslatorError(err)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const registryMissing = isAssetRegistryError(message);
    throw new TranslatorError({
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
    throw new TranslatorError({
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

export class NllbEngine {
  private tokenizer: Tokenizer;
  private encoderSession: InferenceSession;
  private decoderSession: InferenceSession;
  private modelConfig: ModelConfig;
  private eosTokenId: number;

  private constructor(
    tokenizer: Tokenizer,
    encoderSession: InferenceSession,
    decoderSession: InferenceSession,
    modelConfig: ModelConfig,
    generationConfig: GenerationConfig,
  ) {
    this.tokenizer = tokenizer;
    this.encoderSession = encoderSession;
    this.decoderSession = decoderSession;
    this.modelConfig = modelConfig;
    this.eosTokenId =
      tokenizer.token_to_id("</s>") ?? generationConfig.eos_token_id;
  }

  static async create(): Promise<NllbEngine> {
    let modelPaths: { encoder: string; decoder: string };
    try {
      modelPaths = await prepareModelFiles();
    } catch (err) {
      if (isTranslatorError(err)) throw err;
      throw wrapUnknownError(err, "asset.prepare", "ASSET_COPY_FAILED", true);
    }

    let tokenizerJson: Record<string, unknown>;
    try {
      tokenizerJson = await loadTokenizerJson();
    } catch (err) {
      if (isTranslatorError(err)) throw err;
      throw wrapUnknownError(err, "tokenizer.load", "TOKENIZER_LOAD_FAILED", true);
    }

    let tokenizer: Tokenizer;
    try {
      tokenizer = new Tokenizer(tokenizerJson, TOKENIZER_CONFIG);
    } catch (err) {
      throw wrapUnknownError(err, "tokenizer.load", "TOKENIZER_LOAD_FAILED", true);
    }

    let encoderSession: InferenceSession;
    let decoderSession: InferenceSession;
    try {
      encoderSession = await InferenceSession.create(
        modelPaths.encoder,
        SESSION_OPTIONS,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("install") ||
        message.includes("OrtApi is not initialized")
      ) {
        throw new TranslatorError({
          code: "ORT_NOT_REGISTERED",
          stage: "session.encoder",
          message:
            "onnxruntime-react-native no está registrado. Ejecuta pnpm install && npx expo prebuild --clean y reconstruye la app.",
          recoverable: false,
        });
      }
      throw wrapUnknownError(err, "session.encoder", "SESSION_ENCODER_FAILED", true);
    }

    try {
      decoderSession = await InferenceSession.create(
        modelPaths.decoder,
        SESSION_OPTIONS,
      );
    } catch (err) {
      try {
        if ("dispose" in encoderSession) {
          (encoderSession as { dispose(): void }).dispose();
        }
      } catch {
        /* best effort */
      }
      throw wrapUnknownError(err, "session.decoder", "SESSION_DECODER_FAILED", true);
    }

    return new NllbEngine(
      tokenizer,
      encoderSession,
      decoderSession,
      MODEL_CONFIG,
      GENERATION_CONFIG,
    );
  }

  async translate(
    text: string,
    srcLang: string,
    tgtLang: string,
  ): Promise<string> {
    return translateText({
      text,
      srcLang,
      tgtLang,
      tokenizer: this.tokenizer,
      encoderSession: this.encoderSession as unknown as import("@/lib/nllb-inference").OrtSession,
      decoderSession: this.decoderSession as unknown as import("@/lib/nllb-inference").OrtSession,
      modelConfig: this.modelConfig,
      eosTokenId: this.eosTokenId,
      TensorCtor: Tensor as unknown as import("@/lib/nllb-inference").TensorConstructor,
    });
  }

  dispose(): void {
    try {
      if ("dispose" in this.encoderSession) {
        (this.encoderSession as { dispose(): void }).dispose();
      }
    } catch {
      /* best effort */
    }
    try {
      if ("dispose" in this.decoderSession) {
        (this.decoderSession as { dispose(): void }).dispose();
      }
    } catch {
      /* best effort */
    }
  }
}

let enginePromise: Promise<NllbEngine> | null = null;
let engineLoadAttempts = 0;

export const MAX_ENGINE_LOAD_ATTEMPTS = 2;

export function resetEngine(): void {
  enginePromise = null;
}

export async function loadEngine(forceRetry = false): Promise<NllbEngine> {
  if (forceRetry) {
    resetEngine();
    engineLoadAttempts = 0;
  }

  if (!enginePromise) {
    if (engineLoadAttempts >= MAX_ENGINE_LOAD_ATTEMPTS) {
      throw new TranslatorError({
        code: "ENGINE_LOAD_FAILED",
        stage: "session.encoder",
        message: "Se agotaron los reintentos de carga del modelo",
        recoverable: false,
        context: { attempts: engineLoadAttempts },
      });
    }

    engineLoadAttempts += 1;
    enginePromise = NllbEngine.create().catch((err) => {
      enginePromise = null;
      if (isTranslatorError(err)) throw err;
      throw wrapUnknownError(err, "session.encoder", "ENGINE_LOAD_FAILED", true, {
        attempt: engineLoadAttempts,
      });
    });
  }

  return enginePromise;
}
