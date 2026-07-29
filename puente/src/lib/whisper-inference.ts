import {
  UNIVERSAL_CANDIDATE_LANGS,
  whisperLangToSpeechLocale,
} from "@/constants/whisper-languages";
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
  no_speech_token_id?: number;
  task_to_id: { transcribe: number; translate?: number };
  lang_to_id: Record<string, number>;
};

export const WHISPER_SESSION_OPTIONS = {
  graphOptimizationLevel: "basic" as const,
};

export const MAX_NEW_TOKENS = 224;

/** Softmax peak below this → sticky or abort (Universal). */
export const LANG_DETECT_MIN_PROB = 0.45;

/** PCM samples @ 16 kHz — below this, detection is unreliable. */
export const LANG_DETECT_MIN_SAMPLES = Math.floor(16000 * 0.8);

/** Softmax P(no_speech) above this → reject chunk (calibrate on-device). */
export const NO_SPEECH_THRESHOLD = 0.6;

export type WhisperTranscribeResult = {
  text: string;
  language: string;
  languageProb: number;
  speechLocale: string;
  usedSticky: boolean;
  noSpeech: boolean;
  noSpeechProb: number;
};

export type TranscribeParams = {
  pcm: Float32Array;
  /** Whisper ISO code ("es") or "auto". */
  language: string | "auto";
  tokenizer: TokenizerLike;
  encoderSession: OrtSession;
  decoderSession: OrtSession;
  modelConfig: WhisperModelConfig;
  generationConfig: WhisperGenerationConfig;
  preprocessor?: WhisperPreprocessorConfig;
  TensorCtor: TensorConstructor;
  candidateLangs?: readonly string[];
  /** Sticky from prior Universal utterance. */
  stickyLanguage?: string | null;
  /** Cooperative cancel — checked between decoder steps. */
  shouldCancel?: () => boolean;
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

function languageCodeFromToken(token: string): string {
  return token.replace(/^<\|/, "").replace(/\|>$/, "").toLowerCase();
}

function collectCandidateTokenIds(
  generationConfig: WhisperGenerationConfig,
  tokenizer: TokenizerLike,
  candidateLangs: readonly string[],
): { ids: number[]; codes: string[] } {
  const ids: number[] = [];
  const codes: string[] = [];
  const allow = new Set(candidateLangs.map((c) => c.toLowerCase()));

  for (const [token, id] of Object.entries(generationConfig.lang_to_id)) {
    const code = languageCodeFromToken(token);
    if (!allow.has(code)) continue;
    if (typeof id !== "number") continue;
    ids.push(id);
    codes.push(code);
  }

  if (ids.length === 0) {
    for (const code of allow) {
      const token = `<|${code}|>`;
      const fromTok = tokenizer.token_to_id(token);
      if (fromTok === undefined) continue;
      ids.push(fromTok);
      codes.push(code);
    }
  }

  return { ids, codes };
}

function lastLogitsSlice(logits: OrtTensor): {
  data: Float32Array;
  offset: number;
  vocabSize: number;
} {
  const dims = logits.dims;
  const seqLen = dims.length >= 2 ? Number(dims[1]) : 1;
  const vocabSize = dims.length >= 3 ? Number(dims[2]) : 0;
  const data = logits.data as Float32Array;
  return { data, offset: (seqLen - 1) * vocabSize, vocabSize };
}

/** Softmax over candidate language logits at the last decoder position. */
export function softmaxLangAmong(
  logits: OrtTensor,
  candidateIds: number[],
): { index: number; id: number; prob: number } {
  if (candidateIds.length === 0) {
    throw new WhisperError({
      code: "LANG_DETECT_EMPTY",
      stage: "lang.detect",
      message: "No hay tokens de idioma candidatos",
      recoverable: false,
    });
  }

  const { data, offset } = lastLogitsSlice(logits);

  let maxLogit = -Infinity;
  for (const id of candidateIds) {
    const v = data[offset + id];
    if (v > maxLogit) maxLogit = v;
  }

  let sum = 0;
  const exps = new Array<number>(candidateIds.length);
  for (let i = 0; i < candidateIds.length; i++) {
    const e = Math.exp(data[offset + candidateIds[i]] - maxLogit);
    exps[i] = e;
    sum += e;
  }

  let bestIndex = 0;
  let bestProb = -1;
  for (let i = 0; i < candidateIds.length; i++) {
    const p = exps[i] / sum;
    if (p > bestProb) {
      bestProb = p;
      bestIndex = i;
    }
  }

  return {
    index: bestIndex,
    id: candidateIds[bestIndex],
    prob: bestProb,
  };
}

export function resolveNoSpeechTokenId(
  generationConfig: WhisperGenerationConfig,
  tokenizer: TokenizerLike,
): number | null {
  if (typeof generationConfig.no_speech_token_id === "number") {
    return generationConfig.no_speech_token_id;
  }
  return (
    tokenizer.token_to_id("<|nospeech|>") ??
    tokenizer.token_to_id("<|nocaptions|>") ??
    null
  );
}

/** Full-vocab softmax probability of no_speech at the last position. */
export function noSpeechProbFromLogits(
  logits: OrtTensor,
  noSpeechId: number,
): number {
  const { data, offset, vocabSize } = lastLogitsSlice(logits);
  if (noSpeechId < 0 || noSpeechId >= vocabSize) return 0;

  let maxLogit = -Infinity;
  for (let i = 0; i < vocabSize; i++) {
    const v = data[offset + i];
    if (v > maxLogit) maxLogit = v;
  }

  let sum = 0;
  for (let i = 0; i < vocabSize; i++) {
    sum += Math.exp(data[offset + i] - maxLogit);
  }
  return Math.exp(data[offset + noSpeechId] - maxLogit) / sum;
}

async function runSotProbe(
  encoderHiddenStates: OrtTensor,
  params: Pick<
    TranscribeParams,
    "decoderSession" | "modelConfig" | "generationConfig" | "TensorCtor"
  >,
): Promise<OrtTensor> {
  const { decoderSession, modelConfig, generationConfig, TensorCtor } = params;
  const numLayers = modelConfig.decoder_layers;
  const numHeads = modelConfig.decoder_attention_heads;
  const headDim = modelConfig.d_model / numHeads;
  const sot = generationConfig.decoder_start_token_id;
  const pastFeeds = buildEmptyPastFeeds(numLayers, numHeads, headDim, TensorCtor);

  let decoderOutputs: Record<string, OrtTensor | unknown>;
  try {
    decoderOutputs = await decoderSession.run({
      input_ids: int64Tensor([sot], TensorCtor),
      encoder_hidden_states: encoderHiddenStates,
      use_cache_branch: boolTensor(false, TensorCtor),
      ...pastFeeds,
    });
  } catch (err) {
    throw wrapWhisperError(
      err,
      "lang.detect",
      "LANG_DETECT_FAILED",
      true,
    );
  }

  const logits = decoderOutputs.logits as OrtTensor | undefined;
  if (!logits) {
    throw new WhisperError({
      code: "LANG_DETECT_EMPTY",
      stage: "lang.detect",
      message: "Decoder no devolvió logits para detección",
      recoverable: true,
    });
  }
  return logits;
}

async function detectLanguageFromEncoder(
  encoderHiddenStates: OrtTensor,
  params: Pick<
    TranscribeParams,
    | "decoderSession"
    | "modelConfig"
    | "generationConfig"
    | "tokenizer"
    | "TensorCtor"
    | "candidateLangs"
  >,
  sotLogits?: OrtTensor,
): Promise<{ language: string; languageProb: number; logits: OrtTensor }> {
  const {
    generationConfig,
    tokenizer,
    candidateLangs = UNIVERSAL_CANDIDATE_LANGS,
  } = params;

  const { ids, codes } = collectCandidateTokenIds(
    generationConfig,
    tokenizer,
    candidateLangs,
  );
  if (ids.length === 0) {
    throw new WhisperError({
      code: "LANG_DETECT_EMPTY",
      stage: "lang.detect",
      message: "lang_to_id vacío para candidatos Universal",
      recoverable: false,
    });
  }

  const logits = sotLogits ?? (await runSotProbe(encoderHiddenStates, params));
  const { index, prob } = softmaxLangAmong(logits, ids);
  return { language: codes[index], languageProb: prob, logits };
}

function capitalizeFirst(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`;
}

async function decodeTranscript(params: {
  encoderHiddenStates: OrtTensor;
  language: string;
  tokenizer: TokenizerLike;
  decoderSession: OrtSession;
  modelConfig: WhisperModelConfig;
  generationConfig: WhisperGenerationConfig;
  TensorCtor: TensorConstructor;
  shouldCancel?: () => boolean;
}): Promise<string | null> {
  const {
    encoderHiddenStates,
    language,
    tokenizer,
    decoderSession,
    modelConfig,
    generationConfig,
    TensorCtor,
    shouldCancel,
  } = params;

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
    if (shouldCancel?.()) return null;

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

    if (shouldCancel?.()) return null;

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

function resolveSpeechLocale(language: string): string {
  const locale = whisperLangToSpeechLocale(language);
  if (!locale) {
    throw new WhisperError({
      code: "LANG_DETECT_UNSUPPORTED",
      stage: "lang.resolve",
      message: `Idioma detectado sin locale BCP-47: ${language}`,
      recoverable: false,
      context: { language },
    });
  }
  return locale;
}

function emptyResult(
  language: string,
  languageProb: number,
  usedSticky: boolean,
  noSpeechProb: number,
  noSpeech: boolean,
): WhisperTranscribeResult {
  return {
    text: "",
    language,
    languageProb,
    speechLocale: resolveSpeechLocale(language),
    usedSticky,
    noSpeech,
    noSpeechProb,
  };
}

export async function transcribePcm(
  params: TranscribeParams,
): Promise<WhisperTranscribeResult> {
  const {
    pcm,
    language: languageOpt,
    tokenizer,
    encoderSession,
    decoderSession,
    modelConfig,
    generationConfig,
    preprocessor = DEFAULT_PREPROCESSOR,
    TensorCtor,
    candidateLangs = UNIVERSAL_CANDIDATE_LANGS,
    stickyLanguage = null,
    shouldCancel,
  } = params;

  if (pcm.length === 0) {
    return emptyResult(stickyLanguage ?? "en", 0, !!stickyLanguage, 0, true);
  }

  if (shouldCancel?.()) {
    return emptyResult(stickyLanguage ?? "en", 0, !!stickyLanguage, 0, false);
  }

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

  if (shouldCancel?.()) {
    return emptyResult(stickyLanguage ?? "en", 0, !!stickyLanguage, 0, false);
  }

  const encoderHiddenStates = encoderOutputs.last_hidden_state as OrtTensor;
  const noSpeechId = resolveNoSpeechTokenId(generationConfig, tokenizer);

  let language: string;
  let languageProb: number;
  let usedSticky = false;
  let noSpeechProb = 0;
  let sotLogits: OrtTensor | undefined;

  // SOT probe: language logits + no_speech probability share one decoder step.
  if (languageOpt === "auto" || noSpeechId !== null) {
    sotLogits = await runSotProbe(encoderHiddenStates, {
      decoderSession,
      modelConfig,
      generationConfig,
      TensorCtor,
    });
    if (noSpeechId !== null) {
      noSpeechProb = noSpeechProbFromLogits(sotLogits, noSpeechId);
      if (noSpeechProb >= NO_SPEECH_THRESHOLD) {
        return emptyResult(
          stickyLanguage ?? (languageOpt === "auto" ? "en" : languageOpt),
          0,
          false,
          noSpeechProb,
          true,
        );
      }
    }
  }

  if (languageOpt === "auto") {
    if (pcm.length < LANG_DETECT_MIN_SAMPLES) {
      if (stickyLanguage) {
        language = stickyLanguage;
        languageProb = 1;
        usedSticky = true;
      } else {
        throw new WhisperError({
          code: "LANG_DETECT_AUDIO_TOO_SHORT",
          stage: "lang.resolve",
          message: "Audio demasiado corto para detectar idioma",
          recoverable: true,
          context: { samples: pcm.length, min: LANG_DETECT_MIN_SAMPLES },
        });
      }
    } else {
      const detected = await detectLanguageFromEncoder(
        encoderHiddenStates,
        {
          decoderSession,
          modelConfig,
          generationConfig,
          tokenizer,
          TensorCtor,
          candidateLangs,
        },
        sotLogits,
      );

      if (detected.languageProb < LANG_DETECT_MIN_PROB) {
        if (stickyLanguage) {
          language = stickyLanguage;
          languageProb = detected.languageProb;
          usedSticky = true;
        } else {
          throw new WhisperError({
            code: "LANG_DETECT_LOW_CONFIDENCE",
            stage: "lang.resolve",
            message: "Confianza baja en detección de idioma",
            recoverable: true,
            context: {
              language: detected.language,
              prob: Number(detected.languageProb.toFixed(3)),
            },
          });
        }
      } else {
        language = detected.language;
        languageProb = detected.languageProb;
      }
    }
  } else {
    language = languageOpt;
    languageProb = 1;
  }

  if (shouldCancel?.()) {
    return emptyResult(language, languageProb, usedSticky, noSpeechProb, false);
  }

  const speechLocale = resolveSpeechLocale(language);
  const text = await decodeTranscript({
    encoderHiddenStates,
    language,
    tokenizer,
    decoderSession,
    modelConfig,
    generationConfig,
    TensorCtor,
    shouldCancel,
  });

  if (text === null) {
    return emptyResult(language, languageProb, usedSticky, noSpeechProb, false);
  }

  return {
    text,
    language,
    languageProb,
    speechLocale,
    usedSticky,
    noSpeech: false,
    noSpeechProb,
  };
}
