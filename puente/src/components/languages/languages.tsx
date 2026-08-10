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
  blockedLanguageIdsForSlot,
  occupiedLanguageIds,
  type LanguagePickerSlot,
} from "@/lib/blocked-language-ids";
import {
  getTraductorLanguageDisplayName,
  resolveUiLocale,
  type UiLocale,
} from "@/lib/language-display-name";
import { StatusBarDarkComponent } from "@/utils/statusbar";
import { theme } from "@/constants/theme";

function parseSlot(raw: string | undefined): LanguagePickerSlot {
  if (raw === "output" || raw === "lang2") return raw;
  return "input";
}

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
  const slot = parseSlot(rawSlot);
  const [query, setQuery] = useState("");
  const uiLocale = useMemo(
    () => resolveUiLocale(getDeviceLocaleTag()),
    [],
  );

  const {
    mode,
    inputLanguage,
    outputLanguage,
    languageTwo,
    selectUniversalInput,
    selectFixedInputLanguage,
    setOutputLanguage,
    setLanguageTwo,
    getDownloadState,
  } = useTraductorSession();

  const blockedIds = useMemo(
    () =>
      blockedLanguageIdsForSlot(
        slot,
        occupiedLanguageIds({
          inputLanguage,
          languageOneId: outputLanguage.id,
          languageTwoId: languageTwo.id,
        }),
      ),
    [inputLanguage, languageTwo.id, outputLanguage.id, slot],
  );

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
      recommendedAll.filter(
        (lang) =>
          !blockedIds.has(lang.id) && matchesQuery(lang, query, uiLocale),
      ),
    [blockedIds, recommendedAll, query, uiLocale],
  );

  const filteredLanguages = useMemo(
    () =>
      TRADUCTOR_LANGUAGES.filter(
        (lang) =>
          !recommendedIds.has(lang.id) &&
          !blockedIds.has(lang.id) &&
          matchesQuery(lang, query, uiLocale),
      ),
    [blockedIds, query, recommendedIds, uiLocale],
  );

  const showUniversal =
    slot === "input" &&
    mode === "one_way" &&
    (!query.trim() || "universal".includes(query.trim().toLowerCase()));

  const sections = useMemo(
    () => [{ title: "", data: filteredLanguages }],
    [filteredLanguages],
  );

  const handleSelectUniversal = () => {
    selectUniversalInput();
    router.back();
  };

  const handleSelect = (language: TraductorLanguage) => {
    if (slot === "output") {
      setOutputLanguage(language);
    } else if (slot === "lang2") {
      setLanguageTwo(language);
    } else {
      selectFixedInputLanguage(language);
    }
    router.back();
  };

  const isLanguageSelected = (language: TraductorLanguage) => {
    if (slot === "output") return outputLanguage.id === language.id;
    if (slot === "lang2") return languageTwo.id === language.id;
    return (
      inputLanguage.kind === "fixed" &&
      inputLanguage.language.id === language.id
    );
  };

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

  const renderUniversalRow = () => {
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
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarDarkComponent />
      <StandardHeadComponent
        onBack={() => router.back()}
        titleText="Escoge un idioma"
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
            {showUniversal ? (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Detección automática</Text>
                </View>
                {renderUniversalRow()}
              </View>
            ) : null}
            <View style={styles.allLanguagesBlock}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Todos los idiomas</Text>
              </View>
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
          </View>
        }
        ListEmptyComponent={
          visibleRecommended.length === 0 && !showUniversal ? (
            <Text style={styles.empty}>No hay idiomas que coincidan.</Text>
          ) : null
        }
        renderItem={({ item }) => renderLanguageRow(item)}
      />
    </SafeAreaView>
  );
}

/*
TODO: mejorar el alcance segun región y idioma de telefono
&& arreglar que en el modo infinito a 1 el segundo idioma (normalmente catalán) se muestra como bloqueado (porque está seleccionado como segundo idioma)

{visibleRecommended.length > 0 ? (
  <View>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>Recomendados</Text>
    </View>
    {visibleRecommended.map((language) => (
      <View key={`reco-${language.id}`}>
        {renderLanguageRow(language)}
      </View>
    ))}
  </View>
) : null}
*/

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
  allLanguagesBlock: {
    paddingTop: theme.spacing.md,
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
    backgroundColor: theme.colors.surfaceStone,
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
