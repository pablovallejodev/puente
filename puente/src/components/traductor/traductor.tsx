import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from "expo-keep-awake";

import { ChatHeadComponent } from "@/components/basics/headers";
import { ChatMessageItem } from "@/components/traductor/chat-message-item";
import { LanguageSlotButton } from "@/components/traductor/language-slot-button";
import {
  findTraductorLanguageById,
  findTraductorLanguageByLocale,
} from "@/constants/traductor-languages";
import { useTraductorSession } from "@/contexts/traductor-session-context";
import { useModelCatalog } from "@/contexts/model-catalog-context";
import { useChatMessages } from "@/hooks/use-chat-messages";
import {
  useSpeechTranscriptor,
  type SpeechInputMode,
} from "@/hooks/use-speech-transcriptor";
import {
  useTranslator,
  type TranslationTarget,
} from "@/hooks/use-translator";
import { STANDARD_HORIZONTAL_PADDING } from "@/constants/ui";
import { StatusBarHiddenComponent } from "@/utils/statusbar";

function sourceIdFromLocale(locale: string): string {
  const byLocale = findTraductorLanguageByLocale(locale);
  if (byLocale) return byLocale.id;
  const prefix = locale.split("-")[0]?.toLowerCase();
  if (prefix) {
    const byId = findTraductorLanguageById(prefix);
    if (byId) return byId.id;
    return prefix;
  }
  return "und";
}

export default function TraductorComponent() {
  const router = useRouter();
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

  const { inputLanguage, outputLanguage } = useTraductorSession();

  const { messages, onTranscriptUpdate, onTranslationUpdate } =
    useChatMessages();

  const flatListRef = useRef<FlatList>(null);
  const [translationTarget, setTranslationTarget] =
    useState<TranslationTarget | null>(null);

  const speechInput: SpeechInputMode = useMemo(() => {
    if (inputLanguage.kind === "universal") return { mode: "auto" };
    return { mode: "fixed", locale: inputLanguage.language.speechLocale };
  }, [inputLanguage]);

  const speechEnabled = isFocused;

  const handleInterim = useCallback(
    (text: string, isFinal: boolean, detectedLocale?: string) => {
      const locale =
        detectedLocale ??
        (inputLanguage.kind === "fixed"
          ? inputLanguage.language.speechLocale
          : "");
      if (!locale) return;

      const sourceLanguageId = sourceIdFromLocale(locale);
      const messageId = onTranscriptUpdate(text, isFinal, sourceLanguageId);
      if (!messageId || !text.trim()) return;

      setTranslationTarget({
        messageId,
        text,
        isFinal,
        inputLocale: locale,
      });
    },
    [onTranscriptUpdate, inputLanguage],
  );

  const handleTranslation = useCallback(
    (messageId: string, translated: string, isTranslating: boolean) => {
      onTranslationUpdate(messageId, translated, isTranslating);
    },
    [onTranslationUpdate],
  );

  const { status, error, diagnostics, ready, retry, canRetryLoad } =
    useTranslator(
      translationTarget,
      outputLanguage.speechLocale,
      handleTranslation,
    );

  const { error: speechError, checkingPermissions } = useSpeechTranscriptor(
    speechInput,
    {
      requiresOnDeviceRecognition: true,
      onInterimTranscript: handleInterim,
      enabled: speechEnabled,
    },
  );

  const { isReady: modelsReady, booting: modelsBooting } = useModelCatalog();

  useEffect(() => {
    if (modelsBooting) return;
    if (!modelsReady) {
      router.replace("/modelos" as Href);
    }
  }, [modelsBooting, modelsReady, router]);

  useEffect(() => {
    if (messages.length === 0) return;
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const statusLabel =
    status === "loading"
      ? "Cargando motor de traducción…"
      : checkingPermissions
        ? "Cargando reconocimiento (Whisper)…"
        : ready
          ? inputLanguage.kind === "universal"
            ? "Listo · Whisper Universal"
            : `Listo · Whisper (${inputLanguage.language.id})`
          : "Error";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <ChatHeadComponent
        titleText="Traductor"
        onSettingsPress={() => router.push("/modelos" as Href)}
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
              [{diagnostics.code}@{diagnostics.stage}]
            </Text>
          ) : null}
          {(canRetryLoad || ready) && (
            <Pressable style={styles.retryButton} onPress={retry}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {speechError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{speechError.message}</Text>
        </View>
      ) : null}

      <View style={styles.bottomPanel}>
        {inputLanguage.kind === "universal" ? (
          <LanguageSlotButton slot="input" kind="universal" />
        ) : (
          <LanguageSlotButton
            slot="input"
            kind="fixed"
            language={inputLanguage.language}
          />
        )}
        <Text style={styles.helperText}>
          ¿Se está transcribiendo mal? Puedes seleccionar el idioma input para
          hacerlo mejor.
        </Text>
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
  helperText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    lineHeight: 15,
    marginTop: -4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  arrowDown: {
    fontFamily: "Mulish_500Medium",
    fontSize: 16,
    color: "#666666",
    textAlign: "center",
    marginVertical: 2,
  },
});
