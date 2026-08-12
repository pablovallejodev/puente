import * as FileSystem from 'expo-file-system/legacy';

import type { ModelSpec } from '@/constants/model-catalog';
import { ModelError } from '@/lib/model-errors';

/**
 * On-disk layout:
 *
 *   documentDirectory/models/{storage}/{id}/            installed model
 *   documentDirectory/models/{storage}/{id}/.complete   install marker
 *   documentDirectory/models/{storage}/{id}.partial/    in-flight download
 *
 * `storage` comes from the spec rather than from the task so that models
 * shipped before the multi-engine catalog stay where they already are.
 */

export function getModelsRoot(): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new ModelError({
      code: 'MODEL_ENGINE_PATH_MISSING',
      stage: 'engine.load',
      message: 'Directorio de documentos no disponible en este dispositivo',
      recoverable: false,
    });
  }
  return `${root}models/`;
}

export function getStorageDir(storage: string): string {
  return `${getModelsRoot()}${storage}/`;
}

export function getModelDir(spec: ModelSpec): string {
  return `${getStorageDir(spec.storage)}${spec.id}/`;
}

export function getModelPartialDir(spec: ModelSpec): string {
  return `${getStorageDir(spec.storage)}${spec.id}.partial/`;
}

/** Persistent download job (active/paused) next to the partial dir. */
export function getModelDownloadJobPath(spec: ModelSpec): string {
  return `${getStorageDir(spec.storage)}${spec.id}.download.json`;
}

export function getModelFilePath(spec: ModelSpec, relativePath: string): string {
  return `${getModelDir(spec)}${relativePath}`;
}

export function getCompleteMarkerPath(spec: ModelSpec): string {
  return `${getModelDir(spec)}.complete`;
}

/** ONNX Runtime and the native engines take plain paths, not file:// URIs. */
export function toNativePath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}
