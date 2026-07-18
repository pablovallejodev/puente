import { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useKeepAwake } from "expo-keep-awake";
import { ChatHeadComponent } from "../basics/headers";
import { StatusBarHiddenComponent } from "@/utils/statusbar";
import { useSpeechTranscriptor } from "@/hooks/use-speech-transcriptor";
import { useTranslator } from "@/hooks/use-translator";

export default function ChatComponent() {
  const [inputLanguage] = useState<string>("en-US");
  const [outputLanguage] = useState<string>("es-ES");

  useKeepAwake();
  const { transcript } = useSpeechTranscriptor(inputLanguage);

  const {
    translated,
    status,
    isTranslating,
    error,
    diagnostics,
    ready,
    retry,
    canRetryLoad,
  } = useTranslator(transcript, inputLanguage, outputLanguage);

  let backPressEvent = false;

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (backPressEvent) BackHandler.exitApp();

      backPressEvent = true;
      setTimeout(() => {
        backPressEvent = false;
      }, 800);

      return true;
    });

    return () => backHandler.remove();
  }, []);

  const statusLabel =
    status === "loading"
      ? "Cargando modelo…"
      : isTranslating
        ? "Traduciendo…"
        : ready
          ? "Listo"
          : "Error";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <ChatHeadComponent titleText="Real time chat translation" />
      <Text style={styles.statusText}>{statusLabel}</Text>
      <Text style={styles.languageText}>{inputLanguage}</Text>
      <Text style={styles.transcriptedText}>{transcript || "—"}</Text>
      <Text style={styles.languageText}>{outputLanguage}</Text>
      <Text style={styles.transcriptedText}>{translated || "—"}</Text>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {diagnostics ? (
            <Text style={styles.errorMeta}>
              {diagnostics.code} · {diagnostics.stage}
              {diagnostics.elapsedMs !== undefined
                ? ` · ${diagnostics.elapsedMs}ms`
                : ""}
            </Text>
          ) : null}
          {(canRetryLoad || ready) && (
            <Pressable style={styles.retryButton} onPress={retry}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  statusText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666",
    alignSelf: "center",
    marginBottom: 8,
  },
  languageText: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 12,
    color: "black",
    alignSelf: "center",
    textAlign: "center",
  },
  transcriptedText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 16,
    color: "black",
    alignSelf: "center",
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
  errorText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 13,
    color: "#991B1B",
  },
  errorMeta: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#B91C1C",
    marginTop: 4,
  },
  retryButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#991B1B",
    borderRadius: 6,
  },
  retryText: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 12,
    color: "white",
  },
});
