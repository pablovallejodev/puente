/** Silence-based endpointing for Whisper chunks (PCM float32 mono @ 16 kHz). */

export const WHISPER_SAMPLE_RATE = 16000;

const SILENCE_MS = 900;
const MAX_CHUNK_MS = 12000;
const MIN_SPEECH_MS = 350;
const ENERGY_THRESHOLD = 0.012;
const FRAME_MS = 50;
const FRAME_SAMPLES = Math.floor((WHISPER_SAMPLE_RATE * FRAME_MS) / 1000);

export type EndpointCallbacks = {
  onSpeechChunk: (pcm: Float32Array) => void;
};

export class WhisperAudioEndpoint {
  private buffer: number[] = [];
  private analyzed = 0;
  private speechStarted = false;
  private silenceSamples = 0;
  private busy = false;
  private readonly onSpeechChunk: (pcm: Float32Array) => void;

  constructor(callbacks: EndpointCallbacks) {
    this.onSpeechChunk = callbacks.onSpeechChunk;
  }

  reset(): void {
    this.buffer = [];
    this.analyzed = 0;
    this.speechStarted = false;
    this.silenceSamples = 0;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
  }

  push(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.buffer.push(samples[i]);
    }
    if (this.busy) return;
    this.analyze();
  }

  flush(): void {
    const minSpeech = msToSamples(MIN_SPEECH_MS);
    if (this.speechStarted && this.buffer.length >= minSpeech) {
      const pcm = Float32Array.from(this.buffer);
      this.reset();
      this.onSpeechChunk(pcm);
    } else {
      this.reset();
    }
  }

  private analyze(): void {
    const maxSamples = msToSamples(MAX_CHUNK_MS);
    const minSpeech = msToSamples(MIN_SPEECH_MS);
    const silenceNeeded = msToSamples(SILENCE_MS);

    while (this.analyzed + FRAME_SAMPLES <= this.buffer.length) {
      const start = this.analyzed;
      const frame = this.buffer.slice(start, start + FRAME_SAMPLES);
      this.analyzed += FRAME_SAMPLES;
      const energy = rms(frame);

      if (energy >= ENERGY_THRESHOLD) {
        this.speechStarted = true;
        this.silenceSamples = 0;
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
      this.buffer.length >= minSpeech &&
      (this.silenceSamples >= silenceNeeded || this.buffer.length >= maxSamples);

    if (shouldCut) {
      // Trim trailing silence a bit but keep some context
      let end = this.buffer.length;
      const trim = Math.min(this.silenceSamples, msToSamples(400));
      end = Math.max(minSpeech, end - trim);
      const pcm = Float32Array.from(this.buffer.slice(0, end));
      this.reset();
      this.onSpeechChunk(pcm);
    }
  }
}

function msToSamples(ms: number): number {
  return Math.floor((WHISPER_SAMPLE_RATE * ms) / 1000);
}

function rms(samples: number[]): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
