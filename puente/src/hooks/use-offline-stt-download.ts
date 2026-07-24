/**
 * STT offline state for Whisper — available when a Whisper model is selected
 * and installed via the model catalog.
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
  const { selectedWhisperId, getModelState } = useModelCatalog();

  const whisperReady =
    !!selectedWhisperId &&
    (getModelState(selectedWhisperId).status === "selected" ||
      getModelState(selectedWhisperId).status === "installed");

  const getDownloadState = useCallback(
    (_locale: string): SttDownloadState => {
      if (whisperReady) return { status: "installed" };
      return {
        status: "not_installed",
        code: "STT_OFFLINE_MODELS_MISSING",
        error: "Descarga un modelo Whisper en Ajustes de modelos",
      };
    },
    [whisperReady],
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
      onDeviceSttAvailable: whisperReady,
    }),
    [
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
      whisperReady,
    ],
  );
}
