import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getDeviceLocaleTag } from '@/constants/languages';
import {
  DEFAULT_INPUT_LANGUAGE,
  FALLBACK_OUTPUT_LANGUAGE,
  findTraductorLanguageById,
  resolveDeviceTraductorLanguage,
  TRADUCTOR_LANGUAGES,
  UNIVERSAL_INPUT,
  type InputLanguageSelection,
  type TraductorLanguage,
} from '@/constants/traductor-languages';
import { useOfflineSttDownload, type SttDownloadState } from '@/hooks/use-offline-stt-download';
import { resolveLanguageTwo } from '@/lib/language-two-default';
import {
  readSelectedBaseLanguageId,
  readSelectedLanguageTwoId,
  readTraductorMode,
  setSelectedBaseLanguageId,
  setSelectedLanguageTwoId,
  writeTraductorMode,
} from '@/lib/model-preferences';
import { DEFAULT_TRADUCTOR_MODE, type TraductorMode } from '@/lib/traductor-mode';

type TraductorSessionContextValue = {
  mode: TraductorMode;
  modeMenuInitiallyOpen: boolean;
  inputLanguage: InputLanguageSelection;
  outputLanguage: TraductorLanguage;
  languageTwo: TraductorLanguage;
  baseHydrated: boolean;
  onDeviceSttAvailable: boolean;
  setMode: (mode: TraductorMode) => void;
  selectUniversalInput: () => void;
  selectFixedInputLanguage: (lang: TraductorLanguage) => void;
  setOutputLanguage: (lang: TraductorLanguage) => void;
  setLanguageTwo: (lang: TraductorLanguage) => void;
  getDownloadState: (locale: string) => SttDownloadState;
  downloadSttModel: (locale: string) => Promise<void>;
  refreshInstalledLocales: () => Promise<string[]>;
  checkLocale: (locale: string) => Promise<void>;
  isLocaleDownloadable: (locale: string) => boolean;
};

const TraductorSessionContext = createContext<TraductorSessionContextValue | null>(null);

function defaultLanguageTwo(languageOneId: string): TraductorLanguage {
  return resolveLanguageTwo(null, languageOneId);
}

export function TraductorSessionProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<TraductorMode>(DEFAULT_TRADUCTOR_MODE);
  const [modeMenuInitiallyOpen, setModeMenuInitiallyOpen] = useState(false);
  const [inputLanguage, setInputLanguage] = useState<InputLanguageSelection>(DEFAULT_INPUT_LANGUAGE);
  const [outputLanguage, setOutputLanguageState] = useState<TraductorLanguage>(FALLBACK_OUTPUT_LANGUAGE);
  const [languageTwo, setLanguageTwoState] = useState<TraductorLanguage>(() =>
    defaultLanguageTwo(FALLBACK_OUTPUT_LANGUAGE.id),
  );
  const [baseHydrated, setBaseHydrated] = useState(false);
  const userTouchedOutputRef = useRef(false);
  const userTouchedLanguageTwoRef = useRef(false);

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
        const [savedBaseId, modePref, savedLangTwoId] = await Promise.all([
          readSelectedBaseLanguageId(),
          readTraductorMode(),
          readSelectedLanguageTwoId(),
        ]);
        if (cancelled) return;

        if (modePref.wasAbsent) {
          setModeMenuInitiallyOpen(true);
          void writeTraductorMode(modePref.mode).catch(() => {
            /* prefs best-effort */
          });
        }
        setModeState(modePref.mode);

        let nextOutput = outputLanguage;
        if (!userTouchedOutputRef.current) {
          const fromPref = savedBaseId ? findTraductorLanguageById(savedBaseId) : null;
          nextOutput = fromPref ?? resolveDeviceTraductorLanguage(getDeviceLocaleTag());
          setOutputLanguageState(nextOutput);
        }

        if (!userTouchedLanguageTwoRef.current) {
          setLanguageTwoState(resolveLanguageTwo(savedLangTwoId, nextOutput.id));
        }
      } catch {
        if (cancelled) return;
        if (!userTouchedOutputRef.current) {
          const deviceLang = resolveDeviceTraductorLanguage(getDeviceLocaleTag());
          setOutputLanguageState(deviceLang);
          if (!userTouchedLanguageTwoRef.current) {
            setLanguageTwoState(resolveLanguageTwo(null, deviceLang.id));
          }
        }
      } finally {
        if (!cancelled) setBaseHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Boot hydrate once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback((next: TraductorMode) => {
    setModeState(next);
    void writeTraductorMode(next).catch(() => {
      /* prefs best-effort */
    });
  }, []);

  const selectUniversalInput = useCallback(() => {
    setInputLanguage(UNIVERSAL_INPUT);
  }, []);

  const selectFixedInputLanguage = useCallback(
    (lang: TraductorLanguage) => {
      if (lang.id === outputLanguage.id || lang.id === languageTwo.id) {
        return;
      }
      setInputLanguage({ kind: 'fixed', language: lang });
    },
    [languageTwo.id, outputLanguage.id],
  );

  const setOutputLanguage = useCallback(
    (lang: TraductorLanguage) => {
      if (lang.id === languageTwo.id || (inputLanguage.kind === 'fixed' && inputLanguage.language.id === lang.id)) {
        return;
      }
      userTouchedOutputRef.current = true;
      setOutputLanguageState(lang);
      void setSelectedBaseLanguageId(lang.id).catch(() => {
        /* prefs best-effort */
      });
    },
    [inputLanguage, languageTwo.id],
  );

  const setLanguageTwo = useCallback(
    (lang: TraductorLanguage) => {
      if (lang.id === outputLanguage.id || (inputLanguage.kind === 'fixed' && inputLanguage.language.id === lang.id)) {
        return;
      }
      userTouchedLanguageTwoRef.current = true;
      setLanguageTwoState(lang);
      void setSelectedLanguageTwoId(lang.id).catch(() => {
        /* prefs best-effort */
      });
    },
    [inputLanguage, outputLanguage.id],
  );

  const value = useMemo<TraductorSessionContextValue>(
    () => ({
      mode,
      modeMenuInitiallyOpen,
      inputLanguage,
      outputLanguage,
      languageTwo,
      baseHydrated,
      onDeviceSttAvailable,
      setMode,
      selectUniversalInput,
      selectFixedInputLanguage,
      setOutputLanguage,
      setLanguageTwo,
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
    }),
    [
      mode,
      modeMenuInitiallyOpen,
      inputLanguage,
      outputLanguage,
      languageTwo,
      baseHydrated,
      onDeviceSttAvailable,
      setMode,
      selectUniversalInput,
      selectFixedInputLanguage,
      setOutputLanguage,
      setLanguageTwo,
      getDownloadState,
      downloadSttModel,
      refreshInstalledLocales,
      checkLocale,
      isLocaleDownloadable,
    ],
  );

  return <TraductorSessionContext.Provider value={value}>{children}</TraductorSessionContext.Provider>;
}

export function useTraductorSession(): TraductorSessionContextValue {
  const ctx = useContext(TraductorSessionContext);
  if (!ctx) {
    throw new Error('useTraductorSession must be used within TraductorSessionProvider');
  }
  return ctx;
}

export { TRADUCTOR_LANGUAGES };
