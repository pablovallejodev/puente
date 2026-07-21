import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ClassicLanguage } from "@/constants/classic-languages";
import type { SttDownloadState } from "@/hooks/use-offline-stt-download";

type LanguageDownloadRowProps = {
  language: ClassicLanguage;
  downloadState: SttDownloadState;
  selected?: boolean;
  showDownload?: boolean;
  onSelect: () => void;
  onDownload: () => void;
};

function statusLabel(state: SttDownloadState): string | null {
  switch (state.status) {
    case "installed":
      return "✓";
    case "checking":
      return "…";
    case "scheduled":
      return "Programado";
    case "error":
      return state.error ?? "Error";
    default:
      return null;
  }
}

export function LanguageDownloadRow({
  language,
  downloadState,
  selected = false,
  showDownload = false,
  onSelect,
  onDownload,
}: LanguageDownloadRowProps) {
  const isBusy =
    downloadState.status === "downloading" ||
    downloadState.status === "scheduled" ||
    downloadState.status === "checking";
  const isInstalled = downloadState.status === "installed";
  const label = statusLabel(downloadState);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
      onPress={onSelect}
    >
      <Text style={styles.flag}>{language.flagEmoji}</Text>
      <View style={styles.labelColumn}>
        <Text style={styles.label}>{language.label}</Text>
        <Text style={styles.locale}>{language.speechLocale}</Text>
        {downloadState.status === "error" && downloadState.error ? (
          <Text style={styles.error}>{downloadState.error}</Text>
        ) : null}
      </View>

      <View style={styles.actionColumn}>
        {showDownload && !isInstalled ? (
          <Pressable
            style={({ pressed }) => [
              styles.downloadButton,
              pressed && styles.downloadButtonPressed,
              isBusy && styles.downloadButtonDisabled,
            ]}
            onPress={() => {
              if (!isBusy) onDownload();
            }}
            disabled={isBusy}
            hitSlop={8}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.downloadIcon}>↓</Text>
            )}
          </Pressable>
        ) : isInstalled ? (
          <Text style={styles.installedMark}>✓</Text>
        ) : null}
        {label && !showDownload ? (
          <Text style={styles.status}>{label}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5E5",
    backgroundColor: "#FFFFFF",
  },
  rowSelected: {
    backgroundColor: "#F5F5F5",
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
  label: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 16,
    color: "#000000",
  },
  locale: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    marginTop: 2,
  },
  error: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#CC0000",
    marginTop: 4,
  },
  actionColumn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 40,
    justifyContent: "flex-end",
  },
  downloadButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadButtonPressed: {
    backgroundColor: "#F5F5F5",
  },
  downloadButtonDisabled: {
    opacity: 0.6,
  },
  downloadIcon: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 16,
    color: "#000000",
  },
  installedMark: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 14,
    color: "#000000",
  },
  status: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
  },
});
