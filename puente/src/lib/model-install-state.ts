import * as FileSystem from "expo-file-system/legacy";

import {
  ALL_MODELS,
  getModelSpec,
  type ModelSpec,
} from "@/constants/model-catalog";
import {
  getCompleteMarkerPath,
  getModelDir,
  getModelFilePath,
} from "@/lib/model-paths";
import { ModelError } from "@/lib/model-errors";

/** Allow ±1% or 4 KiB, whichever is larger (HF vs FS rounding). */
function sizeMatches(expected: number, actual: number): boolean {
  const slack = Math.max(4096, Math.floor(expected * 0.01));
  return Math.abs(expected - actual) <= slack;
}

export async function isModelInstalled(modelId: string): Promise<boolean> {
  const spec = getModelSpec(modelId);
  if (!spec) return false;

  const marker = getCompleteMarkerPath(spec.family, modelId);
  const markerInfo = await FileSystem.getInfoAsync(marker);
  if (!markerInfo.exists) return false;

  for (const file of spec.files) {
    const path = getModelFilePath(spec.family, modelId, file.relativePath);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.size == null) return false;
    if (!sizeMatches(file.expectedBytes, info.size)) return false;
  }
  return true;
}

export async function assertModelInstalled(modelId: string): Promise<ModelSpec> {
  const spec = getModelSpec(modelId);
  if (!spec) {
    throw new ModelError({
      code: "MODEL_UNKNOWN_ID",
      stage: "catalog.resolve",
      message: `Modelo desconocido: ${modelId}`,
      recoverable: false,
      context: { modelId },
    });
  }

  const marker = getCompleteMarkerPath(spec.family, modelId);
  const markerInfo = await FileSystem.getInfoAsync(marker);
  if (!markerInfo.exists) {
    throw new ModelError({
      code: "MODEL_NOT_INSTALLED",
      stage: "install.check",
      message: `El modelo ${modelId} no está instalado`,
      recoverable: true,
      context: { modelId, family: spec.family },
    });
  }

  for (const file of spec.files) {
    const path = getModelFilePath(spec.family, modelId, file.relativePath);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      throw new ModelError({
        code: "MODEL_INCOMPLETE",
        stage: "install.check",
        message: `Falta el fichero ${file.relativePath} del modelo ${modelId}`,
        recoverable: true,
        context: { modelId, missingFile: file.relativePath },
      });
    }
    if (info.size == null || !sizeMatches(file.expectedBytes, info.size)) {
      throw new ModelError({
        code: "MODEL_SIZE_MISMATCH",
        stage: "download.verify",
        message: `Tamaño incorrecto de ${file.relativePath}`,
        recoverable: true,
        context: {
          modelId,
          file: file.relativePath,
          expected: file.expectedBytes,
          actual: info.size ?? 0,
        },
      });
    }
  }

  return spec;
}

export async function listInstalledModelIds(): Promise<string[]> {
  const installed: string[] = [];
  for (const spec of ALL_MODELS) {
    if (await isModelInstalled(spec.id)) {
      installed.push(spec.id);
    }
  }
  return installed;
}

export async function removeModelInstall(modelId: string): Promise<void> {
  const spec = getModelSpec(modelId);
  if (!spec) return;
  const dir = getModelDir(spec.family, modelId);
  await FileSystem.deleteAsync(dir, { idempotent: true });
}
