import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  TRADUCTOR_LANGUAGES,
  DEFAULT_INPUT_LANGUAGE,
  DEFAULT_OUTPUT_LANGUAGE,
  type TraductorLanguage,
} from "@/constants/traductor-languages";
import {
  useOfflineSttDownload,
  type SttDownloadState,
} from "@/hooks/use-offline-stt-download";

type TraductorSessionContextValue = {
  inputLanguage: TraductorLanguage;
  outputLanguage: TraductorLanguage;
  setInputLanguage: (lang: TraductorLanguage) => void;
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
  const [inputLanguage, setInputLanguage] = useState<TraductorLanguage>(
    DEFAULT_INPUT_LANGUAGE,
  );
  const [outputLanguage, setOutputLanguage] = useState<TraductorLanguage>(
    DEFAULT_OUTPUT_LANGUAGE,
  );

  const {
    getDownloadState,
    downloadSttModel,
    refreshInstalledLocales,
    checkLocale,
    isLocaleDownloadable,
  } = useOfflineSttDownload();

  const value = useMemo<TraductorSessionContextValue>(
    () => ({
      inputLanguage,
      outputLanguage,
      setInputLanguage,
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
