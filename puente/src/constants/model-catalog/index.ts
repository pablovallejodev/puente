/**
 * Catalog lookups and pair-budget helpers.
 *
 * The catalog is data (models.ts) and vocabulary (types.ts); this module is the
 * only place that queries it, so callers never scan arrays themselves.
 */

import {
  APP_OVERHEAD_BYTES,
  PAIR_BUDGET_FRACTION,
} from "@/constants/model-catalog/guidance";
import {
  ASR_MODELS,
  MT_MODELS,
  SILERO_VAD_MODEL_ID,
  VAD_MODELS,
} from "@/constants/model-catalog/models";
import type { PresetMode } from "@/constants/model-catalog/modes";
import {
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
  RAM_TIER_LABEL,
} from "@/constants/model-catalog/types";
export type {
  AsrModelSpec,
  AsrRuntime,
  EngineId,
  LanguageDetection,
  LlamaMtRuntime,
  ModelFileSpec,
  ModelLicense,
  ModelRamTier,
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
  APP_OVERHEAD_BYTES,
  GUIDANCE,
  PAIR_BUDGET_FRACTION,
} from "@/constants/model-catalog/guidance";
export {
  ASR_MODELS,
  MT_MODELS,
  SILERO_VAD_MODEL_ID,
  VAD_MODELS,
} from "@/constants/model-catalog/models";
export {
  PRESET_MODES,
  resolveActiveMode,
  type ModelModeId,
  type PresetMode,
  type PresetModeId,
} from "@/constants/model-catalog/modes";

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
// Pair RAM budget
// ---------------------------------------------------------------------------

const DEFAULT_MT_ID = "nllb-600m-q8";
const LIGHTEST_ASR_ID = "whisper-tiny-q";

/** Peak for ASR + MT + VAD — what the engines claim inside the process. */
export function pairPeakRamBytes(
  asrPeakBytes: number,
  mtPeakBytes: number,
  vadPeakBytes: number = requireModelSpec(SILERO_VAD_MODEL_ID).peakRamBytes,
): number {
  return asrPeakBytes + mtPeakBytes + vadPeakBytes + APP_OVERHEAD_BYTES;
}

/** Peak RAM for a concrete ASR+MT pair (includes VAD). */
export function modePairPeakBytes(asrId: string, mtId: string): number {
  return pairPeakRamBytes(
    requireModelSpec(asrId).peakRamBytes,
    requireModelSpec(mtId).peakRamBytes,
  );
}

export function presetModePeakBytes(mode: PresetMode): number {
  return modePairPeakBytes(mode.asrId, mode.mtId);
}

/** Bytes of Device.totalMemory the pair is allowed to claim. */
export function pairBudgetBytes(
  totalMemoryBytes: number | null,
): number | null {
  if (totalMemoryBytes == null || totalMemoryBytes <= 0) return null;
  return totalMemoryBytes * PAIR_BUDGET_FRACTION;
}

/** True when the loaded pair should fit without thrashing. */
export function pairFitsDevice(
  asrPeakBytes: number,
  mtPeakBytes: number,
  totalMemoryBytes: number | null,
  vadPeakBytes?: number,
): boolean {
  const budget = pairBudgetBytes(totalMemoryBytes);
  if (budget == null) return false;
  return pairPeakRamBytes(asrPeakBytes, mtPeakBytes, vadPeakBytes) <= budget;
}

/**
 * Default companion peak when the other task is not selected yet: NLLB for ASR
 * cards, Tiny for MT cards (lightest honest pair for card warnings only).
 */
export function defaultCompanionPeakBytes(spec: ModelSpec): number {
  if (spec.task === "asr") return requireModelSpec(DEFAULT_MT_ID).peakRamBytes;
  if (spec.task === "mt") return requireModelSpec(LIGHTEST_ASR_ID).peakRamBytes;
  return 0;
}

/**
 * True when this model, next to its companion, exceeds the pair budget.
 *
 * `companionPeakBytes` should be the selected model of the other task when
 * known; otherwise the default companion is used.
 */
export function isBelowRecommendedRam(
  spec: ModelSpec,
  totalMemoryBytes: number | null,
  companionPeakBytes: number = defaultCompanionPeakBytes(spec),
): boolean {
  if (totalMemoryBytes == null) return false;
  if (spec.task === "vad") {
    return totalMemoryBytes < spec.minRecommendedRamBytes;
  }
  return !pairFitsDevice(
    spec.task === "asr" ? spec.peakRamBytes : companionPeakBytes,
    spec.task === "mt" ? spec.peakRamBytes : companionPeakBytes,
    totalMemoryBytes,
  );
}

/** True when the currently selected ASR+MT pair exceeds the device budget. */
export function exceedsPairBudget(
  asrPeakBytes: number,
  mtPeakBytes: number,
  totalMemoryBytes: number | null,
): boolean {
  if (totalMemoryBytes == null) return false;
  return !pairFitsDevice(asrPeakBytes, mtPeakBytes, totalMemoryBytes);
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
