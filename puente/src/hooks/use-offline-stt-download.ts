/**
 * STT offline state for Whisper (bundled multilingual model).
 * Keeps the same API as the former Google/ASI download hook so Languages UI
 * and session context keep working without per-locale system packs.
 */
import { useCallback, useMemo } from "react";

import type { SttErrorCode } from "@/lib/stt-errors";

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

const INSTALLED: SttDownloadState = { status: "installed" };

export function useOfflineSttDownload() {
  const getDownloadState = useCallback((_locale: string): SttDownloadState => {
    return INSTALLED;
  }, []);

  const downloadSttModel = useCallback(async (_locale: string) => {
    /* Whisper Tiny is bundled — nothing to download. */
  }, []);

  const refreshInstalledLocales = useCallback(async () => {
    return [] as string[];
  }, []);

  const checkLocale = useCallback(async (_locale: string) => {
    /* always installed */
  }, []);

  const isLocaleDownloadable = useCallback((_locale: string) => false, []);

  return useMemo(
    () => ({
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
      onDeviceSttAvailable: true,
    }),
    [
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
    ],
  );
}
