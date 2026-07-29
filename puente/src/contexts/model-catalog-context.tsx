import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as Device from "expo-device";

import {
  ALL_MODELS,
  ASR_MODELS,
  getModelSpec,
  MT_MODELS,
  recommendForDevice,
  VAD_MODELS,
  type AsrModelSpec,
  type ModelRecommendation,
  type MtModelSpec,
  type VadModelSpec,
} from "@/constants/model-catalog";
import {
  cancelModelDownload,
  downloadModel,
  type DownloadProgress,
} from "@/lib/model-downloader";
import { isModelInstalled } from "@/lib/model-install-state";
import {
  readModelPreferences,
  setSelectedModelId,
  type ModelPreferences,
  type SelectableTask,
} from "@/lib/model-preferences";
import {
  isModelError,
  ModelError,
  wrapModelError,
} from "@/lib/model-errors";
import { resetAsrEngine, resetMtEngine } from "@/lib/engines";

export type ModelInstallUiStatus =
  | "not_installed"
  | "downloading"
  | "installed"
  | "selected";

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
  cancelDownload: (modelId: string) => Promise<void>;
  select: (modelId: string) => Promise<void>;
  downloadRecommended: () => Promise<void>;
  recommended: ModelRecommendation;
  asrModels: AsrModelSpec[];
  mtModels: MtModelSpec[];
  vadModels: VadModelSpec[];
  refresh: () => Promise<void>;
};

const ModelCatalogContext = createContext<ModelCatalogContextValue | null>(
  null,
);

const NO_SELECTION: ModelPreferences = { asr: null, mt: null };

function emptyStates(): Record<string, ModelUiState> {
  const out: Record<string, ModelUiState> = {};
  for (const m of ALL_MODELS) {
    out[m.id] = { status: "not_installed", progress: 0 };
  }
  return out;
}

/** Reload the engine slot that this task feeds, so the next call picks it up. */
function resetEngineForTask(task: SelectableTask): void {
  if (task === "asr") resetAsrEngine();
  else resetMtEngine();
}

export function ModelCatalogProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<ModelPreferences>(NO_SELECTION);
  const [states, setStates] = useState<Record<string, ModelUiState>>(emptyStates);
  const [lastError, setLastError] = useState<ModelError | null>(null);

  const deviceModelName = Device.modelName;
  const totalMemoryBytes = Device.totalMemory;
  const recommended = useMemo(
    () => recommendForDevice(totalMemoryBytes),
    [totalMemoryBytes],
  );

  const refresh = useCallback(async () => {
    const prefs = await readModelPreferences();
    const chosen = new Set(
      [prefs.asr, prefs.mt].filter((id): id is string => id != null),
    );
    const next = emptyStates();
    for (const m of ALL_MODELS) {
      const installed = await isModelInstalled(m.id);
      next[m.id] = {
        status: !installed
          ? "not_installed"
          : chosen.has(m.id)
            ? "selected"
            : "installed",
        progress: installed ? 1 : 0,
      };
    }
    setSelected(prefs);
    setStates(next);
    setReady(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!mounted) return;
        setLastError(
          isModelError(err)
            ? err
            : wrapModelError(err, "prefs.read", "MODEL_PREFS_READ_FAILED", true),
        );
        setReady(true);
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  const isReady = useMemo(() => {
    const usable = (id: string | null) => {
      if (!id) return false;
      const status = states[id]?.status;
      return status === "installed" || status === "selected";
    };
    return usable(selected.asr) && usable(selected.mt);
  }, [selected, states]);

  const getModelState = useCallback(
    (modelId: string): ModelUiState =>
      states[modelId] ?? { status: "not_installed", progress: 0 },
    [states],
  );

  /** Resolve a spec or raise the error the UI already knows how to show. */
  const requireSpec = useCallback((modelId: string) => {
    const spec = getModelSpec(modelId);
    if (!spec) {
      const err = new ModelError({
        code: "MODEL_UNKNOWN_ID",
        stage: "catalog.resolve",
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
    async (task: SelectableTask, modelId: string) => {
      await setSelectedModelId(task, modelId);
      resetEngineForTask(task);
      setSelected((prev) => ({ ...prev, [task]: modelId }));
    },
    [],
  );

  const download = useCallback(
    async (modelId: string) => {
      const spec = requireSpec(modelId);

      setLastError(null);
      setStates((prev) => ({
        ...prev,
        [modelId]: { status: "downloading", progress: 0 },
      }));

      try {
        await downloadModel(modelId, (p: DownloadProgress) => {
          setStates((prev) => ({
            ...prev,
            [modelId]: { status: "downloading", progress: p.progress },
          }));
        });

        // First model downloaded for a task becomes the active one, so the
        // common case needs no second tap. The VAD has no selection: it is
        // used whenever it is installed.
        if (spec.task !== "vad") {
          const prefs = await readModelPreferences();
          if (!prefs[spec.task]) await applySelection(spec.task, modelId);
        }

        await refresh();
      } catch (err) {
        const modelErr = isModelError(err)
          ? err
          : wrapModelError(
              err,
              "download.file",
              "MODEL_DOWNLOAD_FAILED",
              true,
              { modelId },
            );
        setLastError(modelErr);
        setStates((prev) => ({
          ...prev,
          [modelId]: {
            status: "not_installed",
            progress: 0,
            error: modelErr,
          },
        }));
        throw modelErr;
      }
    },
    [applySelection, refresh, requireSpec],
  );

  const cancelDownload = useCallback(async (modelId: string) => {
    await cancelModelDownload(modelId);
  }, []);

  const select = useCallback(
    async (modelId: string) => {
      const spec = requireSpec(modelId);
      if (spec.task === "vad") {
        const err = new ModelError({
          code: "MODEL_SELECT_FAILED",
          stage: "select.apply",
          message: `${spec.label} se usa automáticamente; no se selecciona`,
          recoverable: false,
          context: { modelId, task: spec.task },
        });
        setLastError(err);
        throw err;
      }

      if (!(await isModelInstalled(modelId))) {
        const err = new ModelError({
          code: "MODEL_SELECT_NOT_INSTALLED",
          stage: "select.apply",
          message: `No puedes seleccionar ${modelId}: no está instalado`,
          recoverable: true,
          context: { modelId },
        });
        setLastError(err);
        throw err;
      }

      try {
        await applySelection(spec.task, modelId);
        setLastError(null);
        await refresh();
      } catch (err) {
        const modelErr = isModelError(err)
          ? err
          : wrapModelError(err, "select.apply", "MODEL_SELECT_FAILED", true, {
              modelId,
            });
        setLastError(modelErr);
        throw modelErr;
      }
    },
    [applySelection, refresh, requireSpec],
  );

  const downloadRecommended = useCallback(async () => {
    setLastError(null);
    try {
      for (const modelId of [recommended.asrId, recommended.mtId]) {
        if (!(await isModelInstalled(modelId))) await download(modelId);
        await select(modelId);
      }
      // 2 MB that stop the transcriber inventing sentences over background
      // noise. Never worth skipping, and it has nothing to select.
      if (!(await isModelInstalled(recommended.vadId))) {
        await download(recommended.vadId);
      }
    } catch (err) {
      if (isModelError(err)) setLastError(err);
      throw err;
    }
  }, [recommended, download, select]);

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
      cancelDownload,
      select,
      downloadRecommended,
      recommended,
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
      cancelDownload,
      select,
      downloadRecommended,
      recommended,
      refresh,
    ],
  );

  return (
    <ModelCatalogContext.Provider value={value}>
      {children}
    </ModelCatalogContext.Provider>
  );
}

export function useModelCatalog(): ModelCatalogContextValue {
  const ctx = useContext(ModelCatalogContext);
  if (!ctx) {
    throw new Error("useModelCatalog must be used within ModelCatalogProvider");
  }
  return ctx;
}
