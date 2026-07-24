import * as FileSystem from "expo-file-system/legacy";
import * as Network from "expo-network";

import {
  getModelSpec,
  type ModelSpec,
} from "@/constants/model-catalog";
import { assertModelInstalled } from "@/lib/model-install-state";
import {
  getCompleteMarkerPath,
  getFamilyDir,
  getModelDir,
  getModelPartialDir,
} from "@/lib/model-paths";
import { ModelError, wrapModelError } from "@/lib/model-errors";

export type DownloadProgress = {
  modelId: string;
  /** 0..1 */
  progress: number;
  bytesWritten: number;
  bytesTotal: number;
  currentFile?: string;
};

type ActiveDownload = {
  cancel: () => Promise<void>;
};

const activeDownloads = new Map<string, ActiveDownload>();

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function assertOnline(modelId: string): Promise<void> {
  try {
    const state = await Network.getNetworkStateAsync();
    const online =
      state.isConnected === true && state.isInternetReachable !== false;
    if (!online) {
      throw new ModelError({
        code: "MODEL_DOWNLOAD_OFFLINE",
        stage: "network.check",
        message: "Sin conexión a Internet. Conéctate para descargar modelos.",
        recoverable: true,
        context: { modelId },
      });
    }
  } catch (err) {
    if (err instanceof ModelError) throw err;
    throw wrapModelError(err, "network.check", "MODEL_DOWNLOAD_OFFLINE", true, {
      modelId,
    });
  }
}

function sizeMatches(expected: number, actual: number): boolean {
  const slack = Math.max(4096, Math.floor(expected * 0.01));
  return Math.abs(expected - actual) <= slack;
}

/**
 * Download a catalog model into documentDirectory/models/{family}/{id}/.
 * Atomic: writes to `{id}.partial/`, verifies sizes, then moves to final + `.complete`.
 */
export async function downloadModel(
  modelId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<ModelSpec> {
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

  if (activeDownloads.has(modelId)) {
    throw new ModelError({
      code: "MODEL_ALREADY_DOWNLOADING",
      stage: "download.start",
      message: `Ya hay una descarga en curso para ${modelId}`,
      recoverable: true,
      context: { modelId },
    });
  }

  await assertOnline(modelId);

  const familyDir = getFamilyDir(spec.family);
  const partialDir = getModelPartialDir(spec.family, modelId);
  const finalDir = getModelDir(spec.family, modelId);
  const marker = getCompleteMarkerPath(spec.family, modelId);

  await ensureDir(familyDir);
  await FileSystem.deleteAsync(partialDir, { idempotent: true });
  await ensureDir(partialDir);

  const bytesTotal = spec.diskBytes;
  let bytesWritten = 0;
  const fileWritten = new Map<string, number>();

  const report = (currentFile?: string) => {
    onProgress?.({
      modelId,
      progress: bytesTotal > 0 ? Math.min(1, bytesWritten / bytesTotal) : 0,
      bytesWritten,
      bytesTotal,
      currentFile,
    });
  };

  let cancelled = false;
  const cancelFns: Array<() => Promise<void>> = [];

  activeDownloads.set(modelId, {
    cancel: async () => {
      cancelled = true;
      await Promise.all(cancelFns.map((fn) => fn()));
    },
  });

  try {
    for (const file of spec.files) {
      if (cancelled) {
        throw new ModelError({
          code: "MODEL_DOWNLOAD_CANCELLED",
          stage: "download.file",
          message: "Descarga cancelada",
          recoverable: true,
          context: { modelId },
        });
      }

      const destPath = `${partialDir}${file.relativePath}`;
      let lastReported = 0;

      const resumable = FileSystem.createDownloadResumable(
        file.url,
        destPath,
        {},
        (data) => {
          const delta = data.totalBytesWritten - lastReported;
          lastReported = data.totalBytesWritten;
          if (delta > 0) {
            bytesWritten += delta;
            fileWritten.set(file.relativePath, data.totalBytesWritten);
            report(file.relativePath);
          }
        },
      );

      cancelFns.push(async () => {
        try {
          await resumable.pauseAsync();
        } catch {
          /* best effort */
        }
      });

      let result: FileSystem.FileSystemDownloadResult | undefined;
      try {
        result = await resumable.downloadAsync();
      } catch (err) {
        if (cancelled) {
          throw new ModelError({
            code: "MODEL_DOWNLOAD_CANCELLED",
            stage: "download.file",
            message: `Descarga cancelada: ${file.relativePath}`,
            recoverable: true,
            context: { modelId, file: file.relativePath },
          });
        }
        throw wrapModelError(
          err,
          "download.file",
          "MODEL_DOWNLOAD_FAILED",
          true,
          { modelId, file: file.relativePath },
        );
      }

      if (!result || result.status < 200 || result.status >= 300) {
        throw new ModelError({
          code: "MODEL_DOWNLOAD_HTTP",
          stage: "download.file",
          message: `HTTP ${result?.status ?? 0} al descargar ${file.relativePath}`,
          recoverable: true,
          context: {
            modelId,
            file: file.relativePath,
            httpStatus: result?.status ?? 0,
            url: file.url,
          },
        });
      }

      const info = await FileSystem.getInfoAsync(destPath);
      if (!info.exists || info.size == null) {
        throw new ModelError({
          code: "MODEL_INCOMPLETE",
          stage: "download.verify",
          message: `Fichero no escrito: ${file.relativePath}`,
          recoverable: true,
          context: { modelId, missingFile: file.relativePath },
        });
      }
      if (!sizeMatches(file.expectedBytes, info.size)) {
        throw new ModelError({
          code: "MODEL_SIZE_MISMATCH",
          stage: "download.verify",
          message: `Tamaño incorrecto tras descargar ${file.relativePath}`,
          recoverable: true,
          context: {
            modelId,
            file: file.relativePath,
            expected: file.expectedBytes,
            actual: info.size,
          },
        });
      }

      const prev = fileWritten.get(file.relativePath) ?? 0;
      if (prev < file.expectedBytes) {
        bytesWritten += file.expectedBytes - prev;
      }
      fileWritten.set(file.relativePath, file.expectedBytes);
      report(file.relativePath);
    }

    try {
      await FileSystem.deleteAsync(finalDir, { idempotent: true });
      await FileSystem.moveAsync({ from: partialDir, to: finalDir });
      await FileSystem.writeAsStringAsync(marker, new Date().toISOString());
    } catch (err) {
      throw wrapModelError(
        err,
        "download.finalize",
        "MODEL_FINALIZE_FAILED",
        true,
        { modelId },
      );
    }

    await assertModelInstalled(modelId);
    report();
    return spec;
  } catch (err) {
    await FileSystem.deleteAsync(partialDir, { idempotent: true });
    if (err instanceof ModelError) throw err;
    throw wrapModelError(err, "download.file", "MODEL_DOWNLOAD_FAILED", true, {
      modelId,
    });
  } finally {
    activeDownloads.delete(modelId);
  }
}

export async function cancelModelDownload(modelId: string): Promise<void> {
  const active = activeDownloads.get(modelId);
  if (active) {
    await active.cancel();
  }
}

export function isModelDownloading(modelId: string): boolean {
  return activeDownloads.has(modelId);
}
