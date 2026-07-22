import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  TRADUCTOR_LANGUAGES,
  DEFAULT_INPUT_LANGUAGES,
  DEFAULT_OUTPUT_LANGUAGE,
  MAX_INPUT_LANGUAGES,
  type TraductorLanguage,
} from "@/constants/traductor-languages";
import {
  useOfflineSttDownload,
  type SttDownloadState,
} from "@/hooks/use-offline-stt-download";

type TraductorSessionContextValue = {
  inputLanguages: TraductorLanguage[];
  primaryInputLanguage: TraductorLanguage;
  outputLanguage: TraductorLanguage;
  addInputLanguage: (lang: TraductorLanguage) => void;
  removeInputLanguage: (id: string) => void;
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
  const [inputLanguages, setInputLanguages] = useState<TraductorLanguage[]>(
    DEFAULT_INPUT_LANGUAGES,
  );
  const [outputLanguage, setOutputLanguage] = useState<TraductorLanguage>(
    DEFAULT_OUTPUT_LANGUAGE,
  );

  const primaryInputLanguage = inputLanguages[0];

  const addInputLanguage = useCallback((lang: TraductorLanguage) => {
    setInputLanguages((prev) => {
      if (prev.length >= MAX_INPUT_LANGUAGES) return prev;
      if (prev.some((l) => l.id === lang.id)) return prev;
      return [...prev, lang];
    });
  }, []);

  const removeInputLanguage = useCallback((id: string) => {
    setInputLanguages((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((l) => l.id !== id);
    });
  }, []);

  const {
    getDownloadState,
    downloadSttModel,
    refreshInstalledLocales,
    checkLocale,
    isLocaleDownloadable,
  } = useOfflineSttDownload();

  const value = useMemo<TraductorSessionContextValue>(
    () => ({
      inputLanguages,
      primaryInputLanguage,
      outputLanguage,
      addInputLanguage,
      removeInputLanguage,
      setOutputLanguage,
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
    }),
    [
      inputLanguages,
      primaryInputLanguage,
      outputLanguage,
      addInputLanguage,
      removeInputLanguage,
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
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
    throw new Error("useTraductorSession must be used within TraductorSessionProvider");
  }
  return ctx;
}

export { TRADUCTOR_LANGUAGES };
