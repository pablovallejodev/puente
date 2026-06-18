import { useEffect, useRef, useState } from "react";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { Tokenizer } from "@huggingface/tokenizers";
import { InferenceSession, Tensor } from "onnxruntime-react-native";

import { mapSpeechLocaleToFlores } from "@/constants/languages";

import modelConfig from "@/assets/models/config.json";
import generationConfig from "@/assets/models/generation_config.json";
import tokenizerJson from "@/assets/models/tokenizer.json";
import tokenizerConfig from "@/assets/models/tokenizer_config.json";

const ENCODER_ASSET = require("@/assets/models/encoder_model_quantized.onnx");
const DECODER_ASSET = require("@/assets/models/decoder_model_merged_quantized.onnx");

const MODEL_DIR = `@/assets/models/`;
const ENCODER_PATH = `${MODEL_DIR}encoder_model_quantized.onnx`;
const DECODER_PATH = `${MODEL_DIR}decoder_model_merged_quantized.onnx`;

const NUM_LAYERS = modelConfig.decoder_layers;
const NUM_HEADS = modelConfig.decoder_attention_heads;
const HEAD_DIM = modelConfig.d_model / NUM_HEADS;
const VOCAB_SIZE = modelConfig.vocab_size;
const EOS_TOKEN_ID = generationConfig.eos_token_id;
const MAX_NEW_TOKENS = 128;
const DEBOUNCE_MS = 600;

export type TranslatorStatus = "loading" | "ready" | "translating" | "error";

function localeToFlores(locale: string, fallback: string): string {
  return mapSpeechLocaleToFlores(locale) ?? fallback;
}

function int64Tensor(ids: number[]): Tensor {
  return new Tensor(
    "int64",
    BigInt64Array.from(ids, (id) => BigInt(id)),
    [1, ids.length],
  );
}

function boolTensor(value: boolean): Tensor {
  return new Tensor("bool", [value], [1]);
}

function emptyPastTensor(): Tensor {
  return new Tensor("float32", new Float32Array(0), [
    1,
    NUM_HEADS,
    0,
    HEAD_DIM,
  ]);
}

function buildEmptyPastFeeds(): Record<string, Tensor> {
  const feeds: Record<string, Tensor> = {};
  for (let i = 0; i < NUM_LAYERS; i++) {
    feeds[`past_key_values.${i}.decoder.key`] = emptyPastTensor();
    feeds[`past_key_values.${i}.decoder.value`] = emptyPastTensor();
    feeds[`past_key_values.${i}.encoder.key`] = emptyPastTensor();
    feeds[`past_key_values.${i}.encoder.value`] = emptyPastTensor();
  }
  return feeds;
}

function argmaxLastToken(logits: Tensor): number {
  const dims = logits.dims;
  const seqLen = dims.length >= 2 ? Number(dims[1]) : 1;
  const vocabSize = dims.length >= 3 ? Number(dims[2]) : VOCAB_SIZE;
  const data = logits.data as Float32Array;
  const offset = (seqLen - 1) * vocabSize;

  let bestId = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < vocabSize; i++) {
    const value = data[offset + i];
    if (value > bestValue) {
      bestValue = value;
      bestId = i;
    }
  }
  return bestId;
}

async function ensureDirectory(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function copyAssetToPath(
  assetModule: number,
  destPath: string,
): Promise<string> {
  const info = await FileSystem.getInfoAsync(destPath);
  if (info.exists) return destPath;

  await ensureDirectory(MODEL_DIR);

  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error(`No se pudo resolver la ruta del asset para ${destPath}`);
  }

  await FileSystem.copyAsync({ from: asset.localUri, to: destPath });
  return destPath;
}

async function prepareModelFiles(): Promise<void> {
  await copyAssetToPath(ENCODER_ASSET, ENCODER_PATH);
  await copyAssetToPath(DECODER_ASSET, DECODER_PATH);
}

class NllbEngine {
  private tokenizer: Tokenizer;
  private encoderSession: InferenceSession;
  private decoderSession: InferenceSession;

  private constructor(
    tokenizer: Tokenizer,
    encoderSession: InferenceSession,
    decoderSession: InferenceSession,
  ) {
    this.tokenizer = tokenizer;
    this.encoderSession = encoderSession;
    this.decoderSession = decoderSession;
  }

  static async create(): Promise<NllbEngine> {
    await prepareModelFiles();

    const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
    const encoderSession = await InferenceSession.create(ENCODER_PATH);
    const decoderSession = await InferenceSession.create(DECODER_PATH);

    return new NllbEngine(tokenizer, encoderSession, decoderSession);
  }

  async translate(
    text: string,
    srcLang: string,
    tgtLang: string,
  ): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const srcLangId = this.tokenizer.token_to_id(srcLang);
    const tgtLangId = this.tokenizer.token_to_id(tgtLang);
    if (srcLangId === undefined || tgtLangId === undefined) {
      throw new Error(`Idioma no soportado: ${srcLang} -> ${tgtLang}`);
    }

    const encoded = this.tokenizer.encode(trimmed, {
      add_special_tokens: false,
    });
    const inputIds = [srcLangId, ...encoded.ids];
    const attentionMask = inputIds.map(() => 1);

    const encoderOutputs = await this.encoderSession.run({
      input_ids: int64Tensor(inputIds),
      attention_mask: int64Tensor(attentionMask),
    });

    const encoderHiddenStates = encoderOutputs.last_hidden_state;
    const encoderAttentionMask = int64Tensor(attentionMask);

    let decoderInputIds = [tgtLangId];
    let useCacheBranch = false;
    let pastFeeds = buildEmptyPastFeeds();
    const generatedIds: number[] = [];

    for (let step = 0; step < MAX_NEW_TOKENS; step++) {
      const decoderOutputs = await this.decoderSession.run({
        input_ids: int64Tensor(decoderInputIds),
        encoder_hidden_states: encoderHiddenStates,
        encoder_attention_mask: encoderAttentionMask,
        use_cache_branch: boolTensor(useCacheBranch),
        ...pastFeeds,
      });

      const nextTokenId = argmaxLastToken(decoderOutputs.logits);
      if (nextTokenId === EOS_TOKEN_ID) break;

      generatedIds.push(nextTokenId);

      pastFeeds = {};
      for (let i = 0; i < NUM_LAYERS; i++) {
        pastFeeds[`past_key_values.${i}.decoder.key`] =
          decoderOutputs[`present.${i}.decoder.key`];
        pastFeeds[`past_key_values.${i}.decoder.value`] =
          decoderOutputs[`present.${i}.decoder.value`];
        pastFeeds[`past_key_values.${i}.encoder.key`] =
          decoderOutputs[`present.${i}.encoder.key`];
        pastFeeds[`past_key_values.${i}.encoder.value`] =
          decoderOutputs[`present.${i}.encoder.value`];
      }

      decoderInputIds = [nextTokenId];
      useCacheBranch = true;
    }

    return this.tokenizer
      .decode(generatedIds, { skip_special_tokens: true })
      .trim();
  }
  /*
  dispose(): void {
    this.encoderSession.dispose();
    this.decoderSession.dispose();
  }
*/
}

let enginePromise: Promise<NllbEngine> | null = null;

function getEngine(): Promise<NllbEngine> {
  if (!enginePromise) {
    enginePromise = NllbEngine.create();
  }
  return enginePromise;
}

export function useTranslator(
  transcript: string,
  inputLanguage: string = "es-ES",
  outputLanguage: string = "en-US",
) {
  const [translated, setTranslated] = useState("");
  const [status, setStatus] = useState<TranslatorStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const engineRef = useRef<NllbEngine | null>(null);

  useEffect(() => {
    let cancelled = false;

    getEngine()
      .then((engine) => {
        if (cancelled) return;
        engineRef.current = engine;
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Error cargando el modelo";
        setError(message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !engineRef.current) return;

    const trimmed = transcript.trim();
    if (!trimmed) {
      setTranslated("");
      return;
    }

    const requestId = ++requestIdRef.current;
    const srcLang = localeToFlores(inputLanguage, "spa_Latn");
    const tgtLang = localeToFlores(outputLanguage, "eng_Latn");

    const timer = setTimeout(async () => {
      try {
        setStatus("translating");
        const result = await engineRef.current!.translate(
          trimmed,
          srcLang,
          tgtLang,
        );
        if (requestIdRef.current !== requestId) return;
        setTranslated(result);
        setError(null);
        setStatus("ready");
      } catch (err: unknown) {
        if (requestIdRef.current !== requestId) return;
        const message =
          err instanceof Error ? err.message : "Error traduciendo";
        setError(message);
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [transcript, inputLanguage, outputLanguage, status]);

  return {
    translated,
    status,
    error,
    ready: status === "ready" || status === "translating",
  };
}
