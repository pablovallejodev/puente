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
  type WhisperTranscribeResult,
} from "@/lib/whisper-inference";
import {
  isWhisperError,
  WhisperError,
  wrapWhisperError,
} from "@/lib/whisper-errors";
import { assertModelInstalled } from "@/lib/model-install-state";
import { readModelPreferences } from "@/lib/model-preferences";
import {
  getModelFilePath,
  toOrtPath,
} from "@/lib/model-paths";
import { isModelError, ModelError } from "@/lib/model-errors";
import type { TensorConstructor } from "@/lib/nllb-inference";

async function readJsonFile<T>(path: string, label: string): Promise<T> {
  try {
    const text = await FileSystem.readAsStringAsync(path);
    return JSON.parse(text) as T;
  } catch (err) {
    throw wrapWhisperError(err, "tokenizer.load", "TOKENIZER_LOAD_FAILED", true, {
      label,
      path,
    });
  }
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
  readonly modelId: string;
  private tokenizer: Tokenizer;
  private encoderSession: InferenceSession;
  private decoderSession: InferenceSession;
  private modelConfig: WhisperModelConfig;
  private generationConfig: WhisperGenerationConfig;
  private preprocessor: WhisperPreprocessorConfig;

  private constructor(
    modelId: string,
    tokenizer: Tokenizer,
    encoderSession: InferenceSession,
    decoderSession: InferenceSession,
    modelConfig: WhisperModelConfig,
    generationConfig: WhisperGenerationConfig,
    preprocessor: WhisperPreprocessorConfig,
  ) {
    this.modelId = modelId;
    this.tokenizer = tokenizer;
    this.encoderSession = encoderSession;
    this.decoderSession = decoderSession;
    this.modelConfig = modelConfig;
    this.generationConfig = generationConfig;
    this.preprocessor = preprocessor;
  }

  static async create(modelId: string): Promise<WhisperEngine> {
    let spec;
    try {
      spec = await assertModelInstalled(modelId);
    } catch (err) {
      if (isModelError(err)) {
        throw new WhisperError({
          code: "ENGINE_LOAD_FAILED",
          stage: "asset.prepare",
          message: err.toDisplayString(),
          recoverable: err.recoverable,
          context: { modelId, modelCode: err.code },
        });
      }
      throw err;
    }

    const dirFamily = spec.family;
    const encoderPath = getModelFilePath(
      dirFamily,
      modelId,
      "encoder_model_quantized.onnx",
    );
    const decoderPath = getModelFilePath(
      dirFamily,
      modelId,
      "decoder_model_merged_quantized.onnx",
    );
    const configPath = getModelFilePath(dirFamily, modelId, "config.json");
    const generationPath = getModelFilePath(
      dirFamily,
      modelId,
      "generation_config.json",
    );
    const preprocessorPath = getModelFilePath(
      dirFamily,
      modelId,
      "preprocessor_config.json",
    );
    const tokenizerConfigPath = getModelFilePath(
      dirFamily,
      modelId,
      "tokenizer_config.json",
    );
    const tokenizerPath = getModelFilePath(dirFamily, modelId, "tokenizer.json");

    for (const [label, path] of [
      ["encoder", encoderPath],
      ["decoder", decoderPath],
    ] as const) {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) {
        throw new ModelError({
          code: "MODEL_ENGINE_PATH_MISSING",
          stage: "engine.load",
          message: `No existe el fichero ${label} del modelo ${modelId}`,
          recoverable: true,
          context: { modelId, path, label },
        });
      }
    }

    const modelConfig = await readJsonFile<WhisperModelConfig>(
      configPath,
      "config",
    );
    const generationConfig = await readJsonFile<WhisperGenerationConfig>(
      generationPath,
      "generation_config",
    );
    const preprocessorPartial = await readJsonFile<
      Partial<WhisperPreprocessorConfig>
    >(preprocessorPath, "preprocessor_config");
    const preprocessor: WhisperPreprocessorConfig = {
      ...DEFAULT_PREPROCESSOR,
      ...preprocessorPartial,
    };
    const tokenizerConfig = await readJsonFile<Record<string, unknown>>(
      tokenizerConfigPath,
      "tokenizer_config",
    );
    const tokenizerJson = await readJsonFile<Record<string, unknown>>(
      tokenizerPath,
      "tokenizer",
    );

    let tokenizer: Tokenizer;
    try {
      tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
    } catch (err) {
      throw wrapWhisperError(err, "tokenizer.load", "TOKENIZER_LOAD_FAILED", true);
    }

    let encoderSession: InferenceSession;
    try {
      encoderSession = await InferenceSession.create(
        toOrtPath(encoderPath),
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
        toOrtPath(decoderPath),
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
      modelId,
      tokenizer,
      encoderSession,
      decoderSession,
      modelConfig,
      generationConfig,
      preprocessor,
    );
  }

  /**
   * Transcribe PCM float32 mono @ 16 kHz.
   * `languageOrLocale`: `"auto"` (Universal) or BCP-47 locale (forced).
   */
  async transcribe(
    pcm: Float32Array,
    languageOrLocale: "auto" | string,
    options?: {
      stickyLanguage?: string | null;
      shouldCancel?: () => boolean;
    },
  ): Promise<WhisperTranscribeResult> {
    const language =
      languageOrLocale === "auto"
        ? "auto"
        : speechLocaleToWhisperLang(languageOrLocale);
    return transcribePcm({
      pcm,
      language,
      stickyLanguage: options?.stickyLanguage ?? null,
      shouldCancel: options?.shouldCancel,
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
let cachedModelId: string | null = null;
let loadingModelId: string | null = null;

export const MAX_WHISPER_LOAD_ATTEMPTS = 2;

export function resetWhisperEngine(): void {
  if (cachedEngine) {
    cachedEngine.dispose();
    cachedEngine = null;
  }
  enginePromise = null;
  cachedModelId = null;
  loadingModelId = null;
}

export async function loadWhisperEngine(
  forceRetry = false,
  modelId?: string,
): Promise<WhisperEngine> {
  let resolvedId = modelId;
  if (!resolvedId) {
    const prefs = await readModelPreferences();
    resolvedId = prefs.selectedWhisperModelId ?? undefined;
  }
  if (!resolvedId) {
    throw new WhisperError({
      code: "ENGINE_LOAD_FAILED",
      stage: "asset.prepare",
      message:
        "[MODEL_NOT_INSTALLED@engine.load] No hay un modelo Whisper seleccionado",
      recoverable: true,
      context: { modelCode: "MODEL_NOT_INSTALLED" },
    });
  }

  if (cachedEngine && cachedModelId === resolvedId && !forceRetry) {
    return cachedEngine;
  }

  const switching =
    (cachedModelId != null && cachedModelId !== resolvedId) ||
    (loadingModelId != null && loadingModelId !== resolvedId);

  if (forceRetry || switching) {
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
        context: { attempts: engineLoadAttempts, modelId: resolvedId },
      });
    }

    engineLoadAttempts += 1;
    const id = resolvedId;
    loadingModelId = id;
    enginePromise = WhisperEngine.create(id)
      .then((engine) => {
        cachedEngine = engine;
        cachedModelId = id;
        loadingModelId = null;
        return engine;
      })
      .catch((err) => {
        enginePromise = null;
        cachedEngine = null;
        cachedModelId = null;
        loadingModelId = null;
        if (isWhisperError(err)) throw err;
        if (isModelError(err)) {
          throw new WhisperError({
            code: "ENGINE_LOAD_FAILED",
            stage: "asset.prepare",
            message: err.toDisplayString(),
            recoverable: err.recoverable,
            context: { modelId: id, modelCode: err.code },
          });
        }
        throw wrapWhisperError(
          err,
          "session.encoder",
          "ENGINE_LOAD_FAILED",
          true,
          { attempt: engineLoadAttempts, modelId: id },
        );
      });
  }

  return enginePromise;
}
