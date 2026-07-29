/**
 * ONNX Runtime session tuning.
 *
 * Kept free of React Native imports so the Node golden checks under scripts/
 * exercise the exact same options the app uses. A tuning change that only
 * lands in one of the two would make those checks meaningless.
 *
 * **Graph optimisation is `all`.** The previous `basic` level skipped operator
 * fusion, which is where a quantised transformer gains most on a CPU: fused
 * attention and MatMul+Add avoid materialising intermediate tensors. It costs a
 * few hundred milliseconds once, at session creation.
 *
 * **Thread count depends on the role.** Encoders run one large batched pass and
 * scale across cores. Decoders run a single token at a time, so the work per
 * operator is small and thread synchronisation costs more than the parallelism
 * buys.
 */

import type { InferenceSession } from "onnxruntime-react-native";

export type OrtSessionRole = "encoder" | "decoder" | "aux";

export type OrtProviderName = "xnnpack" | "nnapi" | "coreml" | "cpu";

/**
 * Capped at 4 because phone SoCs pair a few performance cores with several
 * efficiency ones: past the performance cores, extra threads land on slow cores
 * and every operator waits for the slowest of them.
 */
export const THREADS_BY_ROLE: Record<OrtSessionRole, number> = {
  encoder: 4,
  decoder: 2,
  aux: 1,
};

export function buildSessionOptions(
  role: OrtSessionRole,
  provider: OrtProviderName = "cpu",
): InferenceSession.SessionOptions {
  return {
    executionProviders: [provider],
    graphOptimizationLevel: "all",
    intraOpNumThreads: THREADS_BY_ROLE[role],
    // Parallel mode spawns a second pool for independent branches. These graphs
    // are essentially one chain, so it would only add memory and scheduling
    // overhead.
    executionMode: "sequential",
    interOpNumThreads: 1,
    enableCpuMemArena: true,
    enableMemPattern: true,
    // 2 = warning while developing (shows when a provider rejects nodes),
    // 3 = error in release, to keep logcat readable.
    logSeverityLevel: typeof __DEV__ !== "undefined" && __DEV__ ? 2 : 3,
  };
}
