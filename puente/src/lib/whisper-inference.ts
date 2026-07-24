import {
  argmaxLastToken,
  boolTensor,
  buildEmptyPastFeeds,
  updatePastFeeds,
  type OrtSession,
  type OrtTensor,
  type TensorConstructor,
  type TokenizerLike,
} from "@/lib/nllb-inference";
import {
  DEFAULT_PREPROCESSOR,
  extractWhisperMel,
  type WhisperPreprocessorConfig,
} from "@/lib/whisper-mel";
import { WhisperError, wrapWhisperError } from "@/lib/whisper-errors";

export type WhisperModelConfig = {
  decoder_layers: number;
  decoder_attention_heads: number;
  d_model: number;
  vocab_size: number;
  num_mel_bins?: number;
  max_source_positions?: number;
};

export type WhisperGenerationConfig = {
  eos_token_id: number;
  decoder_start_token_id: number;
  no_timestamps_token_id: number;
  task_to_id: { transcribe: number; translate?: number };
  lang_to_id: Record<string, number>;
};

export const WHISPER_SESSION_OPTIONS = {
  graphOptimizationLevel: "basic" as const,
};

export const MAX_NEW_TOKENS = 224;

export type TranscribeParams = {
  pcm: Float32Array;
  language: string;
  tokenizer: TokenizerLike;
  encoderSession: OrtSession;
  decoderSession: OrtSession;
  modelConfig: WhisperModelConfig;
  generationConfig: WhisperGenerationConfig;
  preprocessor?: WhisperPreprocessorConfig;
  TensorCtor: TensorConstructor;
};

function floatTensor(
  data: Float32Array,
  dims: number[],
  TensorCtor: TensorConstructor,
): OrtTensor {
  return new TensorCtor("float32", data, dims);
}

function int64Tensor(
  ids: number[],
  TensorCtor: TensorConstructor,
): OrtTensor {
  return new TensorCtor(
    "int64",
    BigInt64Array.from(ids, (id) => BigInt(id)),
    [1, ids.length],
  );
}

function resolveLanguageTokenId(
  language: string,
  generationConfig: WhisperGenerationConfig,
  tokenizer: TokenizerLike,
): number {
  const token = language.startsWith("<|") ? language : `<|${language}|>`;
  const fromConfig = generationConfig.lang_to_id[token];
  if (typeof fromConfig === "number") return fromConfig;
  const fromTok = tokenizer.token_to_id(token);
  if (fromTok !== undefined) return fromTok;
  throw new WhisperError({
    code: "LANGUAGE_UNSUPPORTED",
    stage: "decode.run",
    message: `Idioma Whisper no soportado: ${language}`,
    recoverable: false,
    context: { language },
  });
}

function capitalizeFirst(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`;
}

export async function transcribePcm(params: TranscribeParams): Promise<string> {
  const {
    pcm,
    language,
    tokenizer,
    encoderSession,
    decoderSession,
    modelConfig,
    generationConfig,
    preprocessor = DEFAULT_PREPROCESSOR,
    TensorCtor,
  } = params;

  if (pcm.length === 0) return "";

  let mel: Float32Array;
  try {
    mel = extractWhisperMel(pcm, preprocessor);
  } catch (err) {
    throw wrapWhisperError(err, "mel.extract", "MEL_FAILED", true);
  }

  const nMels = preprocessor.feature_size;
  const nFrames = preprocessor.nb_max_frames;

  let encoderOutputs: Record<string, OrtTensor | unknown>;
  try {
    encoderOutputs = await encoderSession.run({
      input_features: floatTensor(mel, [1, nMels, nFrames], TensorCtor),
    });
  } catch (err) {
    throw wrapWhisperError(err, "encode.run", "ENCODE_FAILED", true);
  }

  const encoderHiddenStates = encoderOutputs.last_hidden_state as OrtTensor;
  const numLayers = modelConfig.decoder_layers;
  const numHeads = modelConfig.decoder_attention_heads;
  const headDim = modelConfig.d_model / numHeads;

  const langId = resolveLanguageTokenId(language, generationConfig, tokenizer);
  const sot = generationConfig.decoder_start_token_id;
  const transcribeId = generationConfig.task_to_id.transcribe;
  const noTimestamps = generationConfig.no_timestamps_token_id;
  const eos = generationConfig.eos_token_id;

  let decoderInputIds = [sot, langId, transcribeId, noTimestamps];
  let useCacheBranch = false;
  let pastFeeds = buildEmptyPastFeeds(numLayers, numHeads, headDim, TensorCtor);
  const generatedIds: number[] = [];

  for (let step = 0; step < MAX_NEW_TOKENS; step++) {
    let decoderOutputs: Record<string, OrtTensor | unknown>;
    try {
      decoderOutputs = await decoderSession.run({
        input_ids: int64Tensor(decoderInputIds, TensorCtor),
        encoder_hidden_states: encoderHiddenStates,
        use_cache_branch: boolTensor(useCacheBranch, TensorCtor),
        ...pastFeeds,
      });
    } catch (err) {
      throw wrapWhisperError(err, "decode.run", "DECODE_FAILED", true, {
        step,
      });
    }

    const nextTokenId = argmaxLastToken(
      decoderOutputs.logits as OrtTensor,
      modelConfig.vocab_size,
    );
    if (nextTokenId === eos) break;

    generatedIds.push(nextTokenId);
    pastFeeds = updatePastFeeds(
      pastFeeds,
      decoderOutputs as Record<string, OrtTensor>,
      numLayers,
      useCacheBranch,
    );
    decoderInputIds = [nextTokenId];
    useCacheBranch = true;
  }

  if (generatedIds.length === 0) {
    throw new WhisperError({
      code: "DECODE_EMPTY",
      stage: "decode.output",
      message: "Whisper no generó tokens",
      recoverable: true,
      context: { language },
    });
  }

  const text = tokenizer
    .decode(generatedIds, { skip_special_tokens: true })
    .trim();
  return capitalizeFirst(text);
}
