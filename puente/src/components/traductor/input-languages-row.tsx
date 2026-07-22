import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import {
  MAX_INPUT_LANGUAGES,
  type TraductorLanguage,
} from "@/constants/traductor-languages";

type InputLanguagesRowProps = {
  languages: TraductorLanguage[];
  onRemove: (id: string) => void;
};

function InputLanguageChip({
  language,
  canRemove,
  onRemove,
}: {
  language: TraductorLanguage;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <View style={styles.chipWrap}>
      <View style={styles.chip}>
        <Text style={styles.chipFlag}>{language.flagEmoji}</Text>
        <Text style={styles.chipLabel} numberOfLines={1}>
          {language.label}
        </Text>
      </View>
      {canRemove ? (
        <Pressable
          style={({ pressed }) => [
            styles.removeBadge,
            pressed && styles.removeBadgePressed,
          ]}
          onPress={onRemove}
          hitSlop={8}
          accessibilityLabel={`${language.label}, eliminar`}
        >
          <Text style={styles.removeIcon}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function InputLanguagesRow({
  languages,
  onRemove,
}: InputLanguagesRowProps) {
  const router = useRouter();
  const canAdd = languages.length < MAX_INPUT_LANGUAGES;
  const canRemove = languages.length > 1;

  const goToAddLanguage = () => {
    router.push({
      pathname: "/languages",
      params: { slot: "input", mode: "add" },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Idiomas input</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {languages.map((language) => (
          <InputLanguageChip
            key={language.id}
            language={language}
            canRemove={canRemove}
            onRemove={() => onRemove(language.id)}
          />
        ))}
        {canAdd ? (
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
            ]}
            onPress={goToAddLanguage}
            accessibilityLabel="Añadir idioma de entrada"
          >
            <Text style={styles.addIcon}>+</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
  },
  chipWrap: {
    position: "relative",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    minWidth: 100,
    maxWidth: 140,
  },
  chipFlag: {
    fontSize: 20,
    marginRight: 6,
  },
  chipLabel: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 14,
    color: "#000000",
    flexShrink: 1,
  },
  removeBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#CC0000",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBadgePressed: {
    opacity: 0.85,
  },
  removeIcon: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 16,
    fontFamily: "Mulish_800ExtraBold",
    marginTop: -1,
  },
  addButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  addButtonPressed: {
    opacity: 0.85,
  },
  addIcon: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 22,
    color: "#000000",
    lineHeight: 24,
  },
});
