import {
  ActivityIndicator,
  Platform,
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
  onSelect: () => void;
  onDownload: () => void;
  compact?: boolean;
};

function downloadLabel(state: SttDownloadState): string {
  switch (state.status) {
    case "installed":
      return "✓";
    case "downloading":
    case "scheduled":
      return `${state.progress}%`;
    case "checking":
      return "…";
    case "error":
      return "!";
    default:
      return "";
  }
}

export function LanguageDownloadRow({
  language,
  downloadState,
  selected = false,
  onSelect,
  onDownload,
  compact = false,
}: LanguageDownloadRowProps) {
  const isDownloading =
    downloadState.status === "downloading" ||
    downloadState.status === "scheduled" ||
    downloadState.status === "checking";
  const isInstalled = downloadState.status === "installed";
  const showDownloadButton = Platform.OS === "android" && !isInstalled;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        compact && styles.rowCompact,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
      onPress={onSelect}
    >
      <Text style={styles.flag}>{language.flagEmoji}</Text>
      <View style={styles.labelColumn}>
        <Text style={styles.label}>{language.label}</Text>
        {!compact && (
          <Text style={styles.locale}>{language.speechLocale}</Text>
        )}
      </View>

      <View style={styles.downloadColumn}>
        <Text style={styles.size}>{language.sttModelSizeLabel}</Text>
        {showDownloadButton ? (
          <Pressable
            style={({ pressed }) => [
              styles.downloadButton,
              pressed && styles.downloadButtonPressed,
              isDownloading && styles.downloadButtonDisabled,
            ]}
            onPress={() => {
              if (!isDownloading) onDownload();
            }}
            disabled={isDownloading}
            hitSlop={8}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.downloadIcon}>↓</Text>
            )}
          </Pressable>
        ) : isInstalled ? (
          <Text style={styles.installedMark}>✓</Text>
        ) : null}
        {isDownloading || isInstalled ? (
          <Text style={styles.progress}>{downloadLabel(downloadState)}</Text>
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
  rowCompact: {
    paddingVertical: 10,
    borderBottomWidth: 0,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    marginBottom: 8,
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
  downloadColumn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  size: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
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
  progress: {
    fontFamily: "Mulish_500Medium",
    fontSize: 11,
    color: "#666666",
    minWidth: 28,
    textAlign: "right",
  },
  installedMark: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 14,
    color: "#000000",
  },
});
