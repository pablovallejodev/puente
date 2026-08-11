import {
  completeHandler,
  createDownloadTask,
  directories,
  getExistingDownloadTasks,
  setConfig,
  type DownloadTask,
} from "@kesha-antonov/react-native-background-downloader";
import * as FileSystem from "expo-file-system/legacy";
import * as Network from "expo-network";
import { Platform } from "react-native";

import {
  ALL_MODELS,
  getModelSpec,
  type ModelSpec,
} from "@/constants/model-catalog";
import {
  createDownloadJobState,
  makeDownloadTaskId,
  parseDownloadJobState,
  parseDownloadTaskId,
  serializeDownloadJobState,
  type DownloadJobState,
} from "@/lib/model-download-job";
import {
  assertModelInstalled,
  isModelInstalled,
} from "@/lib/model-install-state";
import {
  getCompleteMarkerPath,
  getModelDir,
  getModelDownloadJobPath,
  getModelPartialDir,
  getStorageDir,
  toNativePath,
} from "@/lib/model-paths";
import { isModelError, ModelError, wrapModelError } from "@/lib/model-errors";

export type DownloadProgress = {
  modelId: string;
  /** 0..1 */
  progress: number;
  bytesWritten: number;
  bytesTotal: number;
  currentFile?: string;
  paused?: boolean;
};

export type ReattachSnapshot = {
  modelId: string;
  progress: number;
  paused: boolean;
  selectOnComplete: boolean;
};

type Session = {
  modelId: string;
  spec: ModelSpec;
  job: DownloadJobState;
  task: DownloadTask | null;
  onProgress?: (p: DownloadProgress) => void;
  /** Settles the Promise returned by downloadModel / resume. */
  settle: {
    resolve: (spec: ModelSpec) => void;
    reject: (err: unknown) => void;
  } | null;
  /** Rejects the in-flight single-file native download waiter. */
  fileWaitReject: ((err: unknown) => void) | null;
  /** True while the file-loop runner is executing. */
  running: boolean;
  pauseRequested: boolean;
  cancelRequested: boolean;
};

const sessions = new Map<string, Session>();
let downloaderConfigured = false;

function ensureDownloaderConfigured(): void {
  if (downloaderConfigured) return;
  downloaderConfigured = true;
  try {
    setConfig({
      showNotificationsEnabled: Platform.OS === "android",
      notificationsGrouping: {
        enabled: false,
        mode: "individual",
        texts: {
          downloadTitle: "Puente",
          downloadStarting: "Iniciando descarga…",
          downloadProgress: "Descargando modelo… {progress}%",
          downloadPaused: "Descarga pausada",
          downloadFinished: "Descarga completada",
        },
      },
    });
  } catch {
    /* best effort — downloads still work without notifications */
  }
}

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

function nativeDest(uri: string): string {
  const path = toNativePath(uri);
  // Prefer library documents root when it matches Expo's documentDirectory.
  if (
    directories.documents &&
    FileSystem.documentDirectory &&
    toNativePath(FileSystem.documentDirectory) === directories.documents
  ) {
    return path;
  }
  return path;
}

function progressFromJob(
  spec: ModelSpec,
  job: DownloadJobState,
  currentFileBytes = 0,
): DownloadProgress {
  const completedBytes = spec.files
    .filter((f) => job.completedFiles.includes(f.relativePath))
    .reduce((sum, f) => sum + f.expectedBytes, 0);
  const bytesWritten = completedBytes + currentFileBytes;
  return {
    modelId: spec.id,
    progress:
      spec.diskBytes > 0 ? Math.min(1, bytesWritten / spec.diskBytes) : 0,
    bytesWritten,
    bytesTotal: spec.diskBytes,
    currentFile: job.currentFile ?? undefined,
    paused: job.status === "paused",
  };
}

async function readJob(spec: ModelSpec): Promise<DownloadJobState | null> {
  const path = getModelDownloadJobPath(spec);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    return parseDownloadJobState(raw);
  } catch {
    return null;
  }
}

async function writeJob(spec: ModelSpec, job: DownloadJobState): Promise<void> {
  job.updatedAt = new Date().toISOString();
  job.bytesWritten = progressFromJob(spec, job).bytesWritten;
  await FileSystem.writeAsStringAsync(
    getModelDownloadJobPath(spec),
    serializeDownloadJobState(job),
  );
}

async function deleteJob(spec: ModelSpec): Promise<void> {
  await FileSystem.deleteAsync(getModelDownloadJobPath(spec), {
    idempotent: true,
  });
}

async function fileOk(path: string, expectedBytes: number): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(path);
  return (
    info.exists === true &&
    info.size != null &&
    sizeMatches(expectedBytes, info.size)
  );
}

function rejectSettle(session: Session, err: unknown): void {
  const settle = session.settle;
  session.settle = null;
  settle?.reject(err);
}

function resolveSettle(session: Session, spec: ModelSpec): void {
  const settle = session.settle;
  session.settle = null;
  settle?.resolve(spec);
}

function report(session: Session, currentFileBytes = 0): void {
  session.onProgress?.(
    progressFromJob(session.spec, session.job, currentFileBytes),
  );
}

async function stopTask(session: Session): Promise<void> {
  const task = session.task;
  session.task = null;
  if (!task) return;
  try {
    await task.stop();
  } catch {
    /* best effort */
  }
  try {
    await completeHandler(task.id);
  } catch {
    /* best effort */
  }
}

async function pauseOtherActives(exceptModelId: string): Promise<void> {
  const ids = [...sessions.keys()].filter((id) => id !== exceptModelId);
  for (const id of ids) {
    const s = sessions.get(id);
    if (s && s.job.status === "active") {
      await pauseModelDownload(id);
    }
  }
}

/**
 * Download (or resume) one file via the native background downloader.
 * Resolves when the file is verified on disk; rejects on cancel/pause/error.
 */
function downloadFileNative(
  session: Session,
  relativePath: string,
  url: string,
  destUri: string,
  expectedBytes: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const taskId = makeDownloadTaskId(session.modelId, relativePath);
    const destination = nativeDest(destUri);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      session.fileWaitReject = null;
      fn();
    };

    session.fileWaitReject = (err) => finish(() => reject(err));

    const bindHandlers = (task: DownloadTask) => {
      task
        .progress(({ bytesDownloaded }) => {
          if (session.pauseRequested || session.cancelRequested) return;
          report(session, bytesDownloaded);
        })
        .done(async ({ bytesDownloaded }) => {
          session.task = null;
          try {
            await Promise.resolve(completeHandler(taskId));
          } catch {
            /* ignore */
          }
          try {
            if (!(await fileOk(destUri, expectedBytes))) {
              finish(() =>
                reject(
                  new ModelError({
                    code: "MODEL_SIZE_MISMATCH",
                    stage: "download.verify",
                    message: `Tamaño incorrecto tras descargar ${relativePath}`,
                    recoverable: true,
                    context: {
                      modelId: session.modelId,
                      file: relativePath,
                      expected: expectedBytes,
                      actual: bytesDownloaded,
                    },
                  }),
                ),
              );
              return;
            }
            finish(() => resolve());
          } catch (err) {
            finish(() => reject(err));
          }
        })
        .error(({ error, errorCode }) => {
          session.task = null;
          void Promise.resolve(completeHandler(taskId)).catch(() => undefined);
          if (session.cancelRequested) {
            finish(() =>
              reject(
                new ModelError({
                  code: "MODEL_DOWNLOAD_CANCELLED",
                  stage: "download.file",
                  message: `Descarga cancelada: ${relativePath}`,
                  recoverable: true,
                  context: { modelId: session.modelId, file: relativePath },
                }),
              ),
            );
            return;
          }
          if (session.pauseRequested) {
            finish(() =>
              reject(
                new ModelError({
                  code: "MODEL_DOWNLOAD_PAUSED",
                  stage: "download.file",
                  message: "Descarga pausada",
                  recoverable: true,
                  context: { modelId: session.modelId, file: relativePath },
                }),
              ),
            );
            return;
          }
          finish(() =>
            reject(
              new ModelError({
                code: "MODEL_DOWNLOAD_FAILED",
                stage: "download.file",
                message:
                  typeof error === "string"
                    ? error
                    : `Error de descarga (${errorCode})`,
                recoverable: true,
                context: {
                  modelId: session.modelId,
                  file: relativePath,
                  errorCode,
                },
              }),
            ),
          );
        });
    };

    const existing = session.task;
    if (
      existing &&
      existing.id === taskId &&
      (existing.state === "PAUSED" || existing.state === "DOWNLOADING")
    ) {
      bindHandlers(existing);
      void existing.resume().catch((err) => {
        finish(() =>
          reject(
            wrapModelError(
              err,
              "download.file",
              "MODEL_DOWNLOAD_FAILED",
              true,
              { modelId: session.modelId, file: relativePath },
            ),
          ),
        );
      });
      return;
    }

    const task = createDownloadTask({
      id: taskId,
      url,
      destination,
      metadata: { modelId: session.modelId, relativePath },
    });
    bindHandlers(task);
    session.task = task;
    task.start();
  });
}

async function finalizeInstall(session: Session): Promise<void> {
  const { spec } = session;
  const partialDir = getModelPartialDir(spec);
  const finalDir = getModelDir(spec);
  const marker = getCompleteMarkerPath(spec);

  for (const file of spec.files) {
    const dest = `${partialDir}${file.relativePath}`;
    if (!(await fileOk(dest, file.expectedBytes))) {
      throw new ModelError({
        code: "MODEL_INCOMPLETE",
        stage: "download.verify",
        message: `Fichero incompleto antes de finalizar: ${file.relativePath}`,
        recoverable: true,
        context: { modelId: spec.id, missingFile: file.relativePath },
      });
    }
  }

  try {
    await FileSystem.deleteAsync(finalDir, { idempotent: true });
    await FileSystem.moveAsync({ from: partialDir, to: finalDir });
    await FileSystem.writeAsStringAsync(marker, new Date().toISOString());
    await deleteJob(spec);
  } catch (err) {
    throw wrapModelError(
      err,
      "download.finalize",
      "MODEL_FINALIZE_FAILED",
      true,
      { modelId: spec.id },
    );
  }

  await assertModelInstalled(spec.id);
}

async function runDownloadLoop(session: Session): Promise<void> {
  if (session.running) return;
  session.running = true;
  session.pauseRequested = false;
  session.cancelRequested = false;
  session.job.status = "active";

  const { spec } = session;
  const partialDir = getModelPartialDir(spec);

  try {
    await ensureDir(getStorageDir(spec.storage));
    await ensureDir(partialDir);
    await writeJob(spec, session.job);
    report(session);

    for (const file of spec.files) {
      if (session.cancelRequested) {
        throw new ModelError({
          code: "MODEL_DOWNLOAD_CANCELLED",
          stage: "download.file",
          message: "Descarga cancelada",
          recoverable: true,
          context: { modelId: spec.id },
        });
      }
      if (session.pauseRequested) {
        throw new ModelError({
          code: "MODEL_DOWNLOAD_PAUSED",
          stage: "download.file",
          message: "Descarga pausada",
          recoverable: true,
          context: { modelId: spec.id },
        });
      }

      const destPath = `${partialDir}${file.relativePath}`;

      if (
        session.job.completedFiles.includes(file.relativePath) ||
        (await fileOk(destPath, file.expectedBytes))
      ) {
        if (!session.job.completedFiles.includes(file.relativePath)) {
          session.job.completedFiles.push(file.relativePath);
        }
        session.job.currentFile = null;
        await writeJob(spec, session.job);
        report(session);
        continue;
      }

      // Keep partial bytes for native resume. Only wipe empty stubs.
      const info = await FileSystem.getInfoAsync(destPath);
      if (info.exists && (info.size == null || info.size === 0)) {
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      }

      session.job.currentFile = file.relativePath;
      await writeJob(spec, session.job);
      report(session);

      try {
        await downloadFileNative(
          session,
          file.relativePath,
          file.url,
          destPath,
          file.expectedBytes,
        );
      } catch (err) {
        if (
          err instanceof ModelError &&
          err.code === "MODEL_DOWNLOAD_PAUSED"
        ) {
          session.job.status = "paused";
          await writeJob(spec, session.job);
          report(session);
          throw err;
        }
        if (
          err instanceof ModelError &&
          err.code === "MODEL_DOWNLOAD_CANCELLED"
        ) {
          throw err;
        }
        // Soft fail: keep partial + job for retry.
        session.job.status = "paused";
        await writeJob(spec, session.job);
        report(session);
        throw err;
      }

      if (!session.job.completedFiles.includes(file.relativePath)) {
        session.job.completedFiles.push(file.relativePath);
      }
      session.job.currentFile = null;
      await writeJob(spec, session.job);
      report(session);
    }

    await finalizeInstall(session);
    report(session, 0);
    sessions.delete(spec.id);
    resolveSettle(session, spec);
  } catch (err) {
    if (session.cancelRequested) {
      await stopTask(session);
      await FileSystem.deleteAsync(partialDir, { idempotent: true });
      await deleteJob(spec);
      sessions.delete(spec.id);
      const cancelled =
        err instanceof ModelError && err.code === "MODEL_DOWNLOAD_CANCELLED"
          ? err
          : new ModelError({
              code: "MODEL_DOWNLOAD_CANCELLED",
              stage: "download.file",
              message: "Descarga cancelada",
              recoverable: true,
              context: { modelId: spec.id },
            });
      rejectSettle(session, cancelled);
      return;
    }

    if (
      err instanceof ModelError &&
      err.code === "MODEL_DOWNLOAD_PAUSED"
    ) {
      session.job.status = "paused";
      await writeJob(spec, session.job);
      report(session);
      rejectSettle(session, err);
      return;
    }

    // Keep partial for retry; surface as paused-with-error to the waiter.
    session.job.status = "paused";
    await writeJob(spec, session.job);
    report(session);
    rejectSettle(
      session,
      err instanceof ModelError
        ? err
        : wrapModelError(err, "download.file", "MODEL_DOWNLOAD_FAILED", true, {
            modelId: spec.id,
          }),
    );
  } finally {
    session.running = false;
  }
}

function attachSettle(
  session: Session,
): Promise<ModelSpec> {
  return new Promise<ModelSpec>((resolve, reject) => {
    session.settle = { resolve, reject };
  });
}

async function getOrCreateSession(
  modelId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<Session> {
  const existing = sessions.get(modelId);
  if (existing) {
    if (onProgress) existing.onProgress = onProgress;
    return existing;
  }

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

  const diskJob = await readJob(spec);
  const job =
    diskJob ??
    createDownloadJobState(modelId, { selectOnComplete: true });

  const session: Session = {
    modelId,
    spec,
    job,
    task: null,
    onProgress,
    settle: null,
    fileWaitReject: null,
    running: false,
    pauseRequested: false,
    cancelRequested: false,
  };
  sessions.set(modelId, session);
  return session;
}

/**
 * Download a catalog model into documentDirectory/models/{family}/{id}/.
 * Uses the OS background downloader; survives app backgrounding.
 * Atomic finalize: `.partial/` → verify → final + `.complete`.
 */
export async function downloadModel(
  modelId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<ModelSpec> {
  ensureDownloaderConfigured();

  if (await isModelInstalled(modelId)) {
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
    return spec;
  }

  const existing = sessions.get(modelId);
  if (existing?.running && existing.job.status === "active") {
    if (onProgress) existing.onProgress = onProgress;
    throw new ModelError({
      code: "MODEL_ALREADY_DOWNLOADING",
      stage: "download.start",
      message: `Ya hay una descarga en curso para ${modelId}`,
      recoverable: true,
      context: { modelId },
    });
  }

  await assertOnline(modelId);
  await pauseOtherActives(modelId);

  const session = await getOrCreateSession(modelId, onProgress);
  session.pauseRequested = false;
  session.cancelRequested = false;
  session.job.status = "active";

  const wait = attachSettle(session);
  void runDownloadLoop(session);
  return wait;
}

export async function resumeModelDownload(
  modelId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<ModelSpec> {
  return downloadModel(modelId, onProgress);
}

export async function pauseModelDownload(modelId: string): Promise<void> {
  const session = sessions.get(modelId);
  if (!session) {
    const spec = getModelSpec(modelId);
    if (!spec) return;
    const job = await readJob(spec);
    if (job && job.status === "active") {
      job.status = "paused";
      await writeJob(spec, job);
    }
    return;
  }

  if (session.job.status === "paused" && !session.running) return;

  session.pauseRequested = true;
  session.job.status = "paused";
  await writeJob(session.spec, session.job);
  report(session);

  const task = session.task;
  if (task) {
    try {
      await task.pause();
    } catch {
      /* pause best-effort; waiter still settles as paused */
    }
  }

  // Native pause does not reject the JS waiter — settle it explicitly.
  // Keep session.task so resume can call task.resume() on the same native job.
  session.fileWaitReject?.(
    new ModelError({
      code: "MODEL_DOWNLOAD_PAUSED",
      stage: "download.file",
      message: "Descarga pausada",
      recoverable: true,
      context: { modelId },
    }),
  );
}

export async function cancelModelDownload(modelId: string): Promise<void> {
  const session = sessions.get(modelId);
  if (!session) {
    const spec = getModelSpec(modelId);
    if (!spec) return;
    await FileSystem.deleteAsync(getModelPartialDir(spec), {
      idempotent: true,
    });
    await deleteJob(spec);
    return;
  }

  session.cancelRequested = true;
  session.pauseRequested = false;
  await stopTask(session);

  const cancelled = new ModelError({
    code: "MODEL_DOWNLOAD_CANCELLED",
    stage: "download.file",
    message: "Descarga cancelada",
    recoverable: true,
    context: { modelId },
  });
  session.fileWaitReject?.(cancelled);

  // If the loop isn't running, wipe here and settle.
  if (!session.running) {
    await FileSystem.deleteAsync(getModelPartialDir(session.spec), {
      idempotent: true,
    });
    await deleteJob(session.spec);
    sessions.delete(modelId);
    rejectSettle(session, cancelled);
  }
}

export function isModelDownloading(modelId: string): boolean {
  const s = sessions.get(modelId);
  return s != null && s.job.status === "active";
}

export function isModelDownloadPaused(modelId: string): boolean {
  const s = sessions.get(modelId);
  return s != null && s.job.status === "paused";
}

export function getInFlightDownloadProgress(
  modelId: string,
): DownloadProgress | null {
  const s = sessions.get(modelId);
  if (!s) return null;
  return progressFromJob(s.spec, s.job);
}

export type ReattachHandlers = {
  onProgress?: (p: DownloadProgress) => void;
  onComplete?: (modelId: string, selectOnComplete: boolean) => void | Promise<void>;
  onPaused?: (modelId: string, progress: number) => void;
  onFailed?: (modelId: string, err: unknown, progress: number) => void;
};

/**
 * Reconnect to native background tasks and disk job states after app launch.
 * Does not auto-resume paused jobs. Continues active ones.
 */
export async function reattachModelDownloads(
  handlers: ReattachHandlers = {},
): Promise<ReattachSnapshot[]> {
  ensureDownloaderConfigured();
  const snapshots: ReattachSnapshot[] = [];
  const onProgress = handlers.onProgress;

  let existingTasks: DownloadTask[] = [];
  try {
    existingTasks = await getExistingDownloadTasks();
  } catch {
    existingTasks = [];
  }

  const tasksByModel = new Map<string, DownloadTask>();
  for (const task of existingTasks) {
    const parsed = parseDownloadTaskId(task.id);
    if (!parsed) continue;
    tasksByModel.set(parsed.modelId, task);
  }

  for (const model of ALL_MODELS) {
    const diskJob = await readJob(model);
    const nativeTask = tasksByModel.get(model.id);
    if (!diskJob && !nativeTask) continue;
    if (await isModelInstalled(model.id)) {
      await deleteJob(model);
      if (nativeTask) {
        try {
          await nativeTask.stop();
          await completeHandler(nativeTask.id);
        } catch {
          /* ignore */
        }
      }
      continue;
    }

    const session = await getOrCreateSession(model.id, onProgress);
    if (diskJob) session.job = diskJob;
    if (nativeTask) {
      session.task = nativeTask;
      const parsed = parseDownloadTaskId(nativeTask.id);
      if (parsed) session.job.currentFile = parsed.relativePath;
      // Native task still running while disk said paused → trust native.
      if (nativeTask.state === "DOWNLOADING") {
        session.job.status = "active";
      } else if (
        nativeTask.state === "PAUSED" &&
        session.job.status === "active"
      ) {
        session.job.status = "paused";
      }
      await writeJob(session.spec, session.job);
    }

    const progress = progressFromJob(session.spec, session.job);
    snapshots.push({
      modelId: model.id,
      progress: progress.progress,
      paused: session.job.status === "paused",
      selectOnComplete: session.job.selectOnComplete,
    });
    report(session);

    if (session.job.status === "active" && !session.running) {
      const selectOnComplete = session.job.selectOnComplete;
      const wait = attachSettle(session);
      void runDownloadLoop(session);
      void wait
        .then(async () => {
          await handlers.onComplete?.(model.id, selectOnComplete);
        })
        .catch((err) => {
          const progress = getInFlightDownloadProgress(model.id)?.progress ?? 0;
          if (isModelError(err) && err.code === "MODEL_DOWNLOAD_PAUSED") {
            handlers.onPaused?.(model.id, progress);
            return;
          }
          handlers.onFailed?.(model.id, err, progress);
        });
    }
  }

  return snapshots;
}
