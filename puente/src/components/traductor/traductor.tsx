import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
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
import { useTranslator } from "@/hooks/use-translator";
import { STANDARD_HORIZONTAL_PADDING } from "@/constants/ui";
import { StatusBarDarkComponent } from "@/utils/statusbar";
import { theme } from "@/constants/theme";

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

  const { inputLanguage, outputLanguage, baseHydrated } = useTraductorSession();

  const {
    messages,
    beginPendingTranscript,
    completePendingTranscript,
    discardPendingTranscript,
    appendFinalTranscript,
    onTranslationUpdate,
  } = useChatMessages();

  const flatListRef = useRef<FlatList>(null);
  const pendingIdRef = useRef<string | null>(null);
  const latestMessageId = messages.at(-1)?.id ?? null;
  const prevLatestIdRef = useRef<string | null>(null);

  const speechInput: SpeechInputMode = useMemo(() => {
    if (inputLanguage.kind === "universal") return { mode: "auto" };
    return { mode: "fixed", locale: inputLanguage.language.speechLocale };
  }, [inputLanguage]);

  const speechEnabled = isFocused && baseHydrated;

  const handleTranslation = useCallback(
    (
      messageId: string,
      translated: string,
      status: "queued" | "translating" | "done" | "error",
    ) => {
      onTranslationUpdate(messageId, translated, status);
    },
    [onTranslationUpdate],
  );

  const {
    status,
    error,
    diagnostics,
    ready,
    retry,
    canRetryLoad,
    isTranslating,
    pendingCount,
    enqueueTranslation,
  } = useTranslator(handleTranslation);

  const handleTranscriptionStart = useCallback(() => {
    if (pendingIdRef.current) return;
    const sourceLanguageId =
      inputLanguage.kind === "fixed" ? inputLanguage.language.id : "und";
    pendingIdRef.current = beginPendingTranscript(sourceLanguageId);
  }, [beginPendingTranscript, inputLanguage]);

  const handleTranscriptionCancel = useCallback(() => {
    const id = pendingIdRef.current;
    pendingIdRef.current = null;
    if (id) discardPendingTranscript(id);
  }, [discardPendingTranscript]);

  const handleFinalTranscript = useCallback(
    (text: string, _isFinal: boolean, detectedLocale?: string) => {
      const locale =
        detectedLocale ??
        (inputLanguage.kind === "fixed"
          ? inputLanguage.language.speechLocale
          : "");
      const trimmed = text.trim();
      if (!locale || !trimmed) {
        handleTranscriptionCancel();
        return;
      }

      const sourceLanguageId = sourceIdFromLocale(locale);
      const pendingId = pendingIdRef.current;
      pendingIdRef.current = null;

      const messageId = pendingId
        ? completePendingTranscript(pendingId, trimmed, sourceLanguageId)
          ? pendingId
          : appendFinalTranscript(trimmed, sourceLanguageId)
        : appendFinalTranscript(trimmed, sourceLanguageId);
      if (!messageId) return;

      enqueueTranslation({
        messageId,
        text: trimmed,
        inputLocale: locale,
        outputLanguage: outputLanguage.speechLocale,
      });
    },
    [
      appendFinalTranscript,
      completePendingTranscript,
      enqueueTranslation,
      handleTranscriptionCancel,
      inputLanguage,
      outputLanguage.speechLocale,
    ],
  );

  const {
    error: speechError,
    checkingPermissions,
    isListening,
    isTranscribing,
  } = useSpeechTranscriptor(speechInput, {
    requiresOnDeviceRecognition: true,
    onTranscriptionStart: handleTranscriptionStart,
    onTranscriptionCancel: handleTranscriptionCancel,
    onInterimTranscript: handleFinalTranscript,
    enabled: speechEnabled,
  });

  const { isReady: modelsReady, booting: modelsBooting } = useModelCatalog();

  useEffect(() => {
    if (modelsBooting) return;
    if (!modelsReady) {
      router.replace("/modelos" as Href);
    }
  }, [modelsBooting, modelsReady, router]);

  useEffect(() => {
    if (!latestMessageId) return;
    if (prevLatestIdRef.current === latestMessageId) return;
    prevLatestIdRef.current = latestMessageId;
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [latestMessageId]);

  const statusLabel = !baseHydrated
    ? "Preparando preferencias…"
    : status === "loading"
      ? "Cargando motor de traducción…"
      : checkingPermissions
        ? "Cargando reconocimiento (Whisper)…"
        : speechError
          ? "Error de reconocimiento"
          : status === "error"
            ? "Error"
            : isTranscribing
              ? "Entendiendo…"
              : isTranslating
                ? pendingCount > 0
                  ? `Traduciendo… (+${pendingCount} en cola)`
                  : "Traduciendo…"
                : isListening
                  ? "Escuchando"
                  : ready
                    ? "Listo en el dispositivo"
                    : "Error";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarDarkComponent />
      <ChatHeadComponent
        titleText="Traductor"
        onSettingsPress={() => router.push("/modelos" as Href)}
      />

      <View style={styles.statusRow}>
        <View
          style={styles.statusPill}
          accessibilityLiveRegion="polite"
        >
          <View
            style={[
              styles.statusDot,
              (isListening || isTranscribing || isTranslating) &&
                styles.statusDotActive,
              (speechError || status === "error") && styles.statusDotError,
            ]}
          />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatMessageItem
            message={item}
            isLatest={item.id === latestMessageId}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyMarkFrame}>
              <Image
                source={require("@/assets/icon.png")}
                style={styles.emptyMark}
                accessibilityIgnoresInvertColors
              />
            </View>
            <Text style={styles.emptyTitle}>Habla. Escucha. Entiende.</Text>
            <Text style={styles.emptyText}>
              Empieza a hablar y Puente traducirá la conversación aquí, sin
              sacar tu voz del teléfono.
            </Text>
            <Text style={styles.emptyPrivacy}>TU VOZ NO SALE DEL TELÉFONO</Text>
          </View>
        }
      />

      {error ? (
        <View style={styles.errorBox} accessibilityLiveRegion="assertive">
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
        <View style={styles.errorBox} accessibilityLiveRegion="assertive">
          <Text style={styles.errorText}>{speechError.message}</Text>
        </View>
      ) : null}

      <View style={styles.bottomPanel}>
        <View style={styles.panelHeading}>
          <Text style={styles.panelEyebrow}>CONVERSACIÓN</Text>
          <Text style={styles.panelHint}>Toca un idioma para cambiarlo</Text>
        </View>
        <View style={styles.languagePair}>
          {inputLanguage.kind === "universal" ? (
            <LanguageSlotButton slot="input" kind="universal" />
          ) : (
            <LanguageSlotButton
              slot="input"
              kind="fixed"
              language={inputLanguage.language}
            />
          )}
          <View style={styles.directionMark} accessibilityElementsHidden>
            <Text style={styles.directionArrow}>→</Text>
          </View>
          <LanguageSlotButton slot="output" language={outputLanguage} />
        </View>
        <Text style={styles.helperText}>
          Si la detección automática falla, fija el idioma de entrada.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  statusRow: {
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
  },
  statusPill: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.ml,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  statusDot: {
    width: 6,
    height: 6,
    marginRight: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.textMuted,
  },
  statusDotActive: {
    backgroundColor: theme.colors.action,
  },
  statusDotError: {
    backgroundColor: theme.colors.error,
  },
  statusText: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 0.3,
    color: theme.colors.text,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.sm,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xl,
  },
  emptyMarkFrame: {
    width: 88,
    height: 88,
    padding: 5,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceStone,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  emptyMark: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
  },
  emptyTitle: {
    marginTop: theme.spacing.lg,
    fontFamily: theme.font.heading,
    fontSize: theme.type.title,
    color: theme.colors.text,
    textAlign: "center",
  },
  emptyText: {
    maxWidth: 300,
    marginTop: theme.spacing.sm,
    fontFamily: theme.font.body,
    fontSize: theme.type.body,
    lineHeight: 22,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  emptyPrivacy: {
    marginTop: theme.spacing.md,
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 1.1,
    color: theme.colors.text,
    textAlign: "center",
  },
  errorBox: {
    marginHorizontal: STANDARD_HORIZONTAL_PADDING,
    marginBottom: 8,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.surface,
  },
  errorText: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.colors.error,
  },
  errorMeta: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.colors.text,
    marginTop: 4,
  },
  retryButton: {
    minHeight: 44,
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.action,
    borderRadius: theme.radius.sm,
  },
  retryText: {
    fontFamily: theme.font.heading,
    fontSize: 12,
    color: theme.colors.text,
  },
  bottomPanel: {
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.ml,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.hairline,
  },
  panelHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.ml,
    paddingHorizontal: theme.spacing.xs,
  },
  panelEyebrow: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 1.2,
    color: theme.colors.text,
  },
  panelHint: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.text,
  },
  languagePair: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  directionMark: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.action,
  },
  directionArrow: {
    marginTop: -1,
    fontFamily: theme.font.heading,
    fontSize: 13,
    color: theme.colors.onAction,
  },
  helperText: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.text,
    lineHeight: 14,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    textAlign: "center",
  },
});
