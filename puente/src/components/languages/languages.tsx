import { useMemo } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
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
  data: Array<TraductorLanguage | { id: "universal"; label: string }>;
};

export default function LanguagesComponent() {
  const router = useRouter();
  const { slot: rawSlot } = useLocalSearchParams<{ slot?: string }>();
  const slot: SlotParam = rawSlot === "output" ? "output" : "input";

  const {
    inputLanguage,
    outputLanguage,
    selectUniversalInput,
    selectFixedInputLanguage,
    setOutputLanguage,
    getDownloadState,
  } = useTraductorSession();

  const sections = useMemo((): LanguageSection[] => {
    if (slot === "output") {
      return [{ title: "Idiomas", data: TRADUCTOR_LANGUAGES }];
    }
    return [
      {
        title: "Detección automática",
        data: [{ id: "universal", label: "Universal" }],
      },
      {
        title: "Idioma fijo",
        data: TRADUCTOR_LANGUAGES,
      },
    ];
  }, [slot]);

  const handleSelectUniversal = () => {
    selectUniversalInput();
    router.back();
  };

  const handleSelect = (language: TraductorLanguage) => {
    if (slot === "output") {
      setOutputLanguage(language);
    } else {
      selectFixedInputLanguage(language);
    }
    router.back();
  };

  const titleText = slot === "output" ? "Idioma base" : "Idioma input";

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
          if (item.id === "universal") {
            const selected = inputLanguage.kind === "universal";
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.universalRow,
                  selected && styles.universalSelected,
                  pressed && styles.universalPressed,
                ]}
                onPress={handleSelectUniversal}
              >
                <Text style={styles.universalFlag}>🌐</Text>
                <View style={styles.universalLabels}>
                  <Text style={styles.universalLabel}>Universal</Text>
                  <Text style={styles.universalHint}>
                    Whisper detecta el idioma automáticamente
                  </Text>
                </View>
                {selected ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          }

          const language = item as TraductorLanguage;
          const downloadState = getDownloadState(language.speechLocale);
          const selected =
            slot === "output"
              ? outputLanguage.id === language.id
              : inputLanguage.kind === "fixed" &&
                inputLanguage.language.id === language.id;

          return (
            <LanguageDownloadRow
              language={language}
              downloadState={downloadState}
              selected={selected}
              showDownload={false}
              onSelect={() => handleSelect(language)}
              onDownload={() => undefined}
            />
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 13,
    color: "#666666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  universalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  universalSelected: {
    borderColor: "#000000",
  },
  universalPressed: {
    opacity: 0.85,
  },
  universalFlag: {
    fontSize: 22,
    width: 32,
    textAlign: "center",
  },
  universalLabels: {
    flex: 1,
    marginLeft: 8,
  },
  universalLabel: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 16,
    color: "#000000",
  },
  universalHint: {
    fontFamily: "Mulish_500Medium",
    fontSize: 12,
    color: "#666666",
    marginTop: 2,
  },
  check: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 16,
    color: "#000000",
    marginLeft: 8,
  },
});
