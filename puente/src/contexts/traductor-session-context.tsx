import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getDeviceLocaleTag } from "@/constants/languages";
import {
  DEFAULT_INPUT_LANGUAGE,
  FALLBACK_OUTPUT_LANGUAGE,
  findTraductorLanguageById,
  resolveDeviceTraductorLanguage,
  TRADUCTOR_LANGUAGES,
  UNIVERSAL_INPUT,
  type InputLanguageSelection,
  type TraductorLanguage,
} from "@/constants/traductor-languages";
import {
  useOfflineSttDownload,
  type SttDownloadState,
} from "@/hooks/use-offline-stt-download";
import {
  readSelectedBaseLanguageId,
  setSelectedBaseLanguageId,
} from "@/lib/model-preferences";

type TraductorSessionContextValue = {
  inputLanguage: InputLanguageSelection;
  outputLanguage: TraductorLanguage;
  onDeviceSttAvailable: boolean;
  selectUniversalInput: () => void;
  selectFixedInputLanguage: (lang: TraductorLanguage) => void;
  setOutputLanguage: (lang: TraductorLanguage) => void;
  getDownloadState: (locale: string) => SttDownloadState;
  downloadSttModel: (locale: string) => Promise<void>;
  refreshInstalledLocales: () => Promise<string[]>;
  checkLocale: (locale: string) => Promise<void>;
  isLocaleDownloadable: (locale: string) => boolean;
};

const TraductorSessionContext = createContext<TraductorSessionContextValue | null>(
  null,
);

export function TraductorSessionProvider({ children }: { children: ReactNode }) {
  const [inputLanguage, setInputLanguage] = useState<InputLanguageSelection>(
    DEFAULT_INPUT_LANGUAGE,
  );
  const [outputLanguage, setOutputLanguageState] = useState<TraductorLanguage>(
    FALLBACK_OUTPUT_LANGUAGE,
  );
  const [baseHydrated, setBaseHydrated] = useState(false);

  const {
    getDownloadState,
    downloadSttModel,
    refreshInstalledLocales,
    checkLocale,
    isLocaleDownloadable,
    onDeviceSttAvailable,
  } = useOfflineSttDownload();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const savedId = await readSelectedBaseLanguageId();
        if (cancelled) return;
        const fromPref = savedId ? findTraductorLanguageById(savedId) : null;
        setOutputLanguageState(
          fromPref ?? resolveDeviceTraductorLanguage(getDeviceLocaleTag()),
        );
      } catch {
        if (cancelled) return;
        setOutputLanguageState(
          resolveDeviceTraductorLanguage(getDeviceLocaleTag()),
        );
      } finally {
        if (!cancelled) setBaseHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectUniversalInput = useCallback(() => {
    setInputLanguage(UNIVERSAL_INPUT);
  }, []);

  const selectFixedInputLanguage = useCallback((lang: TraductorLanguage) => {
    setInputLanguage({ kind: "fixed", language: lang });
  }, []);

  const setOutputLanguage = useCallback((lang: TraductorLanguage) => {
    setOutputLanguageState(lang);
    void setSelectedBaseLanguageId(lang.id).catch(() => {
      /* prefs best-effort */
    });
  }, []);

  const value = useMemo<TraductorSessionContextValue>(
    () => ({
      inputLanguage,
      outputLanguage,
      onDeviceSttAvailable,
      selectUniversalInput,
      selectFixedInputLanguage,
      setOutputLanguage,
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
    }),
    [
      inputLanguage,
      outputLanguage,
      onDeviceSttAvailable,
      selectUniversalInput,
      selectFixedInputLanguage,
      setOutputLanguage,
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
      baseHydrated,
    ],
  );

  return (
    <TraductorSessionContext.Provider value={value}>
      {children}
    </TraductorSessionContext.Provider>
  );
}

export function useTraductorSession(): TraductorSessionContextValue {
  const ctx = useContext(TraductorSessionContext);
  if (!ctx) {
    throw new Error(
      "useTraductorSession must be used within TraductorSessionProvider",
    );
  }
  return ctx;
}

export { TRADUCTOR_LANGUAGES };
