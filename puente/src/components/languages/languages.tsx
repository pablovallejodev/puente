import { useMemo, useState } from "react";
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { StandardHeadComponent } from "@/components/basics/headers";
import { LanguageDownloadRow } from "@/components/shared/language-download-row";
import {
  TRADUCTOR_LANGUAGES,
  useTraductorSession,
} from "@/contexts/traductor-session-context";
import { getDeviceLocaleTag } from "@/constants/languages";
import {
  getRecommendedLanguages,
  type TraductorLanguage,
} from "@/constants/traductor-languages";
import {
  getTraductorLanguageDisplayName,
  resolveUiLocale,
  type UiLocale,
} from "@/lib/language-display-name";
import { StatusBarDarkComponent } from "@/utils/statusbar";
import { theme } from "@/constants/theme";

type SlotParam = "input" | "output";

type UniversalRow = { id: "universal"; label: string };

type LanguageSection = {
  title: string;
  data: (TraductorLanguage | UniversalRow)[];
};

function matchesQuery(
  language: TraductorLanguage,
  query: string,
  uiLocale: UiLocale,
): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    getTraductorLanguageDisplayName(language, uiLocale)
      .toLowerCase()
      .includes(q) ||
    language.label.toLowerCase().includes(q) ||
    language.id.toLowerCase().includes(q) ||
    language.speechLocale.toLowerCase().includes(q) ||
    language.floresCode.toLowerCase().includes(q)
  );
}

export default function LanguagesComponent() {
  const router = useRouter();
  const { slot: rawSlot } = useLocalSearchParams<{ slot?: string }>();
  const slot: SlotParam = rawSlot === "output" ? "output" : "input";
  const [query, setQuery] = useState("");
  const uiLocale = useMemo(
    () => resolveUiLocale(getDeviceLocaleTag()),
    [],
  );

  const {
    inputLanguage,
    outputLanguage,
    selectUniversalInput,
    selectFixedInputLanguage,
    setOutputLanguage,
    getDownloadState,
  } = useTraductorSession();

  const recommendedAll = useMemo(
    () => getRecommendedLanguages(getDeviceLocaleTag()),
    [],
  );
  const recommendedIds = useMemo(
    () => new Set(recommendedAll.map((lang) => lang.id)),
    [recommendedAll],
  );

  const visibleRecommended = useMemo(
    () =>
      recommendedAll.filter((lang) => matchesQuery(lang, query, uiLocale)),
    [recommendedAll, query, uiLocale],
  );

  const filteredLanguages = useMemo(
    () =>
      TRADUCTOR_LANGUAGES.filter(
        (lang) =>
          !recommendedIds.has(lang.id) && matchesQuery(lang, query, uiLocale),
      ),
    [query, recommendedIds, uiLocale],
  );

  const sections = useMemo((): LanguageSection[] => {
    if (slot === "output") {
      return [{ title: "", data: filteredLanguages }];
    }
    const showUniversal =
      !query.trim() || "universal".includes(query.trim().toLowerCase());
    const sectionsOut: LanguageSection[] = [];
    if (showUniversal) {
      sectionsOut.push({
        title: "Detección automática",
        data: [{ id: "universal", label: "Universal" }],
      });
    }
    sectionsOut.push({
      title: "",
      data: filteredLanguages,
    });
    return sectionsOut;
  }, [slot, filteredLanguages, query]);

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

  const isLanguageSelected = (language: TraductorLanguage) =>
    slot === "output"
      ? outputLanguage.id === language.id
      : inputLanguage.kind === "fixed" &&
        inputLanguage.language.id === language.id;

  const renderLanguageRow = (language: TraductorLanguage) => (
    <LanguageDownloadRow
      language={language}
      downloadState={getDownloadState(language.speechLocale)}
      selected={isLanguageSelected(language)}
      showDownload={false}
      uiLocale={uiLocale}
      onSelect={() => handleSelect(language)}
      onDownload={() => undefined}
    />
  );

  const titleText = slot === "output" ? "Traducir al" : "Idioma de origen";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarDarkComponent />
      <StandardHeadComponent
        onBack={() => router.back()}
        titleText={titleText}
        loading={false}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.intro}>
              <Text style={styles.introEyebrow}>
                {slot === "output" ? "IDIOMA DE DESTINO" : "IDIOMA DE ORIGEN"}
              </Text>
              <Text style={styles.introTitle}>
                {slot === "output"
                  ? "¿Cómo quieres recibir la traducción?"
                  : "¿Cómo quieres que te escuche Puente?"}
              </Text>
              <Text style={styles.introBody}>
                {slot === "output"
                  ? "Elige el idioma en el que aparecerá cada traducción."
                  : "Usa Universal para detectar automáticamente o fija un idioma para ganar precisión."}
              </Text>
            </View>
            {visibleRecommended.map((language) => (
              <View key={`reco-${language.id}`}>
                {renderLanguageRow(language)}
              </View>
            ))}
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar idioma…"
              placeholderTextColor={theme.colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              style={styles.search}
              accessibilityLabel="Buscar idioma"
            />
          </View>
        }
        ListEmptyComponent={
          visibleRecommended.length === 0 ? (
            <Text style={styles.empty}>No hay idiomas que coincidan.</Text>
          ) : null
        }
        renderSectionHeader={({ section }) =>
          !section.title || section.data.length === 0 ? null : (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )
        }
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
                accessibilityRole="radio"
                accessibilityState={{ selected }}
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

          return renderLanguageRow(item as TraductorLanguage);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  sectionHeader: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
  intro: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceStone,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  introEyebrow: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 1.2,
    color: theme.colors.text,
  },
  introTitle: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.font.heading,
    fontSize: theme.type.title,
    lineHeight: 25,
    color: theme.colors.text,
  },
  introBody: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    lineHeight: 18,
    color: theme.colors.text,
  },
  search: {
    marginHorizontal: theme.spacing.md,
    marginTop: 0,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.ml,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    fontFamily: theme.font.body,
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  empty: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  universalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  universalSelected: {
    borderColor: theme.colors.action,
    borderWidth: 2,
  },
  universalPressed: {
    backgroundColor: theme.colors.pressed,
    transform: [{ scale: 0.99 }],
  },
  universalFlag: {
    fontSize: 22,
    width: 32,
    textAlign: "center",
  },
  universalLabels: {
    flex: 1,
    marginLeft: theme.spacing.ml,
  },
  universalLabel: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  universalHint: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  check: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.text,
    marginLeft: 8,
  },
});
