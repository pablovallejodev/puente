import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import type { TraductorLanguage } from "@/constants/traductor-languages";

type LanguageSlotButtonProps =
  | {
      slot: "input";
      kind: "universal" | "fixed";
      language?: TraductorLanguage;
    }
  | {
      slot: "output";
      language: TraductorLanguage;
    };

export function LanguageSlotButton(props: LanguageSlotButtonProps) {
  const router = useRouter();

  const goToLanguages = () => {
    router.push({
      pathname: "/languages",
      params: { slot: props.slot },
    });
  };

  const isUniversal = props.slot === "input" && props.kind === "universal";
  const language =
    props.slot === "output"
      ? props.language
      : props.kind === "fixed"
        ? props.language
        : undefined;

  const flag = isUniversal ? "🌐" : (language?.flagEmoji ?? "🌐");
  const label = isUniversal ? "Universal" : (language?.label ?? "—");
  const slotLabel = props.slot === "input" ? "Idioma input" : "Idioma base";

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={goToLanguages}
    >
      <Text style={styles.flag}>{flag}</Text>
      <View style={styles.labelColumn}>
        <Text style={styles.slotLabel}>{slotLabel}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.chevron}>▼</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  rowPressed: {
    opacity: 0.85,
  },
  flag: {
    fontSize: 22,
    width: 32,
    textAlign: "center",
  },
  labelColumn: {
    flex: 1,
    marginLeft: 8,
  },
  slotLabel: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  label: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 16,
    color: "#000000",
    marginTop: 2,
  },
  chevron: {
    fontFamily: "Mulish_500Medium",
    fontSize: 10,
    color: "#666666",
    marginLeft: 8,
  },
});
