/**
 * The contract the segmenter speaks to, so the state machine never has to know
 * whether the decision came from an RMS threshold or from a neural net.
 *
 * `score` returns an arbitrary "speechiness" scale, not a normalised
 * probability: Silero returns 0..1, the energy detector returns a
 * signal-to-noise ratio that is unbounded above. Each detector therefore also
 * publishes the two thresholds that apply to its own scale. Two of them,
 * because a single one makes the segmenter chatter on and off around it — the
 * bar to *start* an utterance is higher than the bar to *continue* one.
 */
export interface SpeechDetector {
  /** Human-readable, surfaced in diagnostics so we know which one ran. */
  readonly id: "silero" | "energy";
  /** Window size the detector expects, in samples at 16 kHz. */
  readonly frameSamples: number;
  /** Score at or above which silence becomes speech. */
  readonly startThreshold: number;
  /** Score below which ongoing speech becomes silence. */
  readonly continueThreshold: number;
  /**
   * @param frame        exactly `frameSamples` mono float32 samples
   * @param speechActive whether the segmenter currently considers this speech;
   *                     adaptive detectors use it to avoid learning a noise
   *                     floor from the voice they are supposed to detect
   */
  score(frame: Float32Array, speechActive: boolean): number | Promise<number>;
  /** Forget per-utterance state. */
  reset(): void;
  dispose(): void;
}
