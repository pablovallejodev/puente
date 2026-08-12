/**
 * SpeechDetector façade over the Silero ONNX graph.
 *
 * Thresholds are Silero's own published operating point (0.5 to open) with a
 * lower bar to stay open, so a brief unvoiced consonant in the middle of a word
 * does not split the utterance in two.
 */

import type { SpeechDetector } from './detector';
import { SileroVad } from './silero-vad';

const START_THRESHOLD = 0.5;
const CONTINUE_THRESHOLD = 0.35;

export class SileroDetector implements SpeechDetector {
  readonly id = 'silero' as const;
  readonly frameSamples: number;
  readonly startThreshold = START_THRESHOLD;
  readonly continueThreshold = CONTINUE_THRESHOLD;

  private constructor(private readonly vad: SileroVad) {
    this.frameSamples = vad.frameSamples;
  }

  static async create(modelPath: string, frameSamples: number): Promise<SileroDetector> {
    return new SileroDetector(await SileroVad.create(modelPath, frameSamples));
  }

  score(frame: Float32Array): Promise<number> {
    return this.vad.score(frame);
  }

  reset(): void {
    this.vad.reset();
  }

  dispose(): void {
    this.vad.dispose();
  }
}
