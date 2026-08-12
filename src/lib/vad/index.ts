/**
 * Voice activity detection.
 *
 * Public entry point: `createSpeechDetector()` picks the best detector the
 * device actually has, and never throws — losing the VAD upgrade must not stop
 * someone from using the app, it only means Whisper hears more noise.
 */

import { getVadModelSpec, SILERO_VAD_MODEL_ID } from '@/constants/model-catalog';
import { logDiagnostic } from '@/lib/errors';
import { isModelInstalled } from '@/lib/model-install-state';
import { getModelFilePath, toNativePath } from '@/lib/model-paths';

import type { SpeechDetector } from './detector';
import { EnergyDetector } from './energy-detector';
import { SileroDetector } from './silero-detector';

export type { SpeechDetector } from './detector';
export { EnergyDetector } from './energy-detector';
export { SileroDetector } from './silero-detector';
export { SileroVad } from './silero-vad';
export { MAX_CHUNK_MS, MIN_SPEECH_MS, msToSamples, SAMPLE_RATE, SILENCE_MS, SpeechSegmenter } from './segmenter';

export async function createSpeechDetector(): Promise<SpeechDetector> {
  const spec = getVadModelSpec(SILERO_VAD_MODEL_ID);
  if (!spec) return new EnergyDetector();

  try {
    if (!(await isModelInstalled(spec.id))) return new EnergyDetector();
    const path = toNativePath(getModelFilePath(spec, spec.runtime.modelFile));
    return await SileroDetector.create(path, spec.runtime.frameSamples);
  } catch (err) {
    // A corrupt or unloadable VAD model degrades the experience; it must not
    // break it. The diagnostic tells us why in the log.
    logDiagnostic('vad', err);
    return new EnergyDetector();
  }
}
