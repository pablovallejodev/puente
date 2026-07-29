import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  baseHydrated: boolean;
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
  const userTouchedOutputRef = useRef(false);

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
        // Do not clobber a selection the user already made during boot.
        if (!userTouchedOutputRef.current) {
          const fromPref = savedId ? findTraductorLanguageById(savedId) : null;
          setOutputLanguageState(
            fromPref ?? resolveDeviceTraductorLanguage(getDeviceLocaleTag()),
          );
        }
      } catch {
        if (cancelled || userTouchedOutputRef.current) return;
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
    userTouchedOutputRef.current = true;
    setOutputLanguageState(lang);
    void setSelectedBaseLanguageId(lang.id).catch(() => {
      /* prefs best-effort */
    });
  }, []);

  const value = useMemo<TraductorSessionContextValue>(
    () => ({
      inputLanguage,
      outputLanguage,
      baseHydrated,
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
      baseHydrated,
      onDeviceSttAvailable,
      selectUniversalInput,
      selectFixedInputLanguage,
      setOutputLanguage,
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
    throw new Error(
      "useTraductorSession must be used within TraductorSessionProvider",
    );
  }
  return ctx;
}

export { TRADUCTOR_LANGUAGES };
