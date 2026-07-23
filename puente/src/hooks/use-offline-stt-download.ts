import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

import { fetchAndroidLocaleSnapshot } from "@/lib/android-stt-service";
import {
  isLocaleInstalled,
  isLocaleSupported,
} from "@/lib/stt-locale";
import { type SttErrorCode } from "@/lib/stt-errors";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_MS = 5 * 60_000;

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

const DEFAULT_STATE: SttDownloadState = { status: "idle" };

type LocaleSnapshot = {
  supportedLocales: string[];
  installedLocales: string[];
};

function logStt(op: string, locale: string, detail?: string): void {
  const suffix = detail ? `: ${detail}` : "";
  console.warn(`[stt:${Platform.OS}] ${op} ${locale}${suffix}`);
}

function setErrorState(
  setLocaleState: (locale: string, patch: Partial<SttDownloadState>) => void,
  locale: string,
  code: SttErrorCode,
  message: string,
): void {
  setLocaleState(locale, { status: "error", error: message, code });
  logStt("error", locale, `${code}: ${message}`);
}

function androidSupportsDownload(): boolean {
  return Platform.OS === "android" && Platform.Version >= 33;
}

export function useOfflineSttDownload() {
  const [states, setStates] = useState<Record<string, SttDownloadState>>({});
  const [snapshot, setSnapshot] = useState<LocaleSnapshot>({
    supportedLocales: [],
    installedLocales: [],
  });

  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );
  const pollStartedRef = useRef<Map<string, number>>(new Map());
  const fetchPromiseRef = useRef<Promise<LocaleSnapshot> | null>(null);
  const pollingRef = useRef(false);

  const setLocaleState = useCallback(
    (locale: string, patch: Partial<SttDownloadState>) => {
      setStates((prev) => ({
        ...prev,
        [locale]: { ...DEFAULT_STATE, ...prev[locale], ...patch },
      }));
    },
    [],
  );

  const fetchLocales = useCallback(async (): Promise<LocaleSnapshot> => {
    if (fetchPromiseRef.current) return fetchPromiseRef.current;

    fetchPromiseRef.current = (async () => {
      if (Platform.OS === "ios") {
        const onDevice =
          ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
        return {
          supportedLocales: onDevice ? ["ios-on-device"] : [],
          installedLocales: onDevice ? ["ios-on-device"] : [],
        };
      }

      if (Platform.OS !== "android") {
        return { supportedLocales: [], installedLocales: [] };
      }

      try {
        const result = await fetchAndroidLocaleSnapshot();
        return {
          supportedLocales: result.supportedLocales,
          installedLocales: result.installedLocales,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logStt("fetchLocales", "*", message);
        throw new Error(message);
      } finally {
        fetchPromiseRef.current = null;
      }
    })();

    return fetchPromiseRef.current;
  }, []);

  const refreshInstalledLocales = useCallback(async (): Promise<string[]> => {
    try {
      const next = await fetchLocales();
      setSnapshot(next);

      setStates((prev) => {
        const updated = { ...prev };
        for (const lang of Object.keys(updated)) {
          if (isLocaleInstalled(next.installedLocales, lang)) {
            updated[lang] = { status: "installed" };
          }
        }
        return updated;
      });

      return next.installedLocales;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logStt("refresh", "*", message);
      return snapshot.installedLocales;
    }
  }, [fetchLocales, snapshot.installedLocales]);

  const stopPolling = useCallback((locale: string) => {
    const timer = pollTimersRef.current.get(locale);
    if (timer) {
      clearInterval(timer);
      pollTimersRef.current.delete(locale);
    }
    pollStartedRef.current.delete(locale);
  }, []);

  const startPolling = useCallback(
    (locale: string) => {
      stopPolling(locale);
      pollStartedRef.current.set(locale, Date.now());

      const timer = setInterval(() => {
        if (pollingRef.current) return;
        pollingRef.current = true;

        void (async () => {
          try {
            const started = pollStartedRef.current.get(locale) ?? Date.now();
            if (Date.now() - started > MAX_POLL_MS) {
              stopPolling(locale);
              setErrorState(
                setLocaleState,
                locale,
                "STT_POLL_TIMEOUT",
                "Tiempo de espera agotado",
              );
              return;
            }

            const next = await fetchLocales();
            setSnapshot(next);

            if (isLocaleInstalled(next.installedLocales, locale)) {
              stopPolling(locale);
              setLocaleState(locale, { status: "installed" });
              return;
            }

            setLocaleState(locale, { status: "downloading" });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            stopPolling(locale);
            setErrorState(
              setLocaleState,
              locale,
              "STT_FETCH_LOCALES_FAILED",
              message,
            );
          } finally {
            pollingRef.current = false;
          }
        })();
      }, POLL_INTERVAL_MS);

      pollTimersRef.current.set(locale, timer);
    },
    [fetchLocales, setLocaleState, stopPolling],
  );

  const isLocaleDownloadable = useCallback(
    (locale: string): boolean => {
      if (!androidSupportsDownload()) return false;
      if (snapshot.supportedLocales.length === 0) return true;
      return isLocaleSupported(snapshot.supportedLocales, locale);
    },
    [snapshot.supportedLocales],
  );

  const checkLocale = useCallback(
    async (locale: string) => {
      setLocaleState(locale, { status: "checking" });
      try {
        const next = await fetchLocales();
        setSnapshot(next);

        if (Platform.OS === "ios") {
          const onDevice =
            ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
          setLocaleState(locale, {
            status: onDevice ? "installed" : "not_installed",
          });
          return;
        }

        if (isLocaleInstalled(next.installedLocales, locale)) {
          setLocaleState(locale, { status: "installed" });
        } else {
          setLocaleState(locale, { status: "not_installed" });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setLocaleState(locale, { status: "not_installed", error: message });
        logStt("checkLocale", locale, message);
      }
    },
    [fetchLocales, setLocaleState],
  );

  const downloadSttModel = useCallback(
    async (locale: string) => {
      const current = states[locale];
      if (
        current?.status === "downloading" ||
        current?.status === "scheduled" ||
        current?.status === "installed"
      ) {
        return;
      }

      if (!androidSupportsDownload()) {
        setErrorState(
          setLocaleState,
          locale,
          "STT_DOWNLOAD_UNAVAILABLE",
          "Descarga no disponible en este dispositivo",
        );
        return;
      }

      if (
        snapshot.supportedLocales.length > 0 &&
        !isLocaleSupported(snapshot.supportedLocales, locale)
      ) {
        setErrorState(
          setLocaleState,
          locale,
          "STT_LOCALE_NOT_SUPPORTED",
          "Idioma no disponible para descarga",
        );
        return;
      }

      setLocaleState(locale, { status: "downloading" });
      startPolling(locale);

      try {
        const result =
          await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload(
            { locale },
          );

        if (result.status === "download_success") {
          stopPolling(locale);
          await refreshInstalledLocales();
          setLocaleState(locale, { status: "installed" });
          return;
        }

        if (result.status === "download_scheduled") {
          setLocaleState(locale, { status: "scheduled" });
          return;
        }

        setLocaleState(locale, { status: "downloading" });
      } catch (err) {
        stopPolling(locale);
        const message = err instanceof Error ? err.message : String(err);
        setErrorState(
          setLocaleState,
          locale,
          "STT_DOWNLOAD_TRIGGER_FAILED",
          message,
        );
      }
    },
    [
      refreshInstalledLocales,
      setLocaleState,
      snapshot.supportedLocales,
      startPolling,
      states,
      stopPolling,
    ],
  );

  const getDownloadState = useCallback(
    (locale: string): SttDownloadState => {
      if (Platform.OS === "ios") {
        const onDevice =
          ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
        if (onDevice) return { status: "installed" };
      }

      if (isLocaleInstalled(snapshot.installedLocales, locale)) {
        return { status: "installed" };
      }

      return states[locale] ?? { status: "idle" };
    },
    [snapshot.installedLocales, states],
  );

  useEffect(() => {
    void refreshInstalledLocales();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshInstalledLocales();
    });

    return () => {
      sub.remove();
      for (const timer of pollTimersRef.current.values()) {
        clearInterval(timer);
      }
      pollTimersRef.current.clear();
    };
  }, [refreshInstalledLocales]);

  return {
    getDownloadState,
    downloadSttModel,
    refreshInstalledLocales,
    checkLocale,
    isLocaleDownloadable,
  };
}
