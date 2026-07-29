/**
 * Repetition guards for the greedy decoding loops.
 *
 * Greedy decoding has one characteristic failure mode, and it is the one users
 * actually report: the model latches onto a token sequence and emits it
 * forever. Whisper does it on near-silence ("Thank you. Thank you. Thank you.",
 * "Subtítulos realizados por…"), NLLB does it when the source is a single word
 * it cannot place. Both waste the entire token budget producing text nobody
 * said, which is worse than producing nothing.
 *
 * Three defences, cheapest first:
 *
 *   repetition penalty   discourage any token already emitted
 *   no-repeat n-gram     forbid completing an n-gram that already occurred
 *   loop detection       stop once the tail is a short cycle repeated
 *
 * The first two are the standard Hugging Face `generate()` behaviour. The third
 * is the backstop for loops longer than the n-gram window.
 */

import type { OrtTensor } from "@/lib/nllb-inference";

export type RepetitionGuardConfig = {
  /**
   * Divides the logit of tokens already generated (>1 discourages them).
   * 1.0 disables it. Kept mild: translation legitimately repeats words, and an
   * aggressive penalty makes the model avoid articles and prepositions.
   */
  repetitionPenalty: number;
  /** Forbid repeating any n-gram of this length. 0 disables it. */
  noRepeatNgramSize: number;
  /**
   * Stop when the tail is the same short block repeated this many times.
   * Catches loops whose period exceeds the n-gram window.
   */
  loopRepeats: number;
  /** Longest cycle length loop detection will look for. */
  maxLoopPeriod: number;
};

/**
 * Whisper transcribes speech, where genuine repetition is rare and
 * hallucination loops are common, so it gets the firmer settings.
 */
export const WHISPER_GUARDS: RepetitionGuardConfig = {
  repetitionPenalty: 1.1,
  noRepeatNgramSize: 4,
  loopRepeats: 3,
  maxLoopPeriod: 8,
};

/**
 * Translation output legitimately repeats function words, so the penalty is
 * lighter and the n-gram window longer; only clear loops are blocked.
 */
export const TRANSLATION_GUARDS: RepetitionGuardConfig = {
  repetitionPenalty: 1.05,
  noRepeatNgramSize: 6,
  loopRepeats: 3,
  maxLoopPeriod: 8,
};

/**
 * Scratch mask reused across calls to avoid allocating a vocabulary-sized array
 * per token. Safe despite concurrent transcription and translation: every use
 * is inside one synchronous call with no await between marking and clearing.
 */
let scratchMask: Uint8Array | null = null;

function maskFor(size: number): Uint8Array {
  if (!scratchMask || scratchMask.length < size) {
    scratchMask = new Uint8Array(size);
  }
  return scratchMask;
}

function lastLogitsWindow(
  logits: OrtTensor,
  fallbackVocabSize: number,
): { data: Float32Array; offset: number; vocabSize: number } {
  const dims = logits.dims;
  const seqLen = dims.length >= 2 ? Number(dims[1]) : 1;
  const vocabSize = dims.length >= 3 ? Number(dims[2]) : fallbackVocabSize;
  return {
    data: logits.data as Float32Array,
    offset: (seqLen - 1) * vocabSize,
    vocabSize,
  };
}

/**
 * Tokens that would complete an n-gram already present in `generated`.
 *
 * Takes the last n-1 tokens as a prefix and bans whatever followed that same
 * prefix earlier in the sequence.
 */
function bannedByNoRepeatNgram(
  generated: number[],
  ngramSize: number,
): number[] {
  if (ngramSize <= 1 || generated.length < ngramSize) return [];

  const prefixLength = ngramSize - 1;
  const prefixStart = generated.length - prefixLength;
  const banned: number[] = [];

  for (let i = 0; i + prefixLength < generated.length; i++) {
    let matches = true;
    for (let j = 0; j < prefixLength; j++) {
      if (generated[i + j] !== generated[prefixStart + j]) {
        matches = false;
        break;
      }
    }
    if (matches) banned.push(generated[i + prefixLength]);
  }
  return banned;
}

/**
 * Length of the repeating cycle at the end of `generated`, or null if there is
 * none. Returns the shortest period, so callers know exactly how many tokens
 * the loop occupies and can drop precisely those.
 *
 * Only the tail is examined: a phrase repeated once earlier in a long
 * transcript does not trip it, the model has to still be looping right now.
 */
export function detectLoopPeriod(
  generated: number[],
  config: RepetitionGuardConfig,
): number | null {
  const { loopRepeats, maxLoopPeriod } = config;
  if (loopRepeats < 2) return null;

  for (let period = 1; period <= maxLoopPeriod; period++) {
    const span = period * loopRepeats;
    if (generated.length < span) break;

    const start = generated.length - span;
    let looping = true;
    for (let i = 0; i < period * (loopRepeats - 1) && looping; i++) {
      if (generated[start + i] !== generated[start + i + period]) {
        looping = false;
      }
    }
    if (looping) return period;
  }
  return null;
}

/**
 * Greedy pick with the repetition guards applied.
 *
 * Runs one linear pass over the vocabulary while skipping the handful of
 * adjusted tokens (marked in a reusable mask), then compares the winner against
 * those adjusted tokens separately. That keeps the cost at one pass even with a
 * 256k-token vocabulary, where a per-token map lookup would be the dominant
 * cost of the whole decode step.
 */
export function selectNextToken(
  logits: OrtTensor,
  fallbackVocabSize: number,
  generated: number[],
  config: RepetitionGuardConfig,
): number {
  const { data, offset, vocabSize } = lastLogitsWindow(
    logits,
    fallbackVocabSize,
  );

  if (generated.length === 0) {
    let bestId = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < vocabSize; i++) {
      if (data[offset + i] > bestValue) {
        bestValue = data[offset + i];
        bestId = i;
      }
    }
    return bestId;
  }

  const { repetitionPenalty, noRepeatNgramSize } = config;
  const mask = maskFor(vocabSize);
  const touched: number[] = [];

  const mark = (token: number, flag: number) => {
    if (token < 0 || token >= vocabSize) return;
    if (mask[token] === 0) touched.push(token);
    mask[token] |= flag;
  };

  const PENALISED = 1;
  const BANNED = 2;

  if (repetitionPenalty !== 1) {
    for (const token of generated) mark(token, PENALISED);
  }
  if (noRepeatNgramSize > 1) {
    for (const token of bannedByNoRepeatNgram(generated, noRepeatNgramSize)) {
      mark(token, BANNED);
    }
  }

  let bestId = -1;
  let bestValue = -Infinity;

  for (let i = 0; i < vocabSize; i++) {
    if (mask[i] !== 0) continue;
    const value = data[offset + i];
    if (value > bestValue) {
      bestValue = value;
      bestId = i;
    }
  }

  // Penalised tokens stay eligible, just demoted. Banned ones never are.
  for (const token of touched) {
    if ((mask[token] & BANNED) !== 0) continue;
    const raw = data[offset + token];
    // Hugging Face convention: dividing a negative logit would *raise* it, so
    // negatives are multiplied instead. Both push the token down.
    const value = raw > 0 ? raw / repetitionPenalty : raw * repetitionPenalty;
    if (value > bestValue) {
      bestValue = value;
      bestId = token;
    }
  }

  for (const token of touched) mask[token] = 0;
  touched.length = 0;

  // Every token banned is pathological but survivable: fall back to raw argmax
  // so the caller gets a token and the loop detector ends the sequence.
  if (bestId < 0) {
    let fallbackId = 0;
    let fallbackValue = -Infinity;
    for (let i = 0; i < vocabSize; i++) {
      if (data[offset + i] > fallbackValue) {
        fallbackValue = data[offset + i];
        fallbackId = i;
      }
    }
    return fallbackId;
  }

  return bestId;
}
