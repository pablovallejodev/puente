/**
 * NLLB-200 on ONNX Runtime, decoded by our own loop (lib/nllb-inference).
 *
 * Widest language coverage in the catalog and the only translator that works
 * with no native module beyond onnxruntime-react-native, so it stays the
 * default even though SalamandraTA beats it on European pairs.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Tokenizer } from "@huggingface/tokenizers";
import { InferenceSession, Tensor } from "onnxruntime-react-native";

import { mapSpeechLocaleToFlores } from "@/constants/languages";
import type { MtModelSpec, OrtNllbRuntime } from "@/constants/model-catalog";
import { causeMessage } from "@/lib/errors/diagnostic";
import { getModelFilePath, toNativePath } from "@/lib/model-paths";
import { ModelError } from "@/lib/model-errors";
import {
  translateText,
  type GenerationConfig,
  type ModelConfig,
  type OrtSession,
  type TensorConstructor,
} from "@/lib/nllb-inference";
import {
  createOrtSession,
  isOrtNotRegistered,
  releaseOrtSession,
} from "@/lib/ort/session";
import { TranslatorError, wrapUnknownError } from "@/lib/translator-errors";
import type { MtEngine, MtRequest } from "@/lib/engines/types";

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

function floresOrThrow(locale: string, role: "input" | "output"): string {
  const flores = mapSpeechLocaleToFlores(locale);
  if (!flores) {
    throw new TranslatorError({
      code: "LANGUAGE_UNSUPPORTED",
      stage: "tokenizer.load",
      message: `Locale no soportado (${role}): ${locale}`,
      recoverable: false,
      context: { locale, role },
    });
  }
  return flores;
}

export class OrtNllbEngine implements MtEngine {
  readonly engineId = "ort" as const;

  private constructor(
    readonly modelId: string,
    private readonly tokenizer: Tokenizer,
    private readonly encoderSession: InferenceSession,
    private readonly decoderSession: InferenceSession,
    private readonly modelConfig: ModelConfig,
    private readonly eosTokenId: number,
  ) {}

  static async create(spec: MtModelSpec): Promise<OrtNllbEngine> {
    const runtime = spec.runtime as OrtNllbRuntime;
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

    const modelConfig = await readJsonFile<ModelConfig>(
      path(runtime.configFile),
      "config",
    );
    const generationConfig = await readJsonFile<GenerationConfig>(
      path(runtime.generationConfigFile),
      "generation_config",
    );
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
      throw wrapUnknownError(err, "tokenizer.load", "TOKENIZER_LOAD_FAILED", true);
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

    let decoderSession: InferenceSession;
    try {
      decoderSession = (
        await createOrtSession(toNativePath(decoderPath), "decoder", {
          label: `${spec.id}/decoder`,
        })
      ).session;
    } catch (err) {
      releaseOrtSession(encoderSession);
      throw wrapUnknownError(err, "session.decoder", "SESSION_DECODER_FAILED", true);
    }

    return new OrtNllbEngine(
      spec.id,
      tokenizer,
      encoderSession,
      decoderSession,
      modelConfig,
      tokenizer.token_to_id("</s>") ?? generationConfig.eos_token_id,
    );
  }

  supportsLocale(locale: string): boolean {
    return mapSpeechLocaleToFlores(locale) !== null;
  }

  async translate(
    text: string,
    srcLocale: string,
    tgtLocale: string,
    request?: MtRequest,
  ): Promise<string | null> {
    return translateText({
      text,
      srcLang: floresOrThrow(srcLocale, "input"),
      tgtLang: floresOrThrow(tgtLocale, "output"),
      tokenizer: this.tokenizer,
      encoderSession: this.encoderSession as unknown as OrtSession,
      decoderSession: this.decoderSession as unknown as OrtSession,
      modelConfig: this.modelConfig,
      eosTokenId: this.eosTokenId,
      TensorCtor: Tensor as unknown as TensorConstructor,
      shouldCancel: request?.shouldCancel,
    });
  }

  dispose(): void {
    releaseOrtSession(this.encoderSession);
    releaseOrtSession(this.decoderSession);
  }
}
