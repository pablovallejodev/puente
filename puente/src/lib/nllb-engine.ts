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
import { assertModelInstalled } from "@/lib/model-install-state";
import { readModelPreferences } from "@/lib/model-preferences";
import { getModelFilePath, toOrtPath } from "@/lib/model-paths";
import { isModelError, ModelError } from "@/lib/model-errors";

async function readJsonFile<T>(path: string, label: string): Promise<T> {
  try {
    const text = await FileSystem.readAsStringAsync(path);
    return JSON.parse(text) as T;
  } catch (err) {
    throw wrapUnknownError(err, "tokenizer.load", "TOKENIZER_LOAD_FAILED", true, {
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

export class NllbEngine {
  readonly modelId: string;
  private tokenizer: Tokenizer;
  private encoderSession: InferenceSession;
  private decoderSession: InferenceSession;
  private modelConfig: ModelConfig;
  private eosTokenId: number;

  private constructor(
    modelId: string,
    tokenizer: Tokenizer,
    encoderSession: InferenceSession,
    decoderSession: InferenceSession,
    modelConfig: ModelConfig,
    generationConfig: GenerationConfig,
  ) {
    this.modelId = modelId;
    this.tokenizer = tokenizer;
    this.encoderSession = encoderSession;
    this.decoderSession = decoderSession;
    this.modelConfig = modelConfig;
    this.eosTokenId =
      tokenizer.token_to_id("</s>") ?? generationConfig.eos_token_id;
  }

  static async create(modelId: string): Promise<NllbEngine> {
    let spec;
    try {
      spec = await assertModelInstalled(modelId);
    } catch (err) {
      if (isModelError(err)) {
        throw new TranslatorError({
          code: "ENGINE_LOAD_FAILED",
          stage: "asset.prepare",
          message: err.toDisplayString(),
          recoverable: err.recoverable,
          context: { modelId, modelCode: err.code },
        });
      }
      throw err;
    }

    const encoderPath = getModelFilePath(
      spec.family,
      modelId,
      "encoder_model_quantized.onnx",
    );
    const decoderPath = getModelFilePath(
      spec.family,
      modelId,
      "decoder_model_merged_quantized.onnx",
    );
    const configPath = getModelFilePath(spec.family, modelId, "config.json");
    const generationPath = getModelFilePath(
      spec.family,
      modelId,
      "generation_config.json",
    );
    const tokenizerConfigPath = getModelFilePath(
      spec.family,
      modelId,
      "tokenizer_config.json",
    );
    const tokenizerPath = getModelFilePath(
      spec.family,
      modelId,
      "tokenizer.json",
    );

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

    const modelConfig = await readJsonFile<ModelConfig>(configPath, "config");
    const generationConfig = await readJsonFile<GenerationConfig>(
      generationPath,
      "generation_config",
    );
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
      throw wrapUnknownError(err, "tokenizer.load", "TOKENIZER_LOAD_FAILED", true);
    }

    let encoderSession: InferenceSession;
    try {
      encoderSession = await InferenceSession.create(
        toOrtPath(encoderPath),
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
      throw wrapUnknownError(
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
        SESSION_OPTIONS,
      );
    } catch (err) {
      releaseSession(encoderSession);
      throw wrapUnknownError(
        err,
        "session.decoder",
        "SESSION_DECODER_FAILED",
        true,
      );
    }

    return new NllbEngine(
      modelId,
      tokenizer,
      encoderSession,
      decoderSession,
      modelConfig,
      generationConfig,
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
    releaseSession(this.encoderSession);
    releaseSession(this.decoderSession);
  }
}

let enginePromise: Promise<NllbEngine> | null = null;
let engineLoadAttempts = 0;
let cachedEngine: NllbEngine | null = null;
let cachedModelId: string | null = null;
let loadingModelId: string | null = null;

export const MAX_ENGINE_LOAD_ATTEMPTS = 2;

export function resetEngine(): void {
  if (cachedEngine) {
    cachedEngine.dispose();
    cachedEngine = null;
  }
  enginePromise = null;
  cachedModelId = null;
  loadingModelId = null;
}

export async function loadEngine(
  forceRetry = false,
  modelId?: string,
): Promise<NllbEngine> {
  let resolvedId = modelId;
  if (!resolvedId) {
    const prefs = await readModelPreferences();
    resolvedId = prefs.selectedNllbModelId ?? undefined;
  }
  if (!resolvedId) {
    throw new TranslatorError({
      code: "ENGINE_LOAD_FAILED",
      stage: "asset.prepare",
      message:
        "[MODEL_NOT_INSTALLED@engine.load] No hay un modelo NLLB seleccionado",
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
        context: { attempts: engineLoadAttempts, modelId: resolvedId },
      });
    }

    engineLoadAttempts += 1;
    const id = resolvedId;
    loadingModelId = id;
    enginePromise = NllbEngine.create(id)
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
        if (isTranslatorError(err)) throw err;
        if (isModelError(err)) {
          throw new TranslatorError({
            code: "ENGINE_LOAD_FAILED",
            stage: "asset.prepare",
            message: err.toDisplayString(),
            recoverable: err.recoverable,
            context: { modelId: id, modelCode: err.code },
          });
        }
        throw wrapUnknownError(
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
