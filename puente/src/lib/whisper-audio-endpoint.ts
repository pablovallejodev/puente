/** Energy + hysteresis endpointing for Whisper chunks (PCM float32 mono @ 16 kHz). */

export const WHISPER_SAMPLE_RATE = 16000;

export const SILENCE_MS = 900;
export const MAX_CHUNK_MS = 12000;
export const MIN_SPEECH_MS = 350;
/** Absolute floor — adaptive noise sits above this. */
export const ENERGY_FLOOR = 0.008;
export const FRAME_MS = 50;
export const FRAME_SAMPLES = Math.floor((WHISPER_SAMPLE_RATE * FRAME_MS) / 1000);
/** Frames of speech required before a cut is allowed (not just buffer length). */
export const MIN_ACTIVE_FRAMES = Math.max(1, Math.ceil(MIN_SPEECH_MS / FRAME_MS));
const START_MARGIN = 1.8;
const CONTINUE_MARGIN = 1.25;
const NOISE_ATTACK = 0.05;
const NOISE_RELEASE = 0.01;
const PRE_ROLL_FRAMES = 4;
const TRAILING_KEEP_MS = 250;

export type EndpointCallbacks = {
  onSpeechChunk: (pcm: Float32Array) => void;
};

export class WhisperAudioEndpoint {
  private buffer: number[] = [];
  private analyzed = 0;
  private speechStarted = false;
  private silenceSamples = 0;
  private activeFrames = 0;
  private noiseFloor = ENERGY_FLOOR;
  private readonly onSpeechChunk: (pcm: Float32Array) => void;

  constructor(callbacks: EndpointCallbacks) {
    this.onSpeechChunk = callbacks.onSpeechChunk;
  }

  reset(): void {
    this.buffer = [];
    this.analyzed = 0;
    this.speechStarted = false;
    this.silenceSamples = 0;
    this.activeFrames = 0;
  }

  push(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.buffer.push(samples[i]);
    }
    this.analyze();
  }

  flush(): void {
    const minSpeech = msToSamples(MIN_SPEECH_MS);
    if (this.speechStarted && this.activeFrames >= MIN_ACTIVE_FRAMES) {
      if (this.buffer.length >= minSpeech) {
        this.emitSlice(this.buffer.length);
        return;
      }
    }
    this.reset();
  }

  private analyze(): void {
    const maxSamples = msToSamples(MAX_CHUNK_MS);
    const silenceNeeded = msToSamples(SILENCE_MS);

    while (this.analyzed + FRAME_SAMPLES <= this.buffer.length) {
      const start = this.analyzed;
      const frame = this.buffer.slice(start, start + FRAME_SAMPLES);
      this.analyzed += FRAME_SAMPLES;
      const energy = rms(frame);

      if (!this.speechStarted) {
        this.noiseFloor +=
          (energy - this.noiseFloor) *
          (energy < this.noiseFloor ? NOISE_ATTACK : NOISE_RELEASE);
        this.noiseFloor = Math.max(ENERGY_FLOOR, this.noiseFloor);
      }

      const startThreshold = Math.max(
        ENERGY_FLOOR * START_MARGIN,
        this.noiseFloor * START_MARGIN,
      );
      const continueThreshold = Math.max(
        ENERGY_FLOOR,
        this.noiseFloor * CONTINUE_MARGIN,
      );
      const threshold = this.speechStarted ? continueThreshold : startThreshold;

      if (energy >= threshold) {
        if (!this.speechStarted) {
          this.speechStarted = true;
          this.trimPreRoll(start);
        }
        this.silenceSamples = 0;
        this.activeFrames += 1;
      } else if (this.speechStarted) {
        this.silenceSamples += FRAME_SAMPLES;
      }
    }

    // Drop long leading silence before first speech
    if (!this.speechStarted && this.buffer.length > WHISPER_SAMPLE_RATE) {
      const keep = Math.floor(WHISPER_SAMPLE_RATE / 2);
      const drop = this.buffer.length - keep;
      this.buffer.splice(0, drop);
      this.analyzed = Math.max(0, this.analyzed - drop);
    }

    const shouldCut =
      this.speechStarted &&
      this.activeFrames >= MIN_ACTIVE_FRAMES &&
      (this.silenceSamples >= silenceNeeded || this.buffer.length >= maxSamples);

    if (shouldCut) {
      let end = this.buffer.length;
      if (this.buffer.length >= maxSamples) {
        end = maxSamples;
      } else {
        const trim = Math.min(
          this.silenceSamples,
          Math.max(0, this.silenceSamples - msToSamples(TRAILING_KEEP_MS)),
        );
        end = Math.max(msToSamples(MIN_SPEECH_MS), end - trim);
      }
      this.emitSlice(end);
    }
  }

  private trimPreRoll(speechFrameStart: number): void {
    const keep = PRE_ROLL_FRAMES * FRAME_SAMPLES;
    const drop = Math.max(0, speechFrameStart - keep);
    if (drop <= 0) return;
    this.buffer.splice(0, drop);
    this.analyzed = Math.max(0, this.analyzed - drop);
  }

  /** Emit [0, end) and keep the exact remainder for the next utterance. */
  private emitSlice(end: number): void {
    const cut = Math.max(0, Math.min(end, this.buffer.length));
    if (cut < msToSamples(MIN_SPEECH_MS) || this.activeFrames < MIN_ACTIVE_FRAMES) {
      this.reset();
      return;
    }
    const pcm = Float32Array.from(this.buffer.slice(0, cut));
    const remainder = this.buffer.slice(cut);
    this.buffer = remainder;
    this.analyzed = 0;
    this.speechStarted = false;
    this.silenceSamples = 0;
    this.activeFrames = 0;
    this.onSpeechChunk(pcm);
    if (this.buffer.length >= FRAME_SAMPLES) {
      this.analyze();
    }
  }
}

export function msToSamples(ms: number): number {
  return Math.floor((WHISPER_SAMPLE_RATE * ms) / 1000);
}

export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}
