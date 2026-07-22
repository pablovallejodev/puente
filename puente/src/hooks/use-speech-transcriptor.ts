import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  ExpoSpeechRecognitionModule,
  RecognizerIntentEnableLanguageSwitch,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { setAudioModeAsync } from "expo-audio";

const ANDROID_AS_PACKAGE = "com.google.android.as";
const CONTINUOUS_RECOGNITION = true;
const RESTART_DELAY_MS = 300;
const ERROR_BACKOFF_MS = 1000;

export type SpeechError = {
  code: string;
  message: string;
} | null;

export type SpeechTranscriptorOptions = {
  requiresOnDeviceRecognition?: boolean;
  onInterimTranscript?: (
    text: string,
    isFinal: boolean,
    detectedLocale?: string,
  ) => void;
  enabled?: boolean;
};

export function useSpeechTranscriptor(
  inputLocales: string[],
  options: SpeechTranscriptorOptions = {},
) {
  const {
    requiresOnDeviceRecognition = false,
    onInterimTranscript,
    enabled = true,
  } = options;

  const localesKey = inputLocales.join("|");

  const [hasPermissions, setHasPermissions] = useState<boolean>(false);
  const [checkingPermissions, setCheckingPermissions] = useState<boolean>(true);
  const [transcript, setTranscript] = useState<string>("");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [error, setError] = useState<SpeechError>(null);

  const isMountedRef = useRef<boolean>(true);
  const permissionsGrantedRef = useRef<boolean>(false);
  const inputLocalesRef = useRef(inputLocales);
  const detectedLocaleRef = useRef<string>("");
  const requiresOnDeviceRef = useRef(requiresOnDeviceRecognition);
  const onInterimRef = useRef(onInterimTranscript);
  const sessionGenRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const prevLocalesKeyRef = useRef(localesKey);
  const prevOnDeviceRef = useRef(requiresOnDeviceRecognition);

  inputLocalesRef.current = inputLocales;
  requiresOnDeviceRef.current = requiresOnDeviceRecognition;
  onInterimRef.current = onInterimTranscript;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const startListeningInternal = useCallback(async () => {
    if (
      !enabled ||
      !permissionsGrantedRef.current ||
      stoppingRef.current ||
      startingRef.current
    ) {
      return;
    }

    startingRef.current = true;

    try {
      setTranscript("");

      const locales = inputLocalesRef.current;
      const primaryLocale = locales[0] ?? "en-US";
      const multiLang = locales.length > 1;
      const canDetectMulti =
        multiLang &&
        Platform.OS === "android" &&
        Platform.Version >= 34 &&
        requiresOnDeviceRef.current;

      if (__DEV__ && multiLang && !canDetectMulti) {
        console.info("[stt] multi_fallback_primary", { locales });
      }

      const startOptions: Parameters<
        typeof ExpoSpeechRecognitionModule.start
      >[0] = {
        lang: primaryLocale,
        maxAlternatives: 1,
        addsPunctuation: true,
        continuous: CONTINUOUS_RECOGNITION,
        interimResults: true,
        requiresOnDeviceRecognition: requiresOnDeviceRef.current,
      };

      if (canDetectMulti) {
        startOptions.androidRecognitionServicePackage = ANDROID_AS_PACKAGE;
        startOptions.androidIntentOptions = {
          EXTRA_ENABLE_LANGUAGE_DETECTION: true,
          EXTRA_ENABLE_LANGUAGE_SWITCH:
            RecognizerIntentEnableLanguageSwitch.LANGUAGE_SWITCH_BALANCED,
          EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES: locales,
          EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES: locales,
        };
      } else if (requiresOnDeviceRef.current && Platform.OS === "android") {
        startOptions.androidRecognitionServicePackage = ANDROID_AS_PACKAGE;
      }

      ExpoSpeechRecognitionModule.start(startOptions);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      setIsListening(false);
      const message = err instanceof Error ? err.message : String(err);
      setError({ code: "start_failed", message });
    } finally {
      startingRef.current = false;
    }
  }, [enabled]);

  const scheduleRestartWithStart = useCallback(
    (delayMs: number) => {
      clearRestartTimer();
      const gen = sessionGenRef.current;
      restartTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current || gen !== sessionGenRef.current) return;
        if (!enabled || !permissionsGrantedRef.current || stoppingRef.current) {
          return;
        }
        void startListeningInternal();
      }, delayMs);
    },
    [clearRestartTimer, enabled, startListeningInternal],
  );

  useSpeechRecognitionEvent("start", () => {
    if (!isMountedRef.current) return;
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isMountedRef.current) return;
    setIsListening(false);

    if (stoppingRef.current) return;

    if (permissionsGrantedRef.current && enabled) {
      scheduleRestartWithStart(RESTART_DELAY_MS);
    }
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!isMountedRef.current) return;

    if (event.results && event.results.length > 0) {
      const transcriptText = event.results
        .map((_result) => _result.transcript)
        .join(" ");
      const trimmed = transcriptText.trim();
      if (!trimmed) return;

      const goodTranscript = `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`;
      setTranscript(goodTranscript);

      const locale =
        detectedLocaleRef.current || inputLocalesRef.current[0] || "";
      onInterimRef.current?.(goodTranscript, event.isFinal, locale);

      if (event.isFinal) {
        setTranscript("");
        detectedLocaleRef.current = "";
      }
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (!isMountedRef.current) return;
    setIsListening(false);

    if (event.error !== "aborted" && event.error !== "no-speech") {
      setError({
        code: event.error,
        message: event.message ?? event.error,
      });

      if (permissionsGrantedRef.current && enabled && !stoppingRef.current) {
        scheduleRestartWithStart(ERROR_BACKOFF_MS);
      }
    }
  });

  useSpeechRecognitionEvent("languagedetection", (event) => {
    if (!event.detectedLanguage) return;
    detectedLocaleRef.current = event.detectedLanguage;
  });

  const stopListening = useCallback(() => {
    clearRestartTimer();
    stoppingRef.current = true;
    sessionGenRef.current += 1;

    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore
    }

    setIsListening(false);
  }, [clearRestartTimer]);

  const restartListening = useCallback(async () => {
    stopListening();
    stoppingRef.current = false;
    await new Promise((r) => setTimeout(r, 200));
    await startListeningInternal();
  }, [startListeningInternal, stopListening]);

  const requestPermissions = useCallback(async () => {
    try {
      setCheckingPermissions(true);

      const speechStatus =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!speechStatus.granted) {
        setHasPermissions(false);
        setCheckingPermissions(false);
        permissionsGrantedRef.current = false;
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      if (!available) {
        setHasPermissions(false);
        setCheckingPermissions(false);
        permissionsGrantedRef.current = false;
        return;
      }

      setHasPermissions(true);
      setCheckingPermissions(false);
      permissionsGrantedRef.current = true;

      if (enabled) await startListeningInternal();
    } catch (err) {
      setHasPermissions(false);
      setCheckingPermissions(false);
      permissionsGrantedRef.current = false;
      const message = err instanceof Error ? err.message : String(err);
      setError({ code: "permission_failed", message });
    }
  }, [enabled, startListeningInternal]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      stopListening();
      void setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      return () => {
        isMountedRef.current = false;
      };
    }

    stoppingRef.current = false;
    void requestPermissions();

    return () => {
      isMountedRef.current = false;
      stopListening();
      void setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
    };
  }, [enabled, requestPermissions, stopListening]);

  useEffect(() => {
    if (!permissionsGrantedRef.current || !enabled) return;

    const localesChanged = prevLocalesKeyRef.current !== localesKey;
    const onDeviceChanged =
      prevOnDeviceRef.current !== requiresOnDeviceRecognition;

    prevLocalesKeyRef.current = localesKey;
    prevOnDeviceRef.current = requiresOnDeviceRecognition;

    if (localesChanged || onDeviceChanged) {
      void restartListening();
    }
  }, [
    localesKey,
    requiresOnDeviceRecognition,
    enabled,
    restartListening,
  ]);

  return {
    isListening,
    transcript,
    error,
    hasPermissions,
    checkingPermissions,
    restartListening,
    stopListening,
  };
}
