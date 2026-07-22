import { useEffect, useMemo } from "react";
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
type ModeParam = "add" | "select";

export default function LanguagesComponent() {
  const router = useRouter();
  const { slot: rawSlot, mode: rawMode } = useLocalSearchParams<{
    slot?: string;
    mode?: string;
  }>();
  const slot: SlotParam = rawSlot === "output" ? "output" : "input";
  const mode: ModeParam = rawMode === "add" ? "add" : "select";

  const {
    inputLanguages,
    outputLanguage,
    addInputLanguage,
    setOutputLanguage,
    getDownloadState,
    downloadSttModel,
    refreshInstalledLocales,
    isLocaleDownloadable,
  } = useTraductorSession();

  const listData = useMemo(() => {
    if (slot === "input" && mode === "add") {
      return TRADUCTOR_LANGUAGES.filter(
        (lang) => !inputLanguages.some((sel) => sel.id === lang.id),
      );
    }
    return TRADUCTOR_LANGUAGES;
  }, [slot, mode, inputLanguages]);

  useEffect(() => {
    void refreshInstalledLocales();
  }, [refreshInstalledLocales]);

  const handleSelect = (language: TraductorLanguage) => {
    if (slot === "output") {
      setOutputLanguage(language);
    } else if (mode === "add") {
      addInputLanguage(language);
    }
    router.back();
  };

  const titleText = mode === "add" ? "Añadir idioma" : "Idiomas";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <StandardHeadComponent
        onBack={() => router.back()}
        titleText={titleText}
        loading={false}
      />

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const downloadState = getDownloadState(item.speechLocale);
          const showDownload =
            slot === "input" &&
            isLocaleDownloadable(item.speechLocale) &&
            downloadState.status !== "installed";
          const selected =
            slot === "output"
              ? outputLanguage.id === item.id
              : inputLanguages.some((lang) => lang.id === item.id);

          return (
            <LanguageDownloadRow
              language={item}
              downloadState={downloadState}
              selected={selected}
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
