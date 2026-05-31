import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import {
  getDeviceLocaleTag,
  getLanguageLabel,
  mapSpeechLocaleToFlores,
} from "@/constants/languages";
import { useAppContext, type TranslationMessage } from "@/context/app-context";

const UNRECOVERABLE_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "language-not-supported",
  "audio-capture",
]);

type PendingUtterance = {
  id: string;
  text: string;
  locale: string | null;
};

export function useSpeechTranslator() {
  const { baseLanguage, addMessage, translator } = useAppContext();
  const [isListening, setIsListening] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isListeningRef = useRef(false);
  const detectedLocaleRef = useRef<string | null>(null);
  const processedUtterancesRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<PendingUtterance[]>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current || !translator) {
      return;
    }

    processingRef.current = true;
    setIsTranslating(true);

    try {
      while (queueRef.current.length > 0) {
        const utterance = queueRef.current.shift();
        if (!utterance) {
          continue;
        }

        const dedupeKey = `${utterance.text}:${utterance.locale ?? "unknown"}`;
        if (processedUtterancesRef.current.has(dedupeKey)) {
          continue;
        }
        processedUtterancesRef.current.add(dedupeKey);

        const mappedLocale = utterance.locale
          ? mapSpeechLocaleToFlores(utterance.locale)
          : null;
        const srcLang =
          mappedLocale ??
          mapSpeechLocaleToFlores(getDeviceLocaleTag()) ??
          "eng_Latn";

        // Skip when the detected source language matches the session base language.
        if (srcLang === baseLanguage) {
          continue;
        }

        const result = await translator(utterance.text, {
          src_lang: srcLang,
          tgt_lang: baseLanguage,
        });

        const translatedText = result[0]?.translation_text?.trim();
        if (!translatedText) {
          continue;
        }

        const message: TranslationMessage = {
          id: utterance.id,
          sourceLanguage: srcLang,
          sourceLabel: getLanguageLabel(srcLang),
          translatedText,
          timestamp: Date.now(),
        };

        addMessage(message);
      }
    } catch (error) {
      console.error("Translation failed:", error);
      setErrorMessage("Translation failed. Try speaking again.");
    } finally {
      processingRef.current = false;
      setIsTranslating(queueRef.current.length > 0);
      if (queueRef.current.length > 0) {
        void processQueue();
      }
    }
  }, [addMessage, baseLanguage, translator]);

  const enqueueUtterance = useCallback(
    (text: string, locale: string | null) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      queueRef.current.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        locale,
      });

      void processQueue();
    },
    [processQueue],
  );

  const startRecognition = useCallback(async () => {
    if (Platform.OS === "web") {
      setErrorMessage(
        "Speech recognition requires a development build on Android or iOS.",
      );
      return;
    }

    setErrorMessage(null);
    processedUtterancesRef.current.clear();

    const permissions =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permissions.granted) {
      setErrorMessage(
        "Microphone permission is required to listen for speech.",
      );
      return;
    }

    isListeningRef.current = true;
    setIsListening(true);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics are optional.
    }

    ExpoSpeechRecognitionModule.start({
      lang: "auto",
      interimResults: true,
      continuous: true,
      androidRecognitionServicePackage: "com.google.android.as",
      requiresOnDeviceRecognition: true,
      androidIntentOptions: {
        EXTRA_ENABLE_LANGUAGE_DETECTION: true,
      },
    });
  }, []);

  const stopRecognition = useCallback(async () => {
    isListeningRef.current = false;
    setIsListening(false);
    queueRef.current = [];
    detectedLocaleRef.current = null;

    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      ExpoSpeechRecognitionModule.abort();
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics are optional.
    }
  }, []);

  const toggleListening = useCallback(async () => {
    if (isListening) {
      await stopRecognition();
      return;
    }
    await startRecognition();
  }, [isListening, startRecognition, stopRecognition]);

  useSpeechRecognitionEvent("languagedetection", (event) => {
    detectedLocaleRef.current = event.detectedLanguage;
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!event.isFinal || event.results.length === 0) {
      return;
    }

    const transcript = event.results[0]?.transcript?.trim();
    if (!transcript) {
      return;
    }

    const locale = detectedLocaleRef.current ?? getDeviceLocaleTag();
    enqueueUtterance(transcript, locale);
    detectedLocaleRef.current = null;
  });

  useSpeechRecognitionEvent("error", (event) => {
    console.warn("Speech recognition error:", event.error, event.message);

    if (event.error === "aborted") {
      return;
    }

    const friendlyMessage =
      event.error === "not-allowed"
        ? "Microphone permission is required to listen for speech."
        : event.error === "no-speech"
          ? "No speech detected. Try speaking closer to the microphone."
          : "Speech recognition encountered an error.";

    setErrorMessage(friendlyMessage);

    if (UNRECOVERABLE_ERRORS.has(event.error)) {
      isListeningRef.current = false;
      setIsListening(false);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isListeningRef.current) {
      return;
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang: "auto",
        interimResults: true,
        continuous: true,
        androidRecognitionServicePackage: "com.google.android.as",
        requiresOnDeviceRecognition: true,
        androidIntentOptions: {
          EXTRA_ENABLE_LANGUAGE_DETECTION: true,
        },
      });
    } catch (error) {
      console.error("Failed to restart speech recognition:", error);
      isListeningRef.current = false;
      setIsListening(false);
      setErrorMessage("Speech recognition stopped unexpectedly.");
    }
  });

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Ignore cleanup errors.
      }
    };
  }, []);

  useEffect(() => {
    if (queueRef.current.length > 0) {
      void processQueue();
    }
  }, [processQueue, translator]);

  return {
    isListening,
    isTranslating,
    errorMessage,
    toggleListening,
    clearError: () => setErrorMessage(null),
  };
}
