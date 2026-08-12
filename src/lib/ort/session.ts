/**
 * Creating ONNX Runtime sessions on device.
 *
 * Execution providers are tried in order and the first one that yields a
 * session wins. XNNPACK leads the ladder because these are int8 CPU graphs and
 * its quantised ARM kernels are the fastest available. NNAPI is deliberately
 * *not* in the default ladder: it cannot run most operators of a dynamically
 * quantised transformer, so it partitions the graph, bounces tensors between
 * backends and ends up slower than plain CPU — besides being deprecated from
 * Android 15. It is exported below for anyone who wants to measure it.
 *
 * Session tuning itself lives in session-options.ts, which the Node checks
 * share.
 */

import { InferenceSession } from 'onnxruntime-react-native';
import { Platform } from 'react-native';

import { buildSessionOptions, type OrtProviderName, type OrtSessionRole } from '@/lib/ort/session-options';

export {
  buildSessionOptions,
  THREADS_BY_ROLE,
  type OrtProviderName,
  type OrtSessionRole,
} from '@/lib/ort/session-options';

export function defaultProviderLadder(): OrtProviderName[] {
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    return ['xnnpack', 'cpu'];
  }
  return ['cpu'];
}

/**
 * Opt-in ladder for benchmarking NNAPI. Read the note at the top of this file
 * before reaching for it.
 */
export const NNAPI_PROVIDER_LADDER: OrtProviderName[] = ['nnapi', 'cpu'];

export type OrtSessionHandle = {
  session: InferenceSession;
  /** Provider that actually accepted the graph. */
  provider: OrtProviderName;
};

/** Provider chosen per label, for diagnostics. */
const lastProvider = new Map<string, OrtProviderName>();

export function lastProviderFor(label: string): OrtProviderName | undefined {
  return lastProvider.get(label);
}

/**
 * Create a session, walking the provider ladder.
 *
 * A provider refusing the graph is expected, not exceptional: a build without
 * XNNPACK simply falls through to CPU. Only if every provider fails does this
 * throw, and it throws the *first* error, which is the informative one — by the
 * time CPU fails too, the message is usually just "not a valid ONNX model".
 */
export async function createOrtSession(
  modelPath: string,
  role: OrtSessionRole,
  options?: { label?: string; providers?: OrtProviderName[] },
): Promise<OrtSessionHandle> {
  const providers = options?.providers ?? defaultProviderLadder();
  const label = options?.label ?? role;
  let firstError: unknown;

  for (const provider of providers) {
    try {
      const session = await InferenceSession.create(modelPath, buildSessionOptions(role, provider));
      lastProvider.set(label, provider);
      if (__DEV__ && provider !== providers[0]) {
        console.info(`[ort] ${label}: "${providers[0]}" no disponible, usando "${provider}"`);
      }
      return { session, provider };
    } catch (err) {
      firstError ??= err;
    }
  }

  throw firstError ?? new Error(`No se pudo crear la sesión ONNX (${label})`);
}

export function releaseOrtSession(session: InferenceSession | null): void {
  if (!session) return;
  try {
    if (typeof session.release === 'function') {
      session.release();
    }
  } catch {
    // Releasing twice, or after the native module went away, is harmless.
  }
}

/**
 * True when the failure means the native ONNX Runtime module was never linked,
 * which no retry can fix.
 */
export function isOrtNotRegistered(message: string): boolean {
  return (
    message.includes('OrtApi is not initialized') ||
    message.includes('onnxruntime-react-native') ||
    /\binstall\b/.test(message)
  );
}
