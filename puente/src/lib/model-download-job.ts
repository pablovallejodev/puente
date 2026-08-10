/**
 * Pure helpers for background download job ids / persisted state.
 * Kept free of native modules so `check:model-download-job` can import it.
 */

export const DOWNLOAD_TASK_PREFIX = "puente:";

export type DownloadJobStatus = "active" | "paused";

export type DownloadJobState = {
  modelId: string;
  status: DownloadJobStatus;
  completedFiles: string[];
  currentFile: string | null;
  bytesWritten: number;
  selectOnComplete: boolean;
  updatedAt: string;
};

export function makeDownloadTaskId(
  modelId: string,
  relativePath: string,
): string {
  return `${DOWNLOAD_TASK_PREFIX}${modelId}:${relativePath}`;
}

export function parseDownloadTaskId(
  taskId: string,
): { modelId: string; relativePath: string } | null {
  if (!taskId.startsWith(DOWNLOAD_TASK_PREFIX)) return null;
  const rest = taskId.slice(DOWNLOAD_TASK_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0 || sep >= rest.length - 1) return null;
  return {
    modelId: rest.slice(0, sep),
    relativePath: rest.slice(sep + 1),
  };
}

export function createDownloadJobState(
  modelId: string,
  opts?: { selectOnComplete?: boolean },
): DownloadJobState {
  return {
    modelId,
    status: "active",
    completedFiles: [],
    currentFile: null,
    bytesWritten: 0,
    selectOnComplete: opts?.selectOnComplete !== false,
    updatedAt: new Date().toISOString(),
  };
}

export function serializeDownloadJobState(job: DownloadJobState): string {
  return JSON.stringify(job);
}

export function parseDownloadJobState(raw: string): DownloadJobState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DownloadJobState>;
    if (
      typeof parsed.modelId !== "string" ||
      (parsed.status !== "active" && parsed.status !== "paused") ||
      !Array.isArray(parsed.completedFiles)
    ) {
      return null;
    }
    return {
      modelId: parsed.modelId,
      status: parsed.status,
      completedFiles: parsed.completedFiles.filter(
        (f): f is string => typeof f === "string",
      ),
      currentFile:
        typeof parsed.currentFile === "string" ? parsed.currentFile : null,
      bytesWritten:
        typeof parsed.bytesWritten === "number" && parsed.bytesWritten >= 0
          ? parsed.bytesWritten
          : 0,
      selectOnComplete: parsed.selectOnComplete !== false,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
