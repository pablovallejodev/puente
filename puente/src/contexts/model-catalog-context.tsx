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
  NLLB_MODELS,
  WHISPER_MODELS,
  getModelSpec,
  recommendForDevice,
  type ModelSpec,
} from "@/constants/model-catalog";
import {
  cancelModelDownload,
  downloadModel,
  type DownloadProgress,
} from "@/lib/model-downloader";
import { isModelInstalled } from "@/lib/model-install-state";
import {
  readModelPreferences,
  setSelectedNllbModelId,
  setSelectedWhisperModelId,
} from "@/lib/model-preferences";
import {
  isModelError,
  ModelError,
  wrapModelError,
} from "@/lib/model-errors";
import { resetWhisperEngine } from "@/lib/whisper-engine";
import { resetEngine as resetNllbEngine } from "@/lib/nllb-engine";

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
  selectedWhisperId: string | null;
  selectedNllbId: string | null;
  isReady: boolean;
  lastError: ModelError | null;
  clearError: () => void;
  getModelState: (modelId: string) => ModelUiState;
  download: (modelId: string) => Promise<void>;
  cancelDownload: (modelId: string) => Promise<void>;
  select: (modelId: string) => Promise<void>;
  downloadRecommended: () => Promise<void>;
  recommended: { whisperId: string; nllbId: string };
  whisperModels: ModelSpec[];
  nllbModels: ModelSpec[];
  refresh: () => Promise<void>;
};

const ModelCatalogContext = createContext<ModelCatalogContextValue | null>(
  null,
);

function emptyStates(): Record<string, ModelUiState> {
  const out: Record<string, ModelUiState> = {};
  for (const m of ALL_MODELS) {
    out[m.id] = { status: "not_installed", progress: 0 };
  }
  return out;
}

export function ModelCatalogProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [ready, setReady] = useState(false);
  const [selectedWhisperId, setSelectedWhisperId] = useState<string | null>(
    null,
  );
  const [selectedNllbId, setSelectedNllbId] = useState<string | null>(null);
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
    const next = emptyStates();
    for (const m of ALL_MODELS) {
      const installed = await isModelInstalled(m.id);
      let status: ModelInstallUiStatus = installed
        ? "installed"
        : "not_installed";
      if (
        installed &&
        (m.id === prefs.selectedWhisperModelId ||
          m.id === prefs.selectedNllbModelId)
      ) {
        status = "selected";
      }
      next[m.id] = { status, progress: installed ? 1 : 0 };
    }
    setSelectedWhisperId(prefs.selectedWhisperModelId);
    setSelectedNllbId(prefs.selectedNllbModelId);
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
    if (!selectedWhisperId || !selectedNllbId) return false;
    const w = states[selectedWhisperId];
    const n = states[selectedNllbId];
    return (
      (w?.status === "installed" || w?.status === "selected") &&
      (n?.status === "installed" || n?.status === "selected")
    );
  }, [selectedWhisperId, selectedNllbId, states]);

  const getModelState = useCallback(
    (modelId: string): ModelUiState =>
      states[modelId] ?? { status: "not_installed", progress: 0 },
    [states],
  );

  const download = useCallback(
    async (modelId: string) => {
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

      setLastError(null);
      setStates((prev) => ({
        ...prev,
        [modelId]: { status: "downloading", progress: 0 },
      }));

      try {
        await downloadModel(modelId, (p: DownloadProgress) => {
          setStates((prev) => ({
            ...prev,
            [modelId]: {
              status: "downloading",
              progress: p.progress,
            },
          }));
        });

        // Auto-select after successful download if none selected for family
        if (spec.family === "whisper") {
          const prefs = await readModelPreferences();
          if (!prefs.selectedWhisperModelId) {
            await setSelectedWhisperModelId(modelId);
            resetWhisperEngine();
            setSelectedWhisperId(modelId);
          }
        } else {
          const prefs = await readModelPreferences();
          if (!prefs.selectedNllbModelId) {
            await setSelectedNllbModelId(modelId);
            resetNllbEngine();
            setSelectedNllbId(modelId);
          }
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
    [refresh],
  );

  const cancelDownload = useCallback(async (modelId: string) => {
    await cancelModelDownload(modelId);
  }, []);

  const select = useCallback(
    async (modelId: string) => {
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

      const installed = await isModelInstalled(modelId);
      if (!installed) {
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
        if (spec.family === "whisper") {
          await setSelectedWhisperModelId(modelId);
          resetWhisperEngine();
          setSelectedWhisperId(modelId);
        } else {
          await setSelectedNllbModelId(modelId);
          resetNllbEngine();
          setSelectedNllbId(modelId);
        }
        setLastError(null);
        await refresh();
      } catch (err) {
        const modelErr = isModelError(err)
          ? err
          : wrapModelError(
              err,
              "select.apply",
              "MODEL_SELECT_FAILED",
              true,
              { modelId },
            );
        setLastError(modelErr);
        throw modelErr;
      }
    },
    [refresh],
  );

  const downloadRecommended = useCallback(async () => {
    const { whisperId, nllbId } = recommended;
    setLastError(null);
    try {
      if (!(await isModelInstalled(whisperId))) {
        await download(whisperId);
      }
      await select(whisperId);
      if (!(await isModelInstalled(nllbId))) {
        await download(nllbId);
      }
      await select(nllbId);
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
      selectedWhisperId,
      selectedNllbId,
      isReady,
      lastError,
      clearError: () => setLastError(null),
      getModelState,
      download,
      cancelDownload,
      select,
      downloadRecommended,
      recommended,
      whisperModels: WHISPER_MODELS,
      nllbModels: NLLB_MODELS,
      refresh,
    }),
    [
      ready,
      booting,
      deviceModelName,
      totalMemoryBytes,
      selectedWhisperId,
      selectedNllbId,
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
