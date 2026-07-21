import { useEffect } from "react";
import { FlatList, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { StandardHeadComponent } from "@/components/basics/headers";
import { LanguageDownloadRow } from "@/components/shared/language-download-row";
import {
  TRADUCTOR_LANGUAGES,
  useTraductorSession,
} from "@/contexts/traductor-session-context";
import type { TraductorLanguage } from "@/constants/traductor-languages";
import { StatusBarHiddenComponent } from "@/utils/statusbar";

type SlotParam = "input" | "output";

export default function LanguagesComponent() {
  const router = useRouter();
  const { slot: rawSlot } = useLocalSearchParams<{ slot?: string }>();
  const slot: SlotParam = rawSlot === "output" ? "output" : "input";

  const {
    inputLanguage,
    outputLanguage,
    setInputLanguage,
    setOutputLanguage,
    getDownloadState,
    downloadSttModel,
    refreshInstalledLocales,
    isLocaleDownloadable,
  } = useTraductorSession();

  const selectedLanguage =
    slot === "input" ? inputLanguage : outputLanguage;

  useEffect(() => {
    void refreshInstalledLocales();
  }, [refreshInstalledLocales]);

  const handleSelect = (language: TraductorLanguage) => {
    if (slot === "input") {
      setInputLanguage(language);
    } else {
      setOutputLanguage(language);
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <StandardHeadComponent
        onBack={() => router.back()}
        titleText="Idiomas"
        loading={false}
      />

      <FlatList
        data={TRADUCTOR_LANGUAGES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const downloadState = getDownloadState(item.speechLocale);
          const showDownload =
            slot === "input" &&
            isLocaleDownloadable(item.speechLocale) &&
            downloadState.status !== "installed";

          return (
            <LanguageDownloadRow
              language={item}
              downloadState={downloadState}
              selected={selectedLanguage.id === item.id}
              showDownload={showDownload}
              onSelect={() => handleSelect(item)}
              onDownload={() => downloadSttModel(item.speechLocale)}
            />
          );
        }}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  listContent: {
    paddingBottom: 24,
  },
});
