/**
 * Catalog lookups and device recommendations.
 *
 * The catalog is data (models.ts) and vocabulary (types.ts); this module is the
 * only place that queries it, so callers never scan arrays themselves.
 */

import {
  ASR_MODELS,
  MT_MODELS,
  SILERO_VAD_MODEL_ID,
  VAD_MODELS,
} from "@/constants/model-catalog/models";
import {
  RAM_TIER,
  type AsrModelSpec,
  type EngineId,
  type ModelSpec,
  type ModelTask,
  type MtModelSpec,
  type VadModelSpec,
} from "@/constants/model-catalog/types";

export {
  ALL_LANGUAGE_IDS,
  ENGINE_LABEL,
  engineOf,
  GB,
  LICENSE,
  MB,
  RAM_TIER,
} from "@/constants/model-catalog/types";
export type {
  AsrModelSpec,
  AsrRuntime,
  EngineId,
  LanguageDetection,
  LlamaMtRuntime,
  ModelFileSpec,
  ModelLicense,
  ModelRuntime,
  ModelSpec,
  ModelTask,
  MtModelSpec,
  MtRuntime,
  OrtNllbRuntime,
  OrtSileroVadRuntime,
  OrtWhisperRuntime,
  SherpaAsrRuntime,
  SherpaModelType,
  VadModelSpec,
  VadRuntime,
} from "@/constants/model-catalog/types";
export {
  ASR_MODELS,
  MT_MODELS,
  SILERO_VAD_MODEL_ID,
  VAD_MODELS,
} from "@/constants/model-catalog/models";

export const ALL_MODELS: ModelSpec[] = [
  ...ASR_MODELS,
  ...MT_MODELS,
  ...VAD_MODELS,
];

const BY_ID = new Map<string, ModelSpec>(ALL_MODELS.map((m) => [m.id, m]));

export function getModelSpec(id: string): ModelSpec | undefined {
  return BY_ID.get(id);
}

export function requireModelSpec(id: string): ModelSpec {
  const spec = BY_ID.get(id);
  if (!spec) throw new Error(`Unknown model id: ${id}`);
  return spec;
}

/** Narrowed lookups so callers get the right runtime union without casting. */
export function getAsrModelSpec(id: string): AsrModelSpec | undefined {
  const spec = BY_ID.get(id);
  return spec?.task === "asr" ? spec : undefined;
}

export function getMtModelSpec(id: string): MtModelSpec | undefined {
  const spec = BY_ID.get(id);
  return spec?.task === "mt" ? spec : undefined;
}

export function getVadModelSpec(id: string): VadModelSpec | undefined {
  const spec = BY_ID.get(id);
  return spec?.task === "vad" ? spec : undefined;
}

export function modelsForTask(task: ModelTask): ModelSpec[] {
  return ALL_MODELS.filter((m) => m.task === task);
}

export function modelsForEngine(engine: EngineId): ModelSpec[] {
  return ALL_MODELS.filter((m) => m.runtime.engine === engine);
}

export function supportsLanguage(spec: ModelSpec, languageId: string): boolean {
  return spec.languageIds.includes(languageId);
}

// ---------------------------------------------------------------------------
// Device recommendation
// ---------------------------------------------------------------------------

export type ModelRecommendation = {
  asrId: string;
  mtId: string;
  vadId: string;
};

/**
 * The safe default set for a device, not the best one it could run.
 *
 * This drives the one-tap "prepare my phone" flow, which downloads whatever it
 * returns, so it stays on the small end: NLLB covers every language in the app
 * at 870 MB, and the VAD is 2 MB and helps on any device. Anyone who wants
 * Parakeet, Turbo or SalamandraTA picks them deliberately, having seen the size.
 */
export function recommendForDevice(
  totalMemoryBytes: number | null,
): ModelRecommendation {
  // Unknown memory is treated as the worst case: a wrong guess downwards costs
  // some accuracy, a wrong guess upwards costs the process.
  const asrId =
    totalMemoryBytes == null || totalMemoryBytes < RAM_TIER.mid
      ? "whisper-tiny-q"
      : totalMemoryBytes < RAM_TIER.flagship
        ? "whisper-base-q"
        : "whisper-small-q";

  return { asrId, mtId: "nllb-600m-q8", vadId: SILERO_VAD_MODEL_ID };
}

/** True when the device has less memory than the model asks for. */
export function isBelowRecommendedRam(
  spec: ModelSpec,
  totalMemoryBytes: number | null,
): boolean {
  return (
    totalMemoryBytes != null && totalMemoryBytes < spec.minRecommendedRamBytes
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}
