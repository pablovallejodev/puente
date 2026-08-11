/**
 * Silero VAD v5 over ONNX Runtime.
 *
 * Why this exists: the previous endpointer decided "this is speech" from RMS
 * energy. Energy cannot tell a voice from a fan, a passing car or a chair
 * scraping, and Whisper responds to non-speech audio by inventing plausible
 * sentences — its single most reported failure. Measured on this exact graph, a
 * 0.5-amplitude tone (RMS ~0.35, forty times the old energy floor, so it sailed
 * through) scores 0.009 here, and white noise at 0.3 amplitude scores 0.03.
 * Those chunks now never reach the transcriber.
 *
 * Graph signature, from the model itself:
 *
 *   input   float32 [1, 512]     one 32 ms window at 16 kHz
 *   state   float32 [2, 1, 128]  recurrent state, carried between frames
 *   sr      int64   scalar       sample rate
 *   output  float32 [1, 1]       speech probability
 *   stateN  float32 [2, 1, 128]  next state
 *
 * The window size comes from the catalog runtime rather than being repeated
 * here, so the number the downloader advertises and the number the tensor is
 * shaped with cannot drift apart.
 *
 * The state is what makes it work across frame boundaries, and also why
 * `reset()` matters between utterances: leftover state from a previous speaker
 * biases the first frames of the next one.
 */

import { Tensor } from "onnxruntime-react-native";
import type { InferenceSession } from "onnxruntime-react-native";

import { EngineError, wrapEngineError } from "@/lib/engine-errors";
import { createOrtSession, releaseOrtSession } from "@/lib/ort/session";

export const SILERO_SAMPLE_RATE = 16000;

const STATE_DIMS = [2, 1, 128];
const STATE_SIZE = STATE_DIMS.reduce((a, b) => a * b, 1);

export class SileroVad {
  private session: InferenceSession | null;
  private state: Tensor;
  private readonly sampleRate: Tensor;

  private constructor(
    session: InferenceSession,
    /** From the catalog runtime; the graph accepts exactly this many samples. */
    readonly frameSamples: number,
  ) {
    this.session = session;
    this.state = SileroVad.emptyState();
    this.sampleRate = new Tensor(
      "int64",
      BigInt64Array.from([BigInt(SILERO_SAMPLE_RATE)]),
      [],
    );
  }

  private static emptyState(): Tensor {
    return new Tensor("float32", new Float32Array(STATE_SIZE), STATE_DIMS);
  }

  static async create(
    modelPath: string,
    frameSamples: number,
  ): Promise<SileroVad> {
    try {
      const { session } = await createOrtSession(modelPath, "aux", {
        label: "silero-vad",
      });
      return new SileroVad(session, frameSamples);
    } catch (err) {
      throw wrapEngineError(err, "vad.load", "VAD_INIT_FAILED", false, {
        modelPath,
      });
    }
  }

  /** Forget recurrent state. Call between utterances. */
  reset(): void {
    this.state = SileroVad.emptyState();
  }

  /**
   * Speech probability for exactly one frame.
   *
   * Short frames are zero-padded rather than rejected so the caller can flush a
   * trailing partial frame; the model tolerates it and the alternative is
   * losing the last 30 ms of every utterance.
   */
  async score(frame: Float32Array): Promise<number> {
    const session = this.session;
    if (!session) {
      throw new EngineError({
        code: "ENGINE_DISPOSED",
        stage: "vad.run",
        message: "El detector de voz ya fue liberado",
        recoverable: true,
      });
    }

    let samples = frame;
    if (samples.length !== this.frameSamples) {
      const padded = new Float32Array(this.frameSamples);
      padded.set(samples.subarray(0, this.frameSamples));
      samples = padded;
    }

    try {
      const outputs = await session.run({
        input: new Tensor("float32", samples, [1, this.frameSamples]),
        state: this.state,
        sr: this.sampleRate,
      });
      this.state = outputs.stateN as Tensor;
      const probability = (outputs.output as Tensor).data as Float32Array;
      return probability[0] ?? 0;
    } catch (err) {
      throw wrapEngineError(err, "vad.run", "VAD_RUN_FAILED", true);
    }
  }

  dispose(): void {
    releaseOrtSession(this.session);
    this.session = null;
  }
}
