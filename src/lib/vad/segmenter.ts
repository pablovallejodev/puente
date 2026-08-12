/**
 * Turns a continuous microphone stream into utterance-sized chunks.
 *
 * The state machine is the one Puente already shipped — hysteresis, pre-roll,
 * trailing keep, minimum speech, hard ceiling — lifted out of
 * whisper-audio-endpoint and generalised over a pluggable SpeechDetector so the
 * same segmentation applies whether the frames are judged by RMS or by Silero.
 *
 * The one structural change is that scoring is now async, because a neural
 * detector runs an ONNX session per frame. Audio keeps arriving during that
 * await, so `push` appends and kicks a non-reentrant pump rather than analysing
 * inline; the pump drains whatever accumulated.
 */

import type { SpeechDetector } from './detector';

export const SAMPLE_RATE = 16000;

/** Silence that ends an utterance. */
export const SILENCE_MS = 900;
/** Hard ceiling on one chunk: Whisper's receptive field is 30 s, we stay well under. */
export const MAX_CHUNK_MS = 12000;
/** Below this an "utterance" is a cough, not a sentence. */
export const MIN_SPEECH_MS = 350;
/** Audio kept before the first speech frame, so plosives are not clipped. */
export const PRE_ROLL_MS = 200;
/** Silence kept after the last speech frame, so trailing vowels are not clipped. */
export const TRAILING_KEEP_MS = 250;

export type SegmenterCallbacks = {
  onSpeechChunk: (pcm: Float32Array) => void;
};

export class SpeechSegmenter {
  private readonly detector: SpeechDetector;
  private readonly onSpeechChunk: (pcm: Float32Array) => void;
  private readonly frameSamples: number;
  private readonly minActiveFrames: number;

  private buffer: number[] = [];
  private analyzed = 0;
  private speechStarted = false;
  private silenceSamples = 0;
  private activeFrames = 0;

  private draining: Promise<void> | null = null;
  private flushRequested = false;
  private disposed = false;

  constructor(detector: SpeechDetector, callbacks: SegmenterCallbacks) {
    this.detector = detector;
    this.onSpeechChunk = callbacks.onSpeechChunk;
    this.frameSamples = detector.frameSamples;
    this.minActiveFrames = Math.max(1, Math.ceil(msToSamples(MIN_SPEECH_MS) / this.frameSamples));
  }

  get detectorId(): SpeechDetector['id'] {
    return this.detector.id;
  }

  reset(): void {
    this.buffer = [];
    this.analyzed = 0;
    this.speechStarted = false;
    this.silenceSamples = 0;
    this.activeFrames = 0;
    this.flushRequested = false;
    this.detector.reset();
  }

  push(samples: Float32Array): void {
    if (this.disposed) return;
    for (let i = 0; i < samples.length; i++) {
      this.buffer.push(samples[i]);
    }
    void this.pump();
  }

  /**
   * Emit whatever is buffered if it qualifies as speech, then reset.
   *
   * Resolves once the request has actually been served, so a caller that awaits
   * it knows the chunk was delivered. Callers that do not care — the stop
   * button — can fire and forget.
   */
  async flush(): Promise<void> {
    if (this.disposed) return;
    this.flushRequested = true;
    // A drain already in flight may have passed its flush check moments ago, in
    // which case awaiting it is not enough and a fresh one has to run. The flag
    // is cleared by whichever drain serves it, so this loops at most twice.
    while (this.flushRequested && !this.disposed) {
      await this.pump();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.buffer = [];
    this.detector.dispose();
  }

  /** Never runs two drains at once: concurrent callers share the in-flight one. */
  private pump(): Promise<void> {
    this.draining ??= this.drain().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async drain(): Promise<void> {
    while (!this.disposed) {
      if (await this.step()) continue;
      if (this.flushRequested) {
        this.flushRequested = false;
        this.emitFlush();
        continue;
      }
      break;
    }
  }

  /** Consume at most one frame. Returns false when there is nothing left to do. */
  private async step(): Promise<boolean> {
    if (this.analyzed + this.frameSamples > this.buffer.length) return false;

    const start = this.analyzed;
    const frame = new Float32Array(this.frameSamples);
    for (let i = 0; i < this.frameSamples; i++) {
      frame[i] = this.buffer[start + i];
    }

    const score = await this.detector.score(frame, this.speechStarted);
    if (this.disposed) return false;

    // The buffer can only have grown during the await, never shrunk: only one
    // drain runs at a time and every trim below is synchronous.
    this.analyzed += this.frameSamples;

    const threshold = this.speechStarted ? this.detector.continueThreshold : this.detector.startThreshold;

    if (score >= threshold) {
      this.speechStarted = true;
      this.silenceSamples = 0;
      this.activeFrames += 1;
    } else if (this.speechStarted) {
      this.silenceSamples += this.frameSamples;
    }

    this.dropIdleHistory();
    this.cutIfDue();
    return true;
  }

  /**
   * While nobody is speaking, keep only enough scored history for pre-roll.
   *
   * This both bounds the buffer during a silent room and *is* the pre-roll: an
   * utterance starts with exactly PRE_ROLL_MS of audio already in front of it,
   * so plosives are not clipped and no separate trim is needed.
   *
   * Only scored audio is ever dropped. Discarding samples the detector has not
   * seen would silently skip frames, which is how an endpointer starts missing
   * the first word of every sentence.
   */
  private dropIdleHistory(): void {
    if (this.speechStarted) return;
    const drop = this.analyzed - msToSamples(PRE_ROLL_MS);
    if (drop <= 0) return;
    this.buffer.splice(0, drop);
    this.analyzed -= drop;
  }

  private cutIfDue(): void {
    const maxSamples = msToSamples(MAX_CHUNK_MS);
    const silenceNeeded = msToSamples(SILENCE_MS);

    const due =
      this.speechStarted &&
      this.activeFrames >= this.minActiveFrames &&
      (this.silenceSamples >= silenceNeeded || this.buffer.length >= maxSamples);
    if (!due) return;

    let end = this.buffer.length;
    if (this.buffer.length >= maxSamples) {
      end = maxSamples;
    } else {
      const trim = Math.max(0, this.silenceSamples - msToSamples(TRAILING_KEEP_MS));
      end = Math.max(msToSamples(MIN_SPEECH_MS), end - trim);
    }
    this.emitSlice(end);
  }

  private emitFlush(): void {
    if (this.speechStarted && this.activeFrames >= this.minActiveFrames) {
      this.emitSlice(this.buffer.length);
      return;
    }
    this.reset();
  }

  /** Emit [0, end) and keep the exact remainder as the head of the next utterance. */
  private emitSlice(end: number): void {
    const cut = Math.max(0, Math.min(end, this.buffer.length));
    if (cut < msToSamples(MIN_SPEECH_MS) || this.activeFrames < this.minActiveFrames) {
      this.reset();
      return;
    }

    const pcm = Float32Array.from(this.buffer.slice(0, cut));
    this.buffer = this.buffer.slice(cut);
    this.analyzed = 0;
    this.speechStarted = false;
    this.silenceSamples = 0;
    this.activeFrames = 0;
    // Recurrent state belongs to the utterance we just closed; carrying it into
    // the next one biases its opening frames.
    this.detector.reset();
    this.onSpeechChunk(pcm);
  }
}

export function msToSamples(ms: number): number {
  return Math.floor((SAMPLE_RATE * ms) / 1000);
}
