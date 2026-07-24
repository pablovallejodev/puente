import * as FileSystem from "expo-file-system/legacy";

import type { ModelFamily } from "@/constants/model-catalog";
import { ModelError } from "@/lib/model-errors";

export function getModelsRoot(): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new ModelError({
      code: "MODEL_ENGINE_PATH_MISSING",
      stage: "engine.load",
      message: "Directorio de documentos no disponible en este dispositivo",
      recoverable: false,
    });
  }
  return `${root}models/`;
}

export function getFamilyDir(family: ModelFamily): string {
  return `${getModelsRoot()}${family}/`;
}

export function getModelDir(family: ModelFamily, modelId: string): string {
  return `${getFamilyDir(family)}${modelId}/`;
}

export function getModelPartialDir(family: ModelFamily, modelId: string): string {
  return `${getFamilyDir(family)}${modelId}.partial/`;
}

export function getModelFilePath(
  family: ModelFamily,
  modelId: string,
  relativePath: string,
): string {
  return `${getModelDir(family, modelId)}${relativePath}`;
}

export function getCompleteMarkerPath(family: ModelFamily, modelId: string): string {
  return `${getModelDir(family, modelId)}.complete`;
}

export function toOrtPath(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}
