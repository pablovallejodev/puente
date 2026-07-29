import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { VoiceLoader } from "@/components/traductor/voice-loader";
import { LanguageFlag } from "@/components/shared/language-flag";
import { findTraductorLanguageById } from "@/constants/traductor-languages";
import type { ChatMessage } from "@/hooks/use-chat-messages";
import { theme } from "@/constants/theme";

type ChatMessageItemProps = {
  message: ChatMessage;
  isLatest: boolean;
};

function ChatMessageItemComponent({
  message,
  isLatest,
}: ChatMessageItemProps) {
  const bodyOpacity = useRef(new Animated.Value(1)).current;
  const translationOpacity = useRef(
    new Animated.Value(message.translated ? 1 : 0),
  ).current;
  const wasPendingRef = useRef(message.transcriptionStatus === "pending");
  const hadTranslatedRef = useRef(Boolean(message.translated));

  useEffect(() => {
    if (
      wasPendingRef.current &&
      message.transcriptionStatus === "done" &&
      message.original
    ) {
      wasPendingRef.current = false;
      bodyOpacity.setValue(0);
      Animated.timing(bodyOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [bodyOpacity, message.original, message.transcriptionStatus]);

  useEffect(() => {
    if (message.translated && !hadTranslatedRef.current) {
      hadTranslatedRef.current = true;
      translationOpacity.setValue(0);
      Animated.timing(translationOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [message.translated, translationOpacity]);

  if (message.transcriptionStatus === "pending") {
    return (
      <View
        style={[styles.container, styles.latestContainer, styles.pendingBody]}
        accessibilityLiveRegion="polite"
      >
        <VoiceLoader accessibilityLabel="Transcribiendo" />
      </View>
    );
  }

  if (!message.original.trim() && !message.translated.trim()) {
    return null;
  }

  const sourceLang = findTraductorLanguageById(message.sourceLanguageId);
  const pending =
    message.translationStatus === "queued" ||
    message.translationStatus === "translating";

  return (
    <Animated.View
      style={[
        styles.container,
        isLatest && styles.latestContainer,
        { opacity: bodyOpacity },
      ]}
    >
      <View style={styles.originalRow}>
        {sourceLang ? (
          <LanguageFlag language={sourceLang} size={16} style={styles.flag} />
        ) : null}
        <Text style={[styles.original, isLatest && styles.latestOriginal]}>
          {message.original || "…"}
        </Text>
      </View>
      <Text style={styles.translationLabel}>TRADUCCIÓN</Text>
      {pending && !message.translated ? (
        <View style={styles.translationLoader}>
          <VoiceLoader accessibilityLabel="Traduciendo" />
        </View>
      ) : (
        <Animated.Text
          style={[
            styles.translated,
            isLatest && styles.latestTranslated,
            { opacity: message.translated ? translationOpacity : 1 },
          ]}
        >
          {message.translationStatus === "error" && !message.translated
            ? "No se pudo traducir"
            : message.translated || "—"}
        </Animated.Text>
      )}
    </Animated.View>
  );
}

export const ChatMessageItem = memo(ChatMessageItemComponent);

const styles = StyleSheet.create({
  container: {
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.ml,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.hairline,
  },
  latestContainer: {
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderLeftWidth: 5,
    borderLeftColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  pendingBody: {
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  originalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: theme.spacing.xs,
  },
  flag: {
    marginTop: 2,
  },
  original: {
    flex: 1,
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
  },
  latestOriginal: {
    fontSize: theme.type.caption,
    color: theme.colors.text,
  },
  translated: {
    fontFamily: theme.font.body,
    fontSize: theme.type.body,
    color: theme.colors.text,
    lineHeight: 21,
  },
  translationLabel: {
    marginBottom: theme.spacing.xs,
    fontFamily: theme.font.heading,
    fontSize: 8,
    letterSpacing: 1,
    color: theme.colors.text,
  },
  latestTranslated: {
    fontFamily: theme.font.heading,
    fontSize: 19,
    lineHeight: 27,
  },
  translationLoader: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
});
