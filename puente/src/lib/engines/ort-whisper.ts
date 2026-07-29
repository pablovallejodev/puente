/**
 * Whisper on ONNX Runtime, decoded by our own loop (lib/whisper-inference).
 *
 * The slowest of the ASR adapters — every generated token crosses the
 * JavaScript bridge — but the only one that needs no native module beyond
 * onnxruntime-react-native, so it is the baseline that always works.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Tokenizer } from "@huggingface/tokenizers";
import { InferenceSession, Tensor } from "onnxruntime-react-native";

import type { AsrModelSpec, OrtWhisperRuntime } from "@/constants/model-catalog";
import {
  createOrtSession,
  isOrtNotRegistered,
  releaseOrtSession,
} from "@/lib/ort/session";
import { getModelFilePath, toNativePath } from "@/lib/model-paths";
import { ModelError } from "@/lib/model-errors";
import {
  transcribePcm,
  type WhisperGenerationConfig,
  type WhisperModelConfig,
} from "@/lib/whisper-inference";
import { WhisperError, wrapWhisperError } from "@/lib/whisper-errors";
import {
  DEFAULT_PREPROCESSOR,
  type WhisperPreprocessorConfig,
} from "@/lib/whisper-mel";
import { causeMessage } from "@/lib/errors/diagnostic";
import type { OrtSession, TensorConstructor } from "@/lib/nllb-inference";
import type { AsrEngine, AsrRequest, AsrResult } from "@/lib/engines/types";

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

export class OrtWhisperEngine implements AsrEngine {
  readonly engineId = "ort" as const;

  private constructor(
    readonly modelId: string,
    readonly languageDetection: AsrModelSpec["languageDetection"],
    private readonly tokenizer: Tokenizer,
    private readonly encoderSession: InferenceSession,
    private readonly decoderSession: InferenceSession,
    private readonly modelConfig: WhisperModelConfig,
    private readonly generationConfig: WhisperGenerationConfig,
    private readonly preprocessor: WhisperPreprocessorConfig,
  ) {}

  static async create(spec: AsrModelSpec): Promise<OrtWhisperEngine> {
    const runtime = spec.runtime as OrtWhisperRuntime;
    const path = (file: string) => getModelFilePath(spec, file);

    const encoderPath = path(runtime.encoderFile);
    const decoderPath = path(runtime.decoderFile);

    for (const [label, filePath] of [
      ["encoder", encoderPath],
      ["decoder", decoderPath],
    ] as const) {
      const info = await FileSystem.getInfoAsync(filePath);
      if (!info.exists) {
        throw new ModelError({
          code: "MODEL_ENGINE_PATH_MISSING",
          stage: "engine.load",
          message: `No existe el fichero ${label} del modelo ${spec.id}`,
          recoverable: true,
          context: { modelId: spec.id, path: filePath, label },
        });
      }
    }

    const modelConfig = await readJsonFile<WhisperModelConfig>(
      path(runtime.configFile),
      "config",
    );
    const generationConfig = await readJsonFile<WhisperGenerationConfig>(
      path(runtime.generationConfigFile),
      "generation_config",
    );
    const preprocessorPartial = await readJsonFile<
      Partial<WhisperPreprocessorConfig>
    >(path(runtime.preprocessorFile), "preprocessor_config");
    const tokenizerConfig = await readJsonFile<Record<string, unknown>>(
      path(runtime.tokenizerConfigFile),
      "tokenizer_config",
    );
    const tokenizerJson = await readJsonFile<Record<string, unknown>>(
      path(runtime.tokenizerFile),
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
      encoderSession = (
        await createOrtSession(toNativePath(encoderPath), "encoder", {
          label: `${spec.id}/encoder`,
        })
      ).session;
    } catch (err) {
      if (isOrtNotRegistered(causeMessage(err))) {
        throw new WhisperError({
          code: "ORT_NOT_REGISTERED",
          stage: "session.encoder",
          message:
            "onnxruntime-react-native no está registrado. Ejecuta pnpm install && npx expo prebuild --clean y reconstruye la app.",
          recoverable: false,
        });
      }
      throw wrapWhisperError(err, "session.encoder", "SESSION_ENCODER_FAILED", true);
    }

    let decoderSession: InferenceSession;
    try {
      decoderSession = (
        await createOrtSession(toNativePath(decoderPath), "decoder", {
          label: `${spec.id}/decoder`,
        })
      ).session;
    } catch (err) {
      releaseOrtSession(encoderSession);
      throw wrapWhisperError(err, "session.decoder", "SESSION_DECODER_FAILED", true);
    }

    return new OrtWhisperEngine(
      spec.id,
      spec.languageDetection,
      tokenizer,
      encoderSession,
      decoderSession,
      modelConfig,
      generationConfig,
      { ...DEFAULT_PREPROCESSOR, ...preprocessorPartial },
    );
  }

  async transcribe(pcm: Float32Array, request: AsrRequest): Promise<AsrResult> {
    return transcribePcm({
      pcm,
      language: request.language,
      stickyLanguage: request.stickyLanguage ?? null,
      shouldCancel: request.shouldCancel,
      tokenizer: this.tokenizer,
      encoderSession: this.encoderSession as unknown as OrtSession,
      decoderSession: this.decoderSession as unknown as OrtSession,
      modelConfig: this.modelConfig,
      generationConfig: this.generationConfig,
      preprocessor: this.preprocessor,
      TensorCtor: Tensor as unknown as TensorConstructor,
    });
  }

  dispose(): void {
    releaseOrtSession(this.encoderSession);
    releaseOrtSession(this.decoderSession);
  }
}
