import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Device from 'expo-device';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import {
  ALL_MODELS,
  ASR_MODELS,
  getModelSpec,
  MT_MODELS,
  VAD_MODELS,
  type AsrModelSpec,
  type MtModelSpec,
  type VadModelSpec,
} from '@/constants/model-catalog';
import {
  cancelModelDownload,
  downloadModel,
  getInFlightDownloadProgress,
  pauseModelDownload,
  reattachModelDownloads,
  type DownloadProgress,
} from '@/lib/model-downloader';
import { isModelInstalled } from '@/lib/model-install-state';
import {
  readModelPreferences,
  setSelectedModelId,
  type ModelPreferences,
  type SelectableTask,
} from '@/lib/model-preferences';
import { isModelError, ModelError, wrapModelError } from '@/lib/model-errors';
import { resetAsrEngine, resetMtEngine } from '@/lib/engines';

export type ModelInstallUiStatus = 'not_installed' | 'downloading' | 'paused' | 'installed' | 'selected';

export type ModelUiState = {
  status: ModelInstallUiStatus;
  progress: number;
  error?: ModelError;
};

type ModelCatalogContextValue = {
  ready: boolean;
  booting: boolean;
  deviceModelName: string | null;
  totalMemoryBytes: number | null;
  /** Chosen model per selectable task. */
  selected: ModelPreferences;
  /** True once a transcriber and a translator are installed and selected. */
  isReady: boolean;
  lastError: ModelError | null;
  clearError: () => void;
  getModelState: (modelId: string) => ModelUiState;
  download: (modelId: string) => Promise<void>;
  pauseDownload: (modelId: string) => Promise<void>;
  resumeDownload: (modelId: string) => Promise<void>;
  cancelDownload: (modelId: string) => Promise<void>;
  select: (modelId: string) => Promise<void>;
  /** Download (if needed) and select both models of a preset pair. */
  applyModelPair: (asrId: string, mtId: string) => Promise<void>;
  asrModels: AsrModelSpec[];
  mtModels: MtModelSpec[];
  vadModels: VadModelSpec[];
  refresh: () => Promise<void>;
};

const ModelCatalogContext = createContext<ModelCatalogContextValue | null>(null);

const NO_SELECTION: ModelPreferences = { asr: null, mt: null };
const KEEP_AWAKE_TAG = 'model-download';

function emptyStates(): Record<string, ModelUiState> {
  const out: Record<string, ModelUiState> = {};
  for (const m of ALL_MODELS) {
    out[m.id] = { status: 'not_installed', progress: 0 };
  }
  return out;
}

/** Reload the engine slot that this task feeds, so the next call picks it up. */
function resetEngineForTask(task: SelectableTask): void {
  if (task === 'asr') resetAsrEngine();
  else resetMtEngine();
}

function isPausedError(err: unknown): boolean {
  return isModelError(err) && err.code === 'MODEL_DOWNLOAD_PAUSED';
}

export function ModelCatalogProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<ModelPreferences>(NO_SELECTION);
  const [states, setStates] = useState<Record<string, ModelUiState>>(emptyStates);
  const [lastError, setLastError] = useState<ModelError | null>(null);
  const pairOperationRef = useRef(0);
  const selectionQueueRef = useRef(Promise.resolve());
  const refreshRequestRef = useRef(0);

  const deviceModelName = Device.modelName;
  const totalMemoryBytes = Device.totalMemory;

  const applyProgress = useCallback((p: DownloadProgress) => {
    setStates((prev) => ({
      ...prev,
      [p.modelId]: {
        status: p.paused ? 'paused' : 'downloading',
        progress: p.progress,
      },
    }));
  }, []);

  const refresh = useCallback(async () => {
    const request = ++refreshRequestRef.current;
    const prefs = await readModelPreferences();
    const chosen = new Set([prefs.asr, prefs.mt].filter((id): id is string => id != null));
    const next = emptyStates();
    for (const m of ALL_MODELS) {
      const installed = await isModelInstalled(m.id);
      const inflight = getInFlightDownloadProgress(m.id);
      if (inflight) {
        next[m.id] = {
          status: inflight.paused ? 'paused' : 'downloading',
          progress: inflight.progress,
        };
        continue;
      }
      next[m.id] = {
        status: !installed ? 'not_installed' : chosen.has(m.id) ? 'selected' : 'installed',
        progress: installed ? 1 : 0,
      };
    }
    if (refreshRequestRef.current !== request) return;
    setSelected(prefs);
    setStates(next);
    setReady(true);
  }, []);

  useEffect(() => {
    const active = Object.values(states).some((s) => s.status === 'downloading');
    if (active) void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    else void deactivateKeepAwake(KEEP_AWAKE_TAG);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [states]);

  const isReady = useMemo(() => {
    const usable = (id: string | null) => {
      if (!id) return false;
      const status = states[id]?.status;
      return status === 'installed' || status === 'selected';
    };
    return usable(selected.asr) && usable(selected.mt);
  }, [selected, states]);

  const getModelState = useCallback(
    (modelId: string): ModelUiState => states[modelId] ?? { status: 'not_installed', progress: 0 },
    [states],
  );

  /** Resolve a spec or raise the error the UI already knows how to show. */
  const requireSpec = useCallback((modelId: string) => {
    const spec = getModelSpec(modelId);
    if (!spec) {
      const err = new ModelError({
        code: 'MODEL_UNKNOWN_ID',
        stage: 'catalog.resolve',
        message: `Modelo desconocido: ${modelId}`,
        recoverable: false,
        context: { modelId },
      });
      setLastError(err);
      throw err;
    }
    return spec;
  }, []);

  const applySelection = useCallback(
    async (task: SelectableTask, modelId: string, pairOperation?: number, onlyIfEmpty = false): Promise<boolean> => {
      const write = selectionQueueRef.current.then(async () => {
        const prefs = await readModelPreferences();
        if (pairOperation != null && pairOperationRef.current !== pairOperation) return false;
        if (onlyIfEmpty && prefs[task]) return false;
        if (onlyIfEmpty) pairOperationRef.current += 1;
        const changed = prefs[task] !== modelId;
        await setSelectedModelId(task, modelId);
        if (changed) resetEngineForTask(task);
        setSelected((prev) => (prev[task] === modelId ? prev : { ...prev, [task]: modelId }));
        return true;
      });
      selectionQueueRef.current = write.then(
        () => undefined,
        () => undefined,
      );
      return write;
    },
    [],
  );

  const maybeAutoSelect = useCallback(
    async (modelId: string, pairOperation = pairOperationRef.current) => {
      const spec = getModelSpec(modelId);
      if (!spec || spec.task === 'vad') return;
      // The empty-task check and the invalidation happen inside the selection
      // queue so a concurrent preset cannot win after this check.
      await applySelection(spec.task, modelId, pairOperation, true);
    },
    [applySelection],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refresh();
        if (!mounted) return;
        const reattachPairOperation = pairOperationRef.current;
        const snapshots = await reattachModelDownloads({
          onProgress: applyProgress,
          onComplete: async (modelId, selectOnComplete) => {
            if (!mounted) return;
            if (selectOnComplete) await maybeAutoSelect(modelId, reattachPairOperation);
            await refresh();
          },
          onPaused: (modelId, progress) => {
            if (!mounted) return;
            setStates((prev) => ({
              ...prev,
              [modelId]: { status: 'paused', progress },
            }));
          },
          onFailed: (modelId, err, progress) => {
            if (!mounted) return;
            const modelErr = isModelError(err)
              ? err
              : wrapModelError(err, 'download.file', 'MODEL_DOWNLOAD_FAILED', true, { modelId });
            setLastError(modelErr);
            setStates((prev) => ({
              ...prev,
              [modelId]: {
                status: 'paused',
                progress,
                error: modelErr,
              },
            }));
          },
        });
        if (!mounted) return;
        if (snapshots.length > 0) {
          setStates((prev) => {
            const next = { ...prev };
            for (const snap of snapshots) {
              next[snap.modelId] = {
                status: snap.paused ? 'paused' : 'downloading',
                progress: snap.progress,
              };
            }
            return next;
          });
        }
      } catch (err) {
        if (!mounted) return;
        setLastError(isModelError(err) ? err : wrapModelError(err, 'prefs.read', 'MODEL_PREFS_READ_FAILED', true));
        setReady(true);
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [applyProgress, maybeAutoSelect, refresh]);

  const download = useCallback(
    async (modelId: string, autoSelect = true) => {
      const pairOperation = autoSelect ? pairOperationRef.current : undefined;
      requireSpec(modelId);

      setLastError(null);
      setStates((prev) => ({
        ...prev,
        [modelId]: {
          status: 'downloading',
          progress: prev[modelId]?.progress ?? 0,
        },
      }));

      try {
        await downloadModel(modelId, applyProgress, { selectOnComplete: autoSelect });
        if (autoSelect) await maybeAutoSelect(modelId, pairOperation);
        await refresh();
      } catch (err) {
        if (isPausedError(err)) {
          setLastError(null);
          setStates((prev) => ({
            ...prev,
            [modelId]: {
              status: 'paused',
              progress: prev[modelId]?.progress ?? 0,
            },
          }));
          throw err;
        }
        const modelErr = isModelError(err)
          ? err
          : wrapModelError(err, 'download.file', 'MODEL_DOWNLOAD_FAILED', true, { modelId });
        // Soft fail keeps partial — show paused with error, not wipe to 0.
        const inflight = getInFlightDownloadProgress(modelId);
        setLastError(modelErr);
        setStates((prev) => ({
          ...prev,
          [modelId]: {
            status: inflight ? 'paused' : 'not_installed',
            progress: inflight?.progress ?? 0,
            error: modelErr,
          },
        }));
        throw modelErr;
      }
    },
    [applyProgress, maybeAutoSelect, refresh, requireSpec],
  );

  const pauseDownload = useCallback(async (modelId: string) => {
    await pauseModelDownload(modelId);
    setStates((prev) => ({
      ...prev,
      [modelId]: {
        status: 'paused',
        progress: prev[modelId]?.progress ?? 0,
      },
    }));
  }, []);

  const resumeDownload = useCallback(
    async (modelId: string) => {
      await download(modelId);
    },
    [download],
  );

  const cancelDownload = useCallback(async (modelId: string) => {
    await cancelModelDownload(modelId);
    setStates((prev) => ({
      ...prev,
      [modelId]: { status: 'not_installed', progress: 0 },
    }));
  }, []);

  const selectModel = useCallback(
    async (modelId: string, pairOperation?: number): Promise<boolean> => {
      const spec = requireSpec(modelId);
      if (spec.task === 'vad') {
        const err = new ModelError({
          code: 'MODEL_SELECT_FAILED',
          stage: 'select.apply',
          message: `${spec.label} se usa automáticamente; no se selecciona`,
          recoverable: false,
          context: { modelId, task: spec.task },
        });
        setLastError(err);
        throw err;
      }

      if (!(await isModelInstalled(modelId))) {
        const err = new ModelError({
          code: 'MODEL_SELECT_NOT_INSTALLED',
          stage: 'select.apply',
          message: `No puedes seleccionar ${modelId}: no está instalado`,
          recoverable: true,
          context: { modelId },
        });
        setLastError(err);
        throw err;
      }

      try {
        const applied = await applySelection(spec.task, modelId, pairOperation);
        if (!applied) return false;
        setLastError(null);
        await refresh();
        return true;
      } catch (err) {
        const modelErr = isModelError(err)
          ? err
          : wrapModelError(err, 'select.apply', 'MODEL_SELECT_FAILED', true, {
              modelId,
            });
        setLastError(modelErr);
        throw modelErr;
      }
    },
    [applySelection, refresh, requireSpec],
  );

  const select = useCallback(
    async (modelId: string) => {
      pairOperationRef.current += 1;
      await selectModel(modelId);
    },
    [selectModel],
  );

  const applyModelPair = useCallback(
    async (asrId: string, mtId: string) => {
      const pairOperation = ++pairOperationRef.current;
      setLastError(null);
      try {
        const modelIds = [...new Set([asrId, mtId])];
        for (const modelId of modelIds) {
          if (pairOperationRef.current !== pairOperation) return;
          if (!(await isModelInstalled(modelId))) await download(modelId, false);
          if (pairOperationRef.current !== pairOperation) return;
        }
        for (const modelId of modelIds) {
          if (pairOperationRef.current !== pairOperation) return;
          if (!(await selectModel(modelId, pairOperation))) return;
        }
      } catch (err) {
        if (isPausedError(err)) {
          setLastError(null);
          throw err;
        }
        if (isModelError(err)) setLastError(err);
        throw err;
      }
    },
    [download, selectModel],
  );

  const value = useMemo<ModelCatalogContextValue>(
    () => ({
      ready,
      booting,
      deviceModelName,
      totalMemoryBytes,
      selected,
      isReady,
      lastError,
      clearError: () => setLastError(null),
      getModelState,
      download,
      pauseDownload,
      resumeDownload,
      cancelDownload,
      select,
      applyModelPair,
      asrModels: ASR_MODELS,
      mtModels: MT_MODELS,
      vadModels: VAD_MODELS,
      refresh,
    }),
    [
      ready,
      booting,
      deviceModelName,
      totalMemoryBytes,
      selected,
      isReady,
      lastError,
      getModelState,
      download,
      pauseDownload,
      resumeDownload,
      cancelDownload,
      select,
      applyModelPair,
      refresh,
    ],
  );

  return <ModelCatalogContext.Provider value={value}>{children}</ModelCatalogContext.Provider>;
}

export function useModelCatalog(): ModelCatalogContextValue {
  const ctx = useContext(ModelCatalogContext);
  if (!ctx) {
    throw new Error('useModelCatalog must be used within ModelCatalogProvider');
  }
  return ctx;
}
