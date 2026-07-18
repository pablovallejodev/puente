import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

const ANDROID_AS_PACKAGE = "com.google.android.as";
const POLL_INTERVAL_MS = 1500;
const EXPECTED_DOWNLOAD_MS = 30_000;

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
  progress: number;
};

const DEFAULT_STATE: SttDownloadState = {
  status: "idle",
  progress: 0,
};

function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}

function localeMatches(installed: string, target: string): boolean {
  const a = normalizeLocale(installed);
  const b = normalizeLocale(target);
  if (a === b) return true;
  const [aLang] = a.split("-");
  const [bLang] = b.split("-");
  return aLang === bLang;
}

function isLocaleInstalled(
  installedLocales: string[],
  locale: string,
): boolean {
  return installedLocales.some((installed) =>
    localeMatches(installed, locale),
  );
}

export function useOfflineSttDownload() {
  const [states, setStates] = useState<Record<string, SttDownloadState>>({});
  const [installedLocales, setInstalledLocales] = useState<string[]>([]);
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );
  const downloadStartRef = useRef<Map<string, number>>(new Map());

  const setLocaleState = useCallback(
    (locale: string, patch: Partial<SttDownloadState>) => {
      setStates((prev) => ({
        ...prev,
        [locale]: { ...DEFAULT_STATE, ...prev[locale], ...patch },
      }));
    },
    [],
  );

  const fetchInstalledLocales = useCallback(async (): Promise<string[]> => {
    if (Platform.OS === "ios") {
      const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      return onDevice ? ["ios-on-device"] : [];
    }

    if (Platform.OS !== "android") {
      return [];
    }

    try {
      const result = await ExpoSpeechRecognitionModule.getSupportedLocales({
        androidRecognitionServicePackage: ANDROID_AS_PACKAGE,
      });
      return result.installedLocales ?? [];
    } catch {
      return [];
    }
  }, []);

  const refreshInstalledLocales = useCallback(async () => {
    const installed = await fetchInstalledLocales();
    setInstalledLocales(installed);

    setStates((prev) => {
      const next = { ...prev };
      for (const lang of Object.keys(next)) {
        if (isLocaleInstalled(installed, lang)) {
          next[lang] = { status: "installed", progress: 100 };
        }
      }
      return next;
    });

    return installed;
  }, [fetchInstalledLocales]);

  const stopPolling = useCallback((locale: string) => {
    const timer = pollTimersRef.current.get(locale);
    if (timer) {
      clearInterval(timer);
      pollTimersRef.current.delete(locale);
    }
  }, []);

  const startPolling = useCallback(
    (locale: string) => {
      stopPolling(locale);
      downloadStartRef.current.set(locale, Date.now());

      const timer = setInterval(async () => {
        const installed = await fetchInstalledLocales();
        setInstalledLocales(installed);

        if (isLocaleInstalled(installed, locale)) {
          stopPolling(locale);
          setLocaleState(locale, { status: "installed", progress: 100 });
          return;
        }

        const started = downloadStartRef.current.get(locale) ?? Date.now();
        const elapsed = Date.now() - started;
        const estimated = Math.min(
          90,
          Math.round((elapsed / EXPECTED_DOWNLOAD_MS) * 90),
        );
        setLocaleState(locale, {
          status: "downloading",
          progress: Math.max(5, estimated),
        });
      }, POLL_INTERVAL_MS);

      pollTimersRef.current.set(locale, timer);
    },
    [fetchInstalledLocales, setLocaleState, stopPolling],
  );

  const checkLocale = useCallback(
    async (locale: string) => {
      setLocaleState(locale, { status: "checking", progress: 0 });
      const installed = await fetchInstalledLocales();
      setInstalledLocales(installed);

      if (Platform.OS === "ios") {
        const onDevice =
          ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
        setLocaleState(locale, {
          status: onDevice ? "installed" : "not_installed",
          progress: onDevice ? 100 : 0,
        });
        return;
      }

      if (isLocaleInstalled(installed, locale)) {
        setLocaleState(locale, { status: "installed", progress: 100 });
      } else {
        setLocaleState(locale, { status: "not_installed", progress: 0 });
      }
    },
    [fetchInstalledLocales, setLocaleState],
  );

  const downloadSttModel = useCallback(
    async (locale: string) => {
      const current = states[locale];
      if (
        current?.status === "downloading" ||
        current?.status === "installed"
      ) {
        return;
      }

      if (Platform.OS === "ios") {
        const onDevice =
          ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
        setLocaleState(locale, {
          status: onDevice ? "installed" : "not_installed",
          progress: onDevice ? 100 : 0,
        });
        return;
      }

      if (Platform.OS !== "android") {
        setLocaleState(locale, { status: "error", progress: 0 });
        return;
      }

      setLocaleState(locale, { status: "downloading", progress: 5 });
      startPolling(locale);

      try {
        const result =
          await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload(
            { locale },
          );

        if (result.status === "download_success") {
          stopPolling(locale);
          await refreshInstalledLocales();
          setLocaleState(locale, { status: "installed", progress: 100 });
          return;
        }

        if (result.status === "download_canceled") {
          stopPolling(locale);
          setLocaleState(locale, { status: "error", progress: 0 });
          return;
        }

        // opened_dialog on Android 13 — keep polling until user completes
        setLocaleState(locale, { status: "downloading", progress: 15 });
      } catch {
        stopPolling(locale);
        setLocaleState(locale, { status: "error", progress: 0 });
      }
    },
    [
      refreshInstalledLocales,
      setLocaleState,
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
        if (onDevice) return { status: "installed", progress: 100 };
      }

      if (isLocaleInstalled(installedLocales, locale)) {
        return { status: "installed", progress: 100 };
      }

      return states[locale] ?? { status: "idle", progress: 0 };
    },
    [installedLocales, states],
  );

  useEffect(() => {
    void refreshInstalledLocales();

    return () => {
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
  };
}
