import * as SecureStore from "expo-secure-store";

import { wrapModelError } from "@/lib/model-errors";

const KEY_WHISPER = "selectedWhisperModelId";
const KEY_NLLB = "selectedNllbModelId";

export type ModelPreferences = {
  selectedWhisperModelId: string | null;
  selectedNllbModelId: string | null;
};

export async function readModelPreferences(): Promise<ModelPreferences> {
  try {
    const [whisper, nllb] = await Promise.all([
      SecureStore.getItemAsync(KEY_WHISPER),
      SecureStore.getItemAsync(KEY_NLLB),
    ]);
    return {
      selectedWhisperModelId: whisper,
      selectedNllbModelId: nllb,
    };
  } catch (err) {
    throw wrapModelError(err, "prefs.read", "MODEL_PREFS_READ_FAILED", true, {
      key: "selected*",
    });
  }
}

export async function setSelectedWhisperModelId(modelId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_WHISPER, modelId);
  } catch (err) {
    throw wrapModelError(err, "prefs.write", "MODEL_PREFS_WRITE_FAILED", true, {
      key: KEY_WHISPER,
      modelId,
    });
  }
}

export async function setSelectedNllbModelId(modelId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_NLLB, modelId);
  } catch (err) {
    throw wrapModelError(err, "prefs.write", "MODEL_PREFS_WRITE_FAILED", true, {
      key: KEY_NLLB,
      modelId,
    });
  }
}

export async function clearModelPreferences(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_WHISPER),
      SecureStore.deleteItemAsync(KEY_NLLB),
    ]);
  } catch (err) {
    throw wrapModelError(err, "prefs.write", "MODEL_PREFS_WRITE_FAILED", true);
  }
}
