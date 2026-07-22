import { StyleSheet, Text, View } from "react-native";

import { findTraductorLanguageById } from "@/constants/traductor-languages";
import type { ChatMessage } from "@/hooks/use-chat-messages";

type ChatMessageItemProps = {
  message: ChatMessage;
};

export function ChatMessageItem({ message }: ChatMessageItemProps) {
  if (!message.original.trim() && !message.translated.trim()) {
    return null;
  }

  const sourceLang = findTraductorLanguageById(message.sourceLanguageId);

  return (
    <View style={styles.container}>
      <Text style={styles.original}>
        {sourceLang ? `${sourceLang.flagEmoji} ` : ""}
        {message.original || "…"}
      </Text>
      <Text style={styles.translated}>
        {message.isTranslating && !message.translated
          ? "…"
          : message.translated || "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5E5",
  },
  original: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    marginBottom: 4,
  },
  translated: {
    fontFamily: "Mulish_500Medium",
    fontSize: 16,
    color: "#000000",
    lineHeight: 22,
  },
});
