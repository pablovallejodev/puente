import { useEffect, useMemo } from "react";
import { Platform, SectionList, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { StandardHeadComponent } from "@/components/basics/headers";
import { LanguageDownloadRow } from "@/components/shared/language-download-row";
import {
  TRADUCTOR_LANGUAGES,
  useTraductorSession,
} from "@/contexts/traductor-session-context";
import type { TraductorLanguage } from "@/constants/traductor-languages";
import { isLocaleInstalledState } from "@/lib/traductor-input-mode";
import { StatusBarHiddenComponent } from "@/utils/statusbar";

type SlotParam = "input" | "output";

type LanguageSection = {
  title: string;
  data: TraductorLanguage[];
  showDownload: boolean;
};

function androidSupportsDownloadUi(): boolean {
  return Platform.OS === "android" && Platform.Version >= 33;
}

export default function LanguagesComponent() {
  const router = useRouter();
  const { slot: rawSlot } = useLocalSearchParams<{ slot?: string }>();
  const slot: SlotParam = rawSlot === "output" ? "output" : "input";

  const {
    inputLanguages,
    outputLanguage,
    selectInputLanguage,
    setOutputLanguage,
    getDownloadState,
    downloadSttModel,
    refreshInstalledLocales,
  } = useTraductorSession();

  const sections = useMemo((): LanguageSection[] => {
    if (slot === "output") {
      return [{ title: "Idiomas", data: TRADUCTOR_LANGUAGES, showDownload: false }];
    }

    const downloaded: TraductorLanguage[] = [];
    const internet: TraductorLanguage[] = [];

    for (const lang of TRADUCTOR_LANGUAGES) {
      if (isLocaleInstalledState(getDownloadState(lang.speechLocale))) {
        downloaded.push(lang);
      } else {
        internet.push(lang);
      }
    }

    const result: LanguageSection[] = [];
    if (downloaded.length > 0) {
      result.push({ title: "Descargados", data: downloaded, showDownload: false });
    }
    if (internet.length > 0) {
      result.push({ title: "Internet", data: internet, showDownload: true });
    }
    return result;
  }, [slot, getDownloadState]);

  useEffect(() => {
    void refreshInstalledLocales();
  }, [refreshInstalledLocales]);

  const handleSelect = (language: TraductorLanguage) => {
    if (slot === "output") {
      setOutputLanguage(language);
    } else {
      selectInputLanguage(language);
    }
    router.back();
  };

  const titleText = slot === "output" ? "Idioma base" : "Idiomas input";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <StandardHeadComponent
        onBack={() => router.back()}
        titleText={titleText}
        loading={false}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item, section }) => {
          const downloadState = getDownloadState(item.speechLocale);
          const showDownload =
            slot === "input" &&
            section.showDownload &&
            androidSupportsDownloadUi() &&
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
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  sectionTitle: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 12,
    color: "#666666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
