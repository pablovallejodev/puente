import { detectLoopPeriod, selectNextToken, TRANSLATION_GUARDS } from '@/lib/ort/decode-guards';
import { TranslatorError, wrapUnknownError } from '@/lib/translator-errors';

export type OrtTensor = {
  dims: readonly number[];
  data: ArrayLike<number> | BigInt64Array;
};

export type TensorConstructor = new (
  type: string,
  data: ArrayLike<number> | BigInt64Array,
  dims: number[],
) => OrtTensor;

export type ModelConfig = {
  decoder_layers: number;
  decoder_attention_heads: number;
  d_model: number;
  vocab_size: number;
  max_position_embeddings?: number;
};

export type GenerationConfig = {
  eos_token_id: number;
  decoder_start_token_id?: number;
};

export type OrtSession = {
  run(feeds: Record<string, OrtTensor | unknown>): Promise<Record<string, OrtTensor | unknown>>;
};

export type TokenizerLike = {
  token_to_id(token: string): number | undefined;
  encode(text: string, opts: { add_special_tokens: boolean }): { ids: number[] };
  decode(ids: number[], opts: { skip_special_tokens: boolean }): string;
};

export const MAX_NEW_TOKENS = 128;
export const MAX_INPUT_TOKENS = 1024;

export function int64Tensor(ids: number[], TensorCtor: TensorConstructor): OrtTensor {
  return new TensorCtor(
    'int64',
    BigInt64Array.from(ids, (id) => BigInt(id)),
    [1, ids.length],
  );
}

export function boolTensor(value: boolean, TensorCtor: TensorConstructor): OrtTensor {
  return new TensorCtor('bool', Uint8Array.from([value ? 1 : 0]), [1]);
}

export function emptyPastTensor(numHeads: number, headDim: number, TensorCtor: TensorConstructor): OrtTensor {
  return new TensorCtor('float32', new Float32Array(0), [1, numHeads, 0, headDim]);
}

export function buildEmptyPastFeeds(
  numLayers: number,
  numHeads: number,
  headDim: number,
  TensorCtor: TensorConstructor,
): Record<string, OrtTensor> {
  const feeds: Record<string, OrtTensor> = {};
  for (let i = 0; i < numLayers; i++) {
    feeds[`past_key_values.${i}.decoder.key`] = emptyPastTensor(numHeads, headDim, TensorCtor);
    feeds[`past_key_values.${i}.decoder.value`] = emptyPastTensor(numHeads, headDim, TensorCtor);
    feeds[`past_key_values.${i}.encoder.key`] = emptyPastTensor(numHeads, headDim, TensorCtor);
    feeds[`past_key_values.${i}.encoder.value`] = emptyPastTensor(numHeads, headDim, TensorCtor);
  }
  return feeds;
}

function isValidKvCache(tensor: OrtTensor): boolean {
  if (tensor.dims.length < 4) return false;
  const batch = Number(tensor.dims[0]);
  const seq = Number(tensor.dims[2]);
  return batch > 0 && seq > 0;
}

/** Merged Optimum decoder drops encoder KV on cache branch; preserve step-0 cross-attn cache. */
export function updatePastFeeds(
  pastFeeds: Record<string, OrtTensor>,
  decoderOutputs: Record<string, OrtTensor>,
  numLayers: number,
  useCacheBranch: boolean,
): Record<string, OrtTensor> {
  const next: Record<string, OrtTensor> = {};
  for (let i = 0; i < numLayers; i++) {
    next[`past_key_values.${i}.decoder.key`] = decoderOutputs[`present.${i}.decoder.key`];
    next[`past_key_values.${i}.decoder.value`] = decoderOutputs[`present.${i}.decoder.value`];

    const encKey = decoderOutputs[`present.${i}.encoder.key`];
    const encVal = decoderOutputs[`present.${i}.encoder.value`];
    const pastEncKey = pastFeeds[`past_key_values.${i}.encoder.key`];
    const pastEncVal = pastFeeds[`past_key_values.${i}.encoder.value`];

    if (isValidKvCache(encKey)) {
      next[`past_key_values.${i}.encoder.key`] = encKey;
      next[`past_key_values.${i}.encoder.value`] = encVal;
    } else if (useCacheBranch && pastEncKey && pastEncVal && isValidKvCache(pastEncKey)) {
      next[`past_key_values.${i}.encoder.key`] = pastEncKey;
      next[`past_key_values.${i}.encoder.value`] = pastEncVal;
    } else {
      next[`past_key_values.${i}.encoder.key`] = encKey;
      next[`past_key_values.${i}.encoder.value`] = encVal;
    }
  }
  return next;
}

export type TranslateParams = {
  text: string;
  srcLang: string;
  tgtLang: string;
  tokenizer: TokenizerLike;
  encoderSession: OrtSession;
  decoderSession: OrtSession;
  modelConfig: ModelConfig;
  eosTokenId: number;
  TensorCtor: TensorConstructor;
  /** Cooperative cancel — checked between decoder steps. */
  shouldCancel?: () => boolean;
};

/** Cancelled runs return null so callers can re-queue without treating it as failure. */
export async function translateText(params: TranslateParams): Promise<string | null> {
  const {
    text,
    srcLang,
    tgtLang,
    tokenizer,
    encoderSession,
    decoderSession,
    modelConfig,
    eosTokenId,
    TensorCtor,
    shouldCancel,
  } = params;

  const trimmed = text.trim();
  if (!trimmed) return '';

  if (shouldCancel?.()) return null;

  const srcLangId = tokenizer.token_to_id(srcLang);
  const tgtLangId = tokenizer.token_to_id(tgtLang);
  if (srcLangId === undefined || tgtLangId === undefined) {
    throw new TranslatorError({
      code: 'LANGUAGE_UNSUPPORTED',
      stage: 'tokenizer.load',
      message: `Idioma no soportado: ${srcLang} -> ${tgtLang}`,
      recoverable: false,
      context: { srcLang, tgtLang },
    });
  }

  const encoded = tokenizer.encode(trimmed, { add_special_tokens: false });
  const maxTextTokens = (modelConfig.max_position_embeddings ?? MAX_INPUT_TOKENS) - 2;
  if (encoded.ids.length > maxTextTokens) {
    throw new TranslatorError({
      code: 'INPUT_TOO_LONG',
      stage: 'encode.run',
      message: `Entrada demasiado larga (${encoded.ids.length} tokens, máx ${maxTextTokens})`,
      recoverable: false,
      context: { tokens: encoded.ids.length, maxTokens: maxTextTokens },
    });
  }

  const inputIds = [srcLangId, ...encoded.ids, eosTokenId];
  const attentionMask = inputIds.map(() => 1);
  const numLayers = modelConfig.decoder_layers;
  const numHeads = modelConfig.decoder_attention_heads;
  const headDim = modelConfig.d_model / numHeads;

  let encoderOutputs: Record<string, OrtTensor | unknown>;
  try {
    encoderOutputs = await encoderSession.run({
      input_ids: int64Tensor(inputIds, TensorCtor),
      attention_mask: int64Tensor(attentionMask, TensorCtor),
    });
  } catch (err) {
    throw wrapTranslateError(err, 'encode.run', 'ENCODE_FAILED');
  }

  if (shouldCancel?.()) return null;

  const encoderHiddenStates = encoderOutputs.last_hidden_state as OrtTensor;
  const encoderAttentionMask = int64Tensor(attentionMask, TensorCtor);

  let decoderInputIds = [eosTokenId, tgtLangId];
  let useCacheBranch = false;
  let pastFeeds = buildEmptyPastFeeds(numLayers, numHeads, headDim, TensorCtor);
  const generatedIds: number[] = [];

  for (let step = 0; step < MAX_NEW_TOKENS; step++) {
    if (shouldCancel?.()) return null;

    let decoderOutputs: Record<string, OrtTensor | unknown>;
    try {
      decoderOutputs = await decoderSession.run({
        input_ids: int64Tensor(decoderInputIds, TensorCtor),
        encoder_hidden_states: encoderHiddenStates,
        encoder_attention_mask: encoderAttentionMask,
        use_cache_branch: boolTensor(useCacheBranch, TensorCtor),
        ...pastFeeds,
      });
    } catch (err) {
      throw wrapTranslateError(err, 'decode.run', 'DECODE_FAILED', { step });
    }

    if (shouldCancel?.()) return null;

    const nextTokenId = selectNextToken(
      decoderOutputs.logits as OrtTensor,
      modelConfig.vocab_size,
      generatedIds,
      TRANSLATION_GUARDS,
    );
    if (nextTokenId === eosTokenId) break;

    generatedIds.push(nextTokenId);

    // NLLB loops when the source is a single word it cannot place. Cut the
    // repeated block and return what came before rather than burning the whole
    // token budget on it.
    const loopPeriod = detectLoopPeriod(generatedIds, TRANSLATION_GUARDS);
    if (loopPeriod !== null) {
      generatedIds.length = Math.max(0, generatedIds.length - loopPeriod * TRANSLATION_GUARDS.loopRepeats);
      break;
    }

    pastFeeds = updatePastFeeds(pastFeeds, decoderOutputs as Record<string, OrtTensor>, numLayers, useCacheBranch);
    decoderInputIds = [nextTokenId];
    useCacheBranch = true;
  }

  if (generatedIds.length === 0) {
    throw new TranslatorError({
      code: 'DECODE_EMPTY',
      stage: 'decode.output',
      message: 'El decoder no generó tokens',
      recoverable: true,
      context: { srcLang, tgtLang },
    });
  }

  return tokenizer.decode(generatedIds, { skip_special_tokens: true }).trim();
}

function wrapTranslateError(
  err: unknown,
  stage: 'encode.run' | 'decode.run',
  code: 'ENCODE_FAILED' | 'DECODE_FAILED',
  context?: Record<string, string | number | boolean>,
): TranslatorError {
  return wrapUnknownError(err, stage, code, true, context);
}
