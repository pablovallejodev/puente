import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { AudioModule, setAudioModeAsync } from "expo-audio";

export type SpeechTranscriptorOptions = {
  requiresOnDeviceRecognition?: boolean;
  onInterimTranscript?: (text: string, isFinal: boolean) => void;
  enabled?: boolean;
};

export function useSpeechTranscriptor(
  inputLanguage: string,
  options: SpeechTranscriptorOptions = {},
) {
  const {
    requiresOnDeviceRecognition = false,
    onInterimTranscript,
    enabled = true,
  } = options;

  const [hasPermissions, setHasPermissions] = useState<boolean>(false);
  const [checkingPermissions, setCheckingPermissions] = useState<boolean>(true);
  const [detectedLanguage, setDetectedLanguage] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [error, setError] = useState<number>(0);

  const isMountedRef = useRef<boolean>(true);
  const permissionsGrantedRef = useRef<boolean>(false);
  const inputLanguageRef = useRef(inputLanguage);
  const requiresOnDeviceRef = useRef(requiresOnDeviceRecognition);
  const onInterimRef = useRef(onInterimTranscript);
  const configInitializedRef = useRef(false);
  const prevLanguageRef = useRef(inputLanguage);
  const prevOnDeviceRef = useRef(requiresOnDeviceRecognition);

  inputLanguageRef.current = inputLanguage;
  requiresOnDeviceRef.current = requiresOnDeviceRecognition;
  onInterimRef.current = onInterimTranscript;

  useSpeechRecognitionEvent("start", async () => {
    if (!isMountedRef.current) return;
    setIsListening(true);
  });

  useSpeechRecognitionEvent("end", async () => {
    if (!isMountedRef.current) return;
    setIsListening(false);

    if (permissionsGrantedRef.current && enabled) {
      setTimeout(() => {
        if (isMountedRef.current) void startListeningInternal();
      }, 300);
    }
  });

  useSpeechRecognitionEvent("result", async (event) => {
    if (!isMountedRef.current) return;

    if (event.results && event.results.length > 0) {
      const transcriptText = event.results
        .map((_result) => _result.transcript)
        .join(" ");
      const trimmed = transcriptText.trim();
      if (!trimmed) return;

      const goodTranscript = `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`;
      setTranscript(goodTranscript);
      onInterimRef.current?.(goodTranscript, event.isFinal);

      if (event.isFinal) {
        setTranscript("");
      }
    }
  });

  useSpeechRecognitionEvent("error", async (event) => {
    if (!isMountedRef.current) return;
    setIsListening(false);

    if (event.error !== "aborted" && event.error !== "no-speech") {
      setError(2);
      setTimeout(() => {
        if (isMountedRef.current) setError(0);
      }, 4500);
    }
  });

  useSpeechRecognitionEvent("languagedetection", (event) => {
    setDetectedLanguage(event.detectedLanguage);
  });

  const startListeningInternal = useCallback(async () => {
    if (!enabled || !permissionsGrantedRef.current) return;

    try {
      setTranscript("");

      ExpoSpeechRecognitionModule.start({
        lang: inputLanguageRef.current,
        maxAlternatives: 1,
        addsPunctuation: true,
        continuous: true,
        interimResults: true,
        requiresOnDeviceRecognition: requiresOnDeviceRef.current,
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      setIsListening(false);
      setError(2);
      setTimeout(() => {
        if (isMountedRef.current) setError(0);
      }, 4500);
    }
  }, [enabled]);

  const stopListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    } catch {
      setIsListening(false);
    }
  }, []);

  const restartListening = useCallback(async () => {
    stopListening();
    await new Promise((r) => setTimeout(r, 200));
    await startListeningInternal();
  }, [startListeningInternal, stopListening]);

  const requestPermissions = useCallback(async () => {
    try {
      setCheckingPermissions(true);

      const audioStatus = await AudioModule.requestRecordingPermissionsAsync();
      if (!audioStatus.granted) {
        setHasPermissions(false);
        setCheckingPermissions(false);
        permissionsGrantedRef.current = false;
        return;
      }

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
    } catch {
      setHasPermissions(false);
      setCheckingPermissions(false);
      permissionsGrantedRef.current = false;
    }
  }, [enabled, startListeningInternal]);

  useEffect(() => {
    isMountedRef.current = true;
    if (enabled) void requestPermissions();

    return () => {
      isMountedRef.current = false;
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // ignore cleanup errors
      }
    };
  }, [enabled, requestPermissions]);

  useEffect(() => {
    if (!permissionsGrantedRef.current || !enabled) return;

    const languageChanged = prevLanguageRef.current !== inputLanguage;
    const onDeviceChanged =
      prevOnDeviceRef.current !== requiresOnDeviceRecognition;

    prevLanguageRef.current = inputLanguage;
    prevOnDeviceRef.current = requiresOnDeviceRecognition;

    if (!configInitializedRef.current) {
      configInitializedRef.current = true;
      return;
    }

    if (languageChanged || onDeviceChanged) {
      void restartListening();
    }
  }, [inputLanguage, requiresOnDeviceRecognition, enabled, restartListening]);

  return {
    isListening,
    transcript,
    detectedLanguage,
    error,
    hasPermissions,
    checkingPermissions,
    restartListening,
    stopListening,
  };
}
