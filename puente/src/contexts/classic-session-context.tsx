import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CLASSIC_LANGUAGES,
  DEFAULT_INPUT_LANGUAGE,
  DEFAULT_OUTPUT_LANGUAGE,
  type ClassicLanguage,
} from "@/constants/classic-languages";
import {
  useOfflineSttDownload,
  type SttDownloadState,
} from "@/hooks/use-offline-stt-download";

type ClassicSessionContextValue = {
  inputLanguage: ClassicLanguage;
  outputLanguage: ClassicLanguage;
  setInputLanguage: (lang: ClassicLanguage) => void;
  setOutputLanguage: (lang: ClassicLanguage) => void;
  getDownloadState: (locale: string) => SttDownloadState;
  downloadSttModel: (locale: string) => Promise<void>;
  refreshInstalledLocales: () => Promise<string[]>;
  checkLocale: (locale: string) => Promise<void>;
  isLocaleDownloadable: (locale: string) => boolean;
};

const ClassicSessionContext = createContext<ClassicSessionContextValue | null>(
  null,
);

export function ClassicSessionProvider({ children }: { children: ReactNode }) {
  const [inputLanguage, setInputLanguage] = useState<ClassicLanguage>(
    DEFAULT_INPUT_LANGUAGE,
  );
  const [outputLanguage, setOutputLanguage] = useState<ClassicLanguage>(
    DEFAULT_OUTPUT_LANGUAGE,
  );

  const {
    getDownloadState,
    downloadSttModel,
    refreshInstalledLocales,
    checkLocale,
    isLocaleDownloadable,
  } = useOfflineSttDownload();

  const value = useMemo<ClassicSessionContextValue>(
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
    <ClassicSessionContext.Provider value={value}>
      {children}
    </ClassicSessionContext.Provider>
  );
}

export function useClassicSession(): ClassicSessionContextValue {
  const ctx = useContext(ClassicSessionContext);
  if (!ctx) {
    throw new Error("useClassicSession must be used within ClassicSessionProvider");
  }
  return ctx;
}

export { CLASSIC_LANGUAGES };
