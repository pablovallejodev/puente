/**
 * Offline STT availability: true once any transcription model — whichever
 * engine runs it — is selected and installed through the model catalog.
 */
import { useCallback, useMemo } from "react";

import type { SttErrorCode } from "@/lib/stt-errors";
import { useModelCatalog } from "@/contexts/model-catalog-context";

export type SttDownloadStatus =
  | "idle"
  | "checking"
  | "not_installed"
  | "downloading"
  | "installed"
  | "scheduled"
  | "error";

export type SttDownloadState = {
  status: SttDownloadStatus;
  error?: string;
  code?: SttErrorCode;
};

export function useOfflineSttDownload() {
  const { selected, getModelState } = useModelCatalog();

  const asrReady =
    !!selected.asr &&
    (getModelState(selected.asr).status === "selected" ||
      getModelState(selected.asr).status === "installed");

  const getDownloadState = useCallback(
    (_locale: string): SttDownloadState => {
      if (asrReady) return { status: "installed" };
      return {
        status: "not_installed",
        code: "STT_OFFLINE_MODELS_MISSING",
        error: "Descarga un modelo de transcripción en Ajustes de modelos",
      };
    },
    [asrReady],
  );

  const downloadSttModel = useCallback(async (_locale: string) => {
    /* Per-locale packs removed — models managed on /modelos */
  }, []);

  const refreshInstalledLocales = useCallback(async () => {
    return [] as string[];
  }, []);

  const checkLocale = useCallback(async (_locale: string) => {
    /* no-op: availability is global Whisper install */
  }, []);

  const isLocaleDownloadable = useCallback((_locale: string) => false, []);

  return useMemo(
    () => ({
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
      onDeviceSttAvailable: asrReady,
    }),
    [
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
      asrReady,
    ],
  );
}
