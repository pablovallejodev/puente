import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback, useState } from "react";

import {
  defaultCompanionPeakBytes,
  ENGINE_LABEL,
  formatBytes,
  isBelowRecommendedRam,
  pairBudgetBytes,
  RAM_TIER_LABEL,
  type ModelSpec,
} from "@/constants/model-catalog";
import { useModelCatalog } from "@/contexts/model-catalog-context";
import { readModelPreferences } from "@/lib/model-preferences";
import { theme } from "@/constants/theme";

type ModelCardProps = {
  spec: ModelSpec;
  ramBytes: number | null;
  companionPeakBytes?: number;
  /** Called after a successful select (e.g. navigate back). */
  onSelected?: () => void;
};

export function ModelCard({
  spec,
  ramBytes,
  companionPeakBytes = defaultCompanionPeakBytes(spec),
  onSelected,
}: ModelCardProps) {
  const { getModelState, download, select } = useModelCatalog();
  const state = getModelState(spec.id);
  const [busy, setBusy] = useState(false);
  const lowRam = isBelowRecommendedRam(spec, ramBytes, companionPeakBytes);
  const selectable = spec.task !== "vad";

  const onDownload = useCallback(async () => {
    setBusy(true);
    try {
      await download(spec.id);
      // First download for a task auto-selects — leave the picker like select.
      if (spec.task !== "vad" && onSelected) {
        const prefs = await readModelPreferences();
        if (prefs[spec.task] === spec.id) onSelected();
      }
    } catch {
      /* lastError shown globally */
    } finally {
      setBusy(false);
    }
  }, [download, onSelected, spec.id, spec.task]);

  const onSelect = useCallback(async () => {
    setBusy(true);
    try {
      await select(spec.id);
      onSelected?.();
    } catch {
      /* lastError shown globally */
    } finally {
      setBusy(false);
    }
  }, [onSelected, select, spec.id]);

  const downloading = state.status === "downloading";
  const installed =
    state.status === "installed" || state.status === "selected";
  const selected = state.status === "selected";

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{spec.label}</Text>
      <Text style={styles.cardTag}>{spec.qualityTag}</Text>
      <View style={styles.badges}>
        <Text style={styles.badge}>{ENGINE_LABEL[spec.runtime.engine]}</Text>
        <Text style={styles.badge}>{spec.license.label}</Text>
        <Text style={styles.badge}>{RAM_TIER_LABEL[spec.ramTier]}</Text>
        <Text style={styles.badge}>{spec.languageIds.length} idiomas</Text>
      </View>
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>DESCARGA</Text>
          <Text style={styles.cardMeta}>~{formatBytes(spec.diskBytes)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>RAM</Text>
          <Text style={styles.cardMeta}>
            ~{formatBytes(spec.peakRamBytes)}
          </Text>
        </View>
      </View>
      {lowRam ? (
        <Text style={styles.warn}>
          Con el traductor o transcriptor en uso, este modelo pide más memoria
          de la que el teléfono puede reservar con holgura (~
          {formatBytes(pairBudgetBytes(ramBytes) ?? 0)} de presupuesto)
        </Text>
      ) : null}
      {spec.task === "asr" && spec.languageDetection === "none" ? (
        <Text style={styles.warn}>
          No identifica el idioma: úsalo con un idioma de entrada fijo, no en
          modo Universal
        </Text>
      ) : null}
      {spec.task === "asr" && spec.languageDetection === "fixed-single" ? (
        <Text style={styles.warn}>
          Solo {spec.languageIds.join(", ").toUpperCase()}: fíjalo como idioma
          de entrada
        </Text>
      ) : null}

      <Text style={styles.sourceNote}>{spec.sourceNote}</Text>

      <Pressable
        onPress={() => void Linking.openURL(spec.hfRepoUrl)}
        hitSlop={8}
        accessibilityRole="link"
      >
        <Text style={styles.link}>Ver modelo en Hugging Face ↗</Text>
      </Pressable>

      {downloading ? (
        <View style={styles.progressBlock}>
          <ActivityIndicator size="small" color={theme.colors.text} />
          <Text style={styles.progressText}>
            Descargando… {Math.round(state.progress * 100)}%
          </Text>
        </View>
      ) : null}

      {state.error ? (
        <Text style={styles.cardError}>{state.error.toDisplayString()}</Text>
      ) : null}

      <View style={styles.cardActions}>
        {!installed ? (
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onDownload}
            disabled={busy || downloading}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Descargar</Text>
          </Pressable>
        ) : selected || !selectable ? (
          <View style={[styles.button, styles.buttonSelected]}>
            <Text style={[styles.buttonText, styles.buttonTextSelected]}>
              ✓ En uso
            </Text>
          </View>
        ) : (
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onSelect}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Seleccionar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.ml,
    backgroundColor: theme.colors.surface,
  },
  cardTitle: {
    fontFamily: theme.font.heading,
    fontSize: 17,
    color: theme.colors.text,
  },
  cardTag: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  badge: {
    fontFamily: theme.font.heading,
    fontSize: 9,
    letterSpacing: 0.6,
    color: theme.colors.textMuted,
    paddingVertical: 3,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  sourceNote: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.ml,
    lineHeight: 16,
  },
  metrics: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  metric: {
    flex: 1,
    padding: theme.spacing.ml,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  metricLabel: {
    fontFamily: theme.font.heading,
    fontSize: 8,
    letterSpacing: 0.8,
    color: theme.colors.textMuted,
  },
  cardMeta: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.caption,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  warn: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.error,
    marginTop: theme.spacing.sm,
  },
  link: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    color: theme.colors.text,
    marginTop: theme.spacing.ml,
  },
  progressBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.ml,
  },
  progressText: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.text,
  },
  cardError: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.error,
    marginTop: theme.spacing.sm,
  },
  cardActions: {
    marginTop: theme.spacing.md,
  },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.action,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSelected: {
    backgroundColor: theme.colors.action,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.caption,
    color: theme.colors.text,
  },
  buttonTextSelected: {
    color: theme.colors.onAction,
  },
});
