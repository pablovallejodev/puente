/**
 * RMS-with-adaptive-noise-floor detector: the original Puente endpointer,
 * preserved verbatim in behaviour and demoted to a fallback for devices where
 * the Silero model is not installed.
 *
 * It scores frames as a signal-to-noise ratio rather than a probability, which
 * is why its thresholds are 1.8 and 1.25 rather than something in 0..1: those
 * are the multiples of the running noise floor that the original code used.
 *
 * Ponytail: energy cannot distinguish a voice from a fan or a passing car, so
 * this detector feeds Whisper non-speech and Whisper answers with invented
 * sentences. Upgrade path: install the Silero VAD model, which is 2.2 MB.
 */

import type { SpeechDetector } from './detector';

export const ENERGY_FRAME_MS = 50;
export const ENERGY_FRAME_SAMPLES = 800;
/** Absolute floor — the adaptive estimate is clamped to sit at or above this. */
export const ENERGY_FLOOR = 0.008;

const START_MARGIN = 1.8;
const CONTINUE_MARGIN = 1.25;
/** Asymmetric: drop towards a quieter room fast, rise towards a louder one slowly. */
const NOISE_ATTACK = 0.05;
const NOISE_RELEASE = 0.01;

export class EnergyDetector implements SpeechDetector {
  readonly id = 'energy' as const;
  readonly frameSamples = ENERGY_FRAME_SAMPLES;
  readonly startThreshold = START_MARGIN;
  readonly continueThreshold = CONTINUE_MARGIN;

  private noiseFloor = ENERGY_FLOOR;

  score(frame: Float32Array, speechActive: boolean): number {
    const energy = rms(frame);

    if (!speechActive) {
      this.noiseFloor += (energy - this.noiseFloor) * (energy < this.noiseFloor ? NOISE_ATTACK : NOISE_RELEASE);
      this.noiseFloor = Math.max(ENERGY_FLOOR, this.noiseFloor);
    }

    return energy / this.noiseFloor;
  }

  /** The noise floor deliberately survives: the room is the same room. */
  reset(): void {}

  dispose(): void {}
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
