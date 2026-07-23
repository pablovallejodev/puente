import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  TRADUCTOR_LANGUAGES,
  DEFAULT_INPUT_LANGUAGES,
  DEFAULT_OUTPUT_LANGUAGE,
  type TraductorLanguage,
} from "@/constants/traductor-languages";
import {
  useOfflineSttDownload,
  type SttDownloadState,
} from "@/hooks/use-offline-stt-download";
import {
  applyInputLanguageSelection,
  getInputSttMode,
  isLocaleInstalledState,
  removeDownloadedInputLanguage,
  sanitizeInputLanguages,
  type InputSttMode,
} from "@/lib/traductor-input-mode";

type TraductorSessionContextValue = {
  inputLanguages: TraductorLanguage[];
  primaryInputLanguage: TraductorLanguage;
  outputLanguage: TraductorLanguage;
  inputSttMode: InputSttMode;
  selectInputLanguage: (lang: TraductorLanguage) => void;
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

  const {
    getDownloadState,
    downloadSttModel,
    refreshInstalledLocales,
    checkLocale,
    isLocaleDownloadable,
  } = useOfflineSttDownload();

  const primaryInputLanguage = inputLanguages[0];

  const inputSttMode = useMemo(
    () => getInputSttMode(inputLanguages, getDownloadState),
    [inputLanguages, getDownloadState],
  );

  const selectInputLanguage = useCallback(
    (lang: TraductorLanguage) => {
      const installed = isLocaleInstalledState(getDownloadState(lang.speechLocale));
      setInputLanguages((prev) =>
        applyInputLanguageSelection(prev, lang, installed, getDownloadState),
      );
    },
    [getDownloadState],
  );

  const removeInputLanguage = useCallback(
    (id: string) => {
      setInputLanguages((prev) =>
        removeDownloadedInputLanguage(prev, id, getDownloadState),
      );
    },
    [getDownloadState],
  );

  useEffect(() => {
    setInputLanguages((prev) => {
      const next = sanitizeInputLanguages(prev, getDownloadState);
      if (
        next.length === prev.length &&
        next.every((lang, index) => lang.id === prev[index]?.id)
      ) {
        return prev;
      }
      return next;
    });
  }, [getDownloadState]);

  const value = useMemo<TraductorSessionContextValue>(
    () => ({
      inputLanguages,
      primaryInputLanguage,
      outputLanguage,
      inputSttMode,
      selectInputLanguage,
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
      inputSttMode,
      selectInputLanguage,
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
