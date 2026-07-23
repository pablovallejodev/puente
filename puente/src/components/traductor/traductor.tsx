import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from "expo-keep-awake";

import { ChatHeadComponent } from "@/components/basics/headers";
import { ChatMessageItem } from "@/components/traductor/chat-message-item";
import { InputLanguagesRow } from "@/components/traductor/input-languages-row";
import { LanguageSlotButton } from "@/components/traductor/language-slot-button";
import {
  inputSpeechLocalesKey,
  resolveInputLanguageFromDetection,
} from "@/constants/traductor-languages";
import { useTraductorSession } from "@/contexts/traductor-session-context";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { useNetworkConnected } from "@/hooks/use-network-connected";
import { useSpeechTranscriptor } from "@/hooks/use-speech-transcriptor";
import {
  useTranslator,
  type TranslationTarget,
} from "@/hooks/use-translator";
import { formatSttError, sttError } from "@/lib/stt-errors";
import { STANDARD_HORIZONTAL_PADDING } from "@/constants/ui";
import { StatusBarHiddenComponent } from "@/utils/statusbar";

const INTERNET_BANNER_TEXT =
  "Estás utilizando Internet. Si quieres utilizar más de un idioma, descárgalo.";

export default function TraductorComponent() {
  const [isFocused, setIsFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      void activateKeepAwakeAsync("traductor-session");
      return () => {
        setIsFocused(false);
        deactivateKeepAwake("traductor-session");
      };
    }, []),
  );

  const {
    inputLanguages,
    primaryInputLanguage,
    outputLanguage,
    inputSttMode,
    removeInputLanguage,
    getDownloadState,
    checkLocale,
  } = useTraductorSession();

  const { messages, onTranscriptUpdate, onTranslationUpdate } =
    useChatMessages();

  const flatListRef = useRef<FlatList>(null);
  const [translationTarget, setTranslationTarget] =
    useState<TranslationTarget | null>(null);

  const networkConnected = useNetworkConnected();
  const networkKnown = networkConnected !== null;
  const inputLocales = useMemo(
    () => inputLanguages.map((l) => l.speechLocale),
    [inputLanguages],
  );

  const isInternetMode = inputSttMode === "internet";
  const isDownloadedMode = inputSttMode === "downloaded";
  const multiInput = inputLanguages.length > 1;
  const canDetectMulti =
    multiInput &&
    Platform.OS === "android" &&
    Platform.Version >= 34 &&
    isDownloadedMode;

  const useOnDevice = isDownloadedMode;
  const offlineBlocked = networkConnected === false && isInternetMode;
  const showInternetBanner =
    isInternetMode && networkConnected === true && networkKnown;

  const offlineBlockError = offlineBlocked
    ? sttError(
        "STT_OFFLINE_MODELS_MISSING",
        "Sin conexión — descarga el idioma en Idiomas para usar offline",
      )
    : null;

  const speechEnabled = isFocused && networkKnown && !offlineBlocked;

  useEffect(() => {
    if (offlineBlockError) {
      console.warn("[traductor] STT_OFFLINE_MODELS_MISSING", {
        inputLocales,
        inputSttMode,
      });
    }
  }, [offlineBlockError, inputLocales, inputSttMode]);

  const handleInterim = useCallback(
    (text: string, isFinal: boolean, detectedLocale?: string) => {
      const resolved = resolveInputLanguageFromDetection(
        detectedLocale ?? primaryInputLanguage.speechLocale,
        inputLanguages,
      );

      if (
        __DEV__ &&
        detectedLocale &&
        resolved.id === primaryInputLanguage.id &&
        detectedLocale !== primaryInputLanguage.speechLocale
      ) {
        console.info("[stt] detection_unresolved", {
          detected: detectedLocale,
          allowed: inputLocales,
        });
      }

      const messageId = onTranscriptUpdate(text, isFinal, resolved.id);
      if (!messageId || !text.trim()) return;

      setTranslationTarget({
        messageId,
        text,
        isFinal,
        inputLocale: resolved.speechLocale,
      });
    },
    [
      onTranscriptUpdate,
      inputLanguages,
      primaryInputLanguage,
      inputLocales,
    ],
  );

  const handleTranslation = useCallback(
    (messageId: string, translated: string, isTranslating: boolean) => {
      onTranslationUpdate(messageId, translated, isTranslating);
    },
    [onTranslationUpdate],
  );

  const { status, error, diagnostics, ready, retry, canRetryLoad } =
    useTranslator(translationTarget, outputLanguage.speechLocale, handleTranslation);

  const { error: speechError, checkingPermissions } = useSpeechTranscriptor(
    inputLocales,
    {
      requiresOnDeviceRecognition: useOnDevice,
      onInterimTranscript: handleInterim,
      enabled: speechEnabled,
    },
  );

  useEffect(() => {
    for (const lang of inputLanguages) {
      void checkLocale(lang.speechLocale);
    }
  }, [inputSpeechLocalesKey(inputLanguages), checkLocale]);

  useEffect(() => {
    if (messages.length === 0) return;
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const statusLabel = offlineBlocked
    ? "Sin conexión — descarga el idioma en Idiomas para usar offline"
    : status === "loading"
      ? "Cargando motor de traducción…"
      : checkingPermissions
        ? "Comprobando micrófono…"
        : ready
          ? canDetectMulti
            ? "Listo · reconocimiento local · multilingüe"
            : isDownloadedMode && multiInput && Platform.OS !== "android"
              ? "Listo · reconocimiento local (solo primer idioma)"
              : isDownloadedMode
                ? "Listo · reconocimiento local"
                : "Listo · reconocimiento online"
          : "Error";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <ChatHeadComponent titleText="Traductor" />

      <Text style={styles.statusText}>{statusLabel}</Text>

      <FlatList
        ref={flatListRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatMessageItem message={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Habla para empezar a traducir…
            </Text>
          </View>
        }
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {diagnostics ? (
            <Text style={styles.errorMeta}>
              {diagnostics.code} · {diagnostics.stage}
            </Text>
          ) : null}
          {(canRetryLoad || ready) && (
            <Pressable style={styles.retryButton} onPress={retry}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {offlineBlockError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{offlineBlockError.message}</Text>
          <Text style={styles.errorMeta}>
            {formatSttError(offlineBlockError)}
          </Text>
        </View>
      ) : null}

      {speechError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{speechError.message}</Text>
          <Text style={styles.errorMeta}>{speechError.code}</Text>
        </View>
      ) : null}

      <View style={styles.bottomPanel}>
        {showInternetBanner ? (
          <Text style={styles.internetBanner}>{INTERNET_BANNER_TEXT}</Text>
        ) : null}
        <InputLanguagesRow
          languages={inputLanguages}
          inputSttMode={inputSttMode}
          onRemove={removeInputLanguage}
        />
        <Text style={styles.arrowDown}>↓</Text>
        <LanguageSlotButton slot="output" language={outputLanguage} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  statusText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    textAlign: "center",
    paddingVertical: 4,
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 14,
    color: "#666666",
  },
  errorBox: {
    marginHorizontal: STANDARD_HORIZONTAL_PADDING,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    backgroundColor: "#F5F5F5",
  },
  errorText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 13,
    color: "#000000",
  },
  errorMeta: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    marginTop: 4,
  },
  retryButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 6,
  },
  retryText: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 12,
    color: "#000000",
  },
  bottomPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5E5",
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  internetBanner: {
    fontFamily: "Mulish_500Medium",
    fontSize: 12,
    color: "#000000",
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 18,
  },
  arrowDown: {
    fontFamily: "Mulish_500Medium",
    fontSize: 16,
    color: "#666666",
    textAlign: "center",
    marginVertical: 2,
  },
});
