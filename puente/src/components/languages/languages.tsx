import { useMemo } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";
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

type LanguageSection = {
  title: string;
  data: TraductorLanguage[];
};

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
  } = useTraductorSession();

  const sections = useMemo((): LanguageSection[] => {
    const title =
      slot === "output" ? "Idiomas" : "Whisper on-device (multilingüe)";
    return [{ title, data: TRADUCTOR_LANGUAGES }];
  }, [slot]);

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
        renderItem={({ item }) => {
          const downloadState = getDownloadState(item.speechLocale);
          const selected =
            slot === "output"
              ? outputLanguage.id === item.id
              : inputLanguages.some((lang) => lang.id === item.id);

          return (
            <LanguageDownloadRow
              language={item}
              downloadState={downloadState}
              selected={selected}
              showDownload={false}
              onSelect={() => handleSelect(item)}
              onDownload={() => {}}
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
