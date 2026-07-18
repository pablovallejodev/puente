import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";

import { StandardHeadComponent } from "@/components/basics/headers";
import { ChatMessageItem } from "@/components/classic/chat-message-item";
import { LanguageSlotButton } from "@/components/classic/language-slot-button";
import { useClassicSession } from "@/contexts/classic-session-context";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { useSpeechTranscriptor } from "@/hooks/use-speech-transcriptor";
import { useTranslator } from "@/hooks/use-translator";
import { STANDARD_HORIZONTAL_PADDING } from "@/constants/ui";
import { StatusBarHiddenComponent } from "@/utils/statusbar";

export default function ClassicComponent() {
  useKeepAwake();

  const {
    inputLanguage,
    outputLanguage,
    getDownloadState,
    downloadSttModel,
    checkLocale,
  } = useClassicSession();

  const { messages, onTranscriptUpdate, onTranslationUpdate } =
    useChatMessages();

  const flatListRef = useRef<FlatList>(null);
  const [activeTranscript, setActiveTranscript] = useState("");

  const inputDownload = getDownloadState(inputLanguage.speechLocale);
  const outputDownload = getDownloadState(outputLanguage.speechLocale);
  const useOnDevice = inputDownload.status === "installed";

  const handleInterim = useCallback(
    (text: string, isFinal: boolean) => {
      onTranscriptUpdate(text, isFinal);
      if (text.trim()) {
        setActiveTranscript(text);
      }
    },
    [onTranscriptUpdate],
  );

  useSpeechTranscriptor(inputLanguage.speechLocale, {
    requiresOnDeviceRecognition: useOnDevice,
    onInterimTranscript: handleInterim,
    enabled: true,
  });

  const {
    translated,
    status,
    isTranslating,
    error,
    diagnostics,
    ready,
    retry,
    canRetryLoad,
  } = useTranslator(
    activeTranscript,
    inputLanguage.speechLocale,
    outputLanguage.speechLocale,
  );

  useEffect(() => {
    onTranslationUpdate(translated, isTranslating);
  }, [translated, isTranslating, onTranslationUpdate]);

  useEffect(() => {
    void checkLocale(inputLanguage.speechLocale);
    void checkLocale(outputLanguage.speechLocale);
  }, [
    inputLanguage.speechLocale,
    outputLanguage.speechLocale,
    checkLocale,
  ]);

  useEffect(() => {
    if (messages.length === 0) return;
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const statusLabel =
    status === "loading"
      ? "Cargando motor de traducción…"
      : isTranslating
        ? "Traduciendo…"
        : ready
          ? "Listo"
          : "Error";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <StandardHeadComponent
        urlTo="/menu"
        titleText="Puente Classic"
        loading={false}
      />

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

      <View style={styles.bottomPanel}>
        <LanguageSlotButton
          slot="input"
          language={inputLanguage}
          downloadState={inputDownload}
          onDownload={() => downloadSttModel(inputLanguage.speechLocale)}
        />
        <Text style={styles.arrowDown}>↓</Text>
        <LanguageSlotButton
          slot="output"
          language={outputLanguage}
          downloadState={outputDownload}
          onDownload={() => downloadSttModel(outputLanguage.speechLocale)}
        />
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
  arrowDown: {
    fontFamily: "Mulish_500Medium",
    fontSize: 16,
    color: "#666666",
    textAlign: "center",
    marginVertical: 2,
  },
});
