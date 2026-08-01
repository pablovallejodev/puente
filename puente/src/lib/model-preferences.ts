/**
 * Which model the user picked, per task.
 *
 * Preferences are keyed by task ("asr", "mt") rather than by model family,
 * because a task can now be served by several families across three engines:
 * the ASR choice is between Whisper, Parakeet, SenseVoice and Moonshine, and
 * "selectedWhisperModelId" stopped describing it. The old keys are still read
 * once and migrated, so an existing install keeps its model instead of falling
 * back to the recommendation and re-downloading a gigabyte.
 */

import * as SecureStore from "expo-secure-store";

import { getModelSpec } from "@/constants/model-catalog";
import type { ModelTask } from "@/constants/model-catalog";
import { wrapModelError } from "@/lib/model-errors";

/** Only tasks the user chooses between; the VAD is not a preference. */
export type SelectableTask = Extract<ModelTask, "asr" | "mt">;

export const SELECTABLE_TASKS: readonly SelectableTask[] = ["asr", "mt"];

const KEY: Record<SelectableTask, string> = {
  asr: "selectedAsrModelId",
  mt: "selectedMtModelId",
};

/** Pre-multi-engine keys, read once and migrated forward. */
const LEGACY_KEY: Record<SelectableTask, string> = {
  asr: "selectedWhisperModelId",
  mt: "selectedNllbModelId",
};

const KEY_BASE_LANG = "selectedBaseLanguageId";
const KEY_MIC_PAUSED = "micPaused";

export type ModelPreferences = Record<SelectableTask, string | null>;

/**
 * A stored id that is no longer in the catalog, or that now belongs to another
 * task, is treated as absent: the app falls back to the recommendation instead
 * of failing to load a model that cannot exist.
 */
function validate(task: SelectableTask, modelId: string | null): string | null {
  if (!modelId) return null;
  const spec = getModelSpec(modelId);
  return spec?.task === task ? modelId : null;
}

export async function readSelectedModelId(
  task: SelectableTask,
): Promise<string | null> {
  try {
    const current = validate(task, await SecureStore.getItemAsync(KEY[task]));
    if (current) return current;

    const legacy = validate(
      task,
      await SecureStore.getItemAsync(LEGACY_KEY[task]),
    );
    if (legacy) {
      await SecureStore.setItemAsync(KEY[task], legacy);
      await SecureStore.deleteItemAsync(LEGACY_KEY[task]);
    }
    return legacy;
  } catch (err) {
    throw wrapModelError(err, "prefs.read", "MODEL_PREFS_READ_FAILED", true, {
      task,
      key: KEY[task],
    });
  }
}

export async function setSelectedModelId(
  task: SelectableTask,
  modelId: string,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY[task], modelId);
  } catch (err) {
    throw wrapModelError(err, "prefs.write", "MODEL_PREFS_WRITE_FAILED", true, {
      task,
      key: KEY[task],
      modelId,
    });
  }
}

export async function readModelPreferences(): Promise<ModelPreferences> {
  const [asr, mt] = await Promise.all([
    readSelectedModelId("asr"),
    readSelectedModelId("mt"),
  ]);
  return { asr, mt };
}

export async function readSelectedBaseLanguageId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_BASE_LANG);
  } catch (err) {
    throw wrapModelError(err, "prefs.read", "MODEL_PREFS_READ_FAILED", true, {
      key: KEY_BASE_LANG,
    });
  }
}

export async function setSelectedBaseLanguageId(
  languageId: string,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_BASE_LANG, languageId);
  } catch (err) {
    throw wrapModelError(err, "prefs.write", "MODEL_PREFS_WRITE_FAILED", true, {
      key: KEY_BASE_LANG,
      languageId,
    });
  }
}

/** Absent or garbage → mic open (matches the historical default). */
export async function readMicPaused(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY_MIC_PAUSED)) === "1";
  } catch (err) {
    throw wrapModelError(err, "prefs.read", "MODEL_PREFS_READ_FAILED", true, {
      key: KEY_MIC_PAUSED,
    });
  }
}

export async function writeMicPaused(paused: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_MIC_PAUSED, paused ? "1" : "0");
  } catch (err) {
    throw wrapModelError(err, "prefs.write", "MODEL_PREFS_WRITE_FAILED", true, {
      key: KEY_MIC_PAUSED,
      paused,
    });
  }
}

export async function clearModelPreferences(): Promise<void> {
  try {
    await Promise.all([
      ...SELECTABLE_TASKS.map((task) => SecureStore.deleteItemAsync(KEY[task])),
      ...SELECTABLE_TASKS.map((task) =>
        SecureStore.deleteItemAsync(LEGACY_KEY[task]),
      ),
    ]);
  } catch (err) {
    throw wrapModelError(err, "prefs.write", "MODEL_PREFS_WRITE_FAILED", true);
  }
}
