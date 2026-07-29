import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { TraductorLanguage } from "@/constants/traductor-languages";
import type { SttDownloadState } from "@/hooks/use-offline-stt-download";
import { LanguageFlag } from "@/components/shared/language-flag";
import { theme } from "@/constants/theme";

type LanguageDownloadRowProps = {
  language: TraductorLanguage;
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
      accessibilityRole={showDownload ? "button" : "radio"}
      accessibilityState={showDownload ? undefined : { selected }}
    >
      <View style={styles.flagWrap}>
        <LanguageFlag language={language} size={24} />
      </View>
      <View style={styles.labelColumn}>
        <Text style={styles.label}>{language.label}</Text>
        {showDownload ? (
          <Text style={styles.locale}>{language.speechLocale}</Text>
        ) : null}
        {downloadState.status === "error" && downloadState.error ? (
          <>
            <Text style={styles.error}>{downloadState.error}</Text>
            {downloadState.code ? (
              <Text style={styles.errorCode}>{downloadState.code}</Text>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={styles.actionColumn}>
        {selected ? (
          <View style={styles.selectedMark}>
            <Text style={styles.selectedMarkText}>✓</Text>
          </View>
        ) : showDownload && !isInstalled ? (
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
              <ActivityIndicator size="small" color={theme.colors.text} />
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
    minHeight: 72,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.ml,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  rowSelected: {
    borderColor: theme.colors.action,
    borderWidth: 2,
  },
  rowPressed: {
    backgroundColor: theme.colors.pressed,
    transform: [{ scale: 0.99 }],
  },
  flagWrap: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  labelColumn: {
    flex: 1,
    marginLeft: theme.spacing.ml,
  },
  label: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  locale: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.text,
    marginTop: 2,
  },
  error: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.colors.error,
    marginTop: 4,
  },
  errorCode: {
    fontFamily: theme.font.body,
    fontSize: 10,
    color: theme.colors.text,
    marginTop: 2,
  },
  actionColumn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 40,
    justifyContent: "flex-end",
  },
  selectedMark: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.action,
  },
  selectedMarkText: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.caption,
    color: theme.colors.onAction,
  },
  downloadButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: theme.colors.action,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadButtonPressed: {
    backgroundColor: theme.colors.pressed,
  },
  downloadButtonDisabled: {
    opacity: 0.6,
  },
  downloadIcon: {
    fontFamily: theme.font.heading,
    fontSize: 16,
    color: theme.colors.text,
  },
  installedMark: {
    fontFamily: theme.font.heading,
    fontSize: 14,
    color: theme.colors.text,
  },
  status: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.colors.text,
  },
});
