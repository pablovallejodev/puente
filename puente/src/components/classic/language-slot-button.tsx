import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { LanguageDownloadRow } from "@/components/shared/language-download-row";
import type { ClassicLanguage } from "@/constants/classic-languages";
import type { SttDownloadState } from "@/hooks/use-offline-stt-download";

type LanguageSlotButtonProps = {
  slot: "input" | "output";
  language: ClassicLanguage;
  downloadState: SttDownloadState;
  onDownload: () => void;
};

export function LanguageSlotButton({
  slot,
  language,
  downloadState,
  onDownload,
}: LanguageSlotButtonProps) {
  const router = useRouter();

  const goToLanguages = () => {
    router.push({
      pathname: "/languages",
      params: { slot },
    });
  };

  return (
    <View style={styles.wrapper}>
      <Pressable onPress={goToLanguages}>
        <View style={styles.header}>
          <Text style={styles.slotLabel}>
            {slot === "input" ? "Idioma input" : "Idioma base"}
          </Text>
          <Text style={styles.chevron}>▼</Text>
        </View>
      </Pressable>
      <LanguageDownloadRow
        language={language}
        downloadState={downloadState}
        onSelect={goToLanguages}
        onDownload={onDownload}
        compact
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  slotLabel: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chevron: {
    fontFamily: "Mulish_500Medium",
    fontSize: 10,
    color: "#666666",
  },
});
