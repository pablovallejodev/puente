import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ChatHeadComponent,
  StandardHeadComponent,
} from "@/components/basics/headers";
import {
  ENGINE_LABEL,
  formatBytes,
  SILERO_VAD_MODEL_ID,
  type ModelSpec,
} from "@/constants/model-catalog";
import { STANDARD_HORIZONTAL_PADDING } from "@/constants/ui";
import { useModelCatalog } from "@/contexts/model-catalog-context";
import { StatusBarDarkComponent } from "@/utils/statusbar";
import { theme } from "@/constants/theme";

function ModelCard({
  spec,
  ramBytes,
}: {
  spec: ModelSpec;
  ramBytes: number | null;
}) {
  const { getModelState, download, select, recommended } = useModelCatalog();
  const state = getModelState(spec.id);
  const [busy, setBusy] = useState(false);
  const lowRam =
    ramBytes != null && ramBytes < spec.minRecommendedRamBytes;
  const isRecommended =
    spec.id === recommended.asrId ||
    spec.id === recommended.mtId ||
    spec.id === recommended.vadId;
  // The VAD is used whenever it is installed, so it has no "select" step.
  const selectable = spec.task !== "vad";

  const onDownload = useCallback(async () => {
    setBusy(true);
    try {
      await download(spec.id);
    } catch {
      /* lastError shown globally */
    } finally {
      setBusy(false);
    }
  }, [download, spec.id]);

  const onSelect = useCallback(async () => {
    setBusy(true);
    try {
      await select(spec.id);
    } catch {
      /* lastError shown globally */
    } finally {
      setBusy(false);
    }
  }, [select, spec.id]);

  const downloading = state.status === "downloading";
  const installed =
    state.status === "installed" || state.status === "selected";
  const selected = state.status === "selected";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeading}>
        <Text style={styles.cardTitle}>{spec.label}</Text>
        {isRecommended ? (
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommended}>RECOMENDADO</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardTag}>{spec.qualityTag}</Text>
      <View style={styles.badges}>
        <Text style={styles.badge}>
          {ENGINE_LABEL[spec.runtime.engine]}
        </Text>
        <Text style={styles.badge}>{spec.license.label}</Text>
        <Text style={styles.badge}>{spec.languageIds.length} idiomas</Text>
      </View>
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>DESCARGA</Text>
          <Text style={styles.cardMeta}>~{formatBytes(spec.diskBytes)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>MEMORIA</Text>
          <Text style={styles.cardMeta}>~{formatBytes(spec.approxRamBytes)}</Text>
        </View>
      </View>
      {lowRam ? (
        <Text style={styles.warn}>
          Tu teléfono tiene menos RAM de la recomendada (
          {formatBytes(spec.minRecommendedRamBytes)})
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

export default function ModelosComponent() {
  const {
    isReady,
    booting,
    deviceModelName,
    totalMemoryBytes,
    lastError,
    clearError,
    download,
    downloadRecommended,
    getModelState,
    recommended,
    selected,
    asrModels,
    mtModels,
  } = useModelCatalog();

  // Freeze entry mode at mount: setup vs settings. isReady alone flips mid-setup.
  const [isSetupFlow] = useState(() => !isReady);
  const [recBusy, setRecBusy] = useState(false);
  const sileroKickoff = useRef(false);

  const ramGb =
    totalMemoryBytes != null
      ? (totalMemoryBytes / (1024 * 1024 * 1024)).toFixed(1)
      : null;

  const asrInstalled =
    getModelState(recommended.asrId).status === "installed" ||
    getModelState(recommended.asrId).status === "selected";
  const mtInstalled =
    getModelState(recommended.mtId).status === "installed" ||
    getModelState(recommended.mtId).status === "selected";
  const recommendedActive =
    selected.asr === recommended.asrId && selected.mt === recommended.mtId;
  const needDownload = !asrInstalled || !mtInstalled;

  // Silero (~2 MB): one attempt per visit; used whenever present, no select step.
  useEffect(() => {
    if (booting || sileroKickoff.current) return;
    const status = getModelState(SILERO_VAD_MODEL_ID).status;
    if (status !== "not_installed") return;
    sileroKickoff.current = true;
    void download(SILERO_VAD_MODEL_ID).catch(() => {
      // Optional install — don't sticky-banner a background failure.
      clearError();
    });
  }, [booting, download, getModelState, clearError]);

  const onRecommended = useCallback(async () => {
    if (recommendedActive) return;
    setRecBusy(true);
    clearError();
    try {
      await downloadRecommended();
    } catch {
      /* lastError */
    } finally {
      setRecBusy(false);
    }
  }, [recommendedActive, downloadRecommended, clearError]);

  const goTraductor = useCallback(() => {
    if (!isReady) return;
    router.replace("/traductor" as Href);
  }, [isReady]);

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBarDarkComponent />
        <View style={styles.boot}>
          <ActivityIndicator size="large" color={theme.colors.text} />
          <Text style={styles.bootText}>Comprobando modelos…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarDarkComponent />
      {isSetupFlow ? (
        <ChatHeadComponent titleText="Modelos" />
      ) : (
        <StandardHeadComponent
          titleText="Modelos"
          loading={false}
          onBack={() => router.back()}
        />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.setupHero}>
          <Text style={styles.heroEyebrow}>
            {isSetupFlow ? "CONFIGURACIÓN INICIAL" : "MODELOS LOCALES"}
          </Text>

          <View style={styles.deviceRow}>
            <View style={styles.devicePill}>
              <View style={styles.deviceDot} />
              <Text style={styles.deviceLine}>
                {deviceModelName ?? "Dispositivo"}
                {ramGb != null ? ` · ${ramGb} GB RAM` : ""}
              </Text>
            </View>

            {recommendedActive ? (
              <View
                style={styles.recommendButton}
                accessibilityRole="button"
                accessibilityState={{ disabled: true, selected: true }}
              >
                <Text style={styles.recommendButtonText}>✓ Recomendados</Text>
              </View>
            ) : (
              <Pressable
                style={[
                  styles.recommendButton,
                  recBusy && styles.buttonDisabled,
                ]}
                onPress={onRecommended}
                disabled={recBusy}
                accessibilityRole="button"
              >
                {recBusy ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.onAction}
                  />
                ) : (
                  <Text style={styles.recommendButtonText}>
                    {needDownload
                      ? "Descargar recomendados"
                      : "Seleccionar recomendados"}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {lastError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{lastError.toDisplayString()}</Text>
          </View>
        ) : null}

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.columnEyebrow}>01 · ESCUCHA</Text>
            <Text style={styles.columnTitle}>Transcripción</Text>
            <Text style={styles.columnHint}>
              Elige entre velocidad y precisión según la memoria disponible.
              Cada modelo dice qué motor lo ejecuta y cuántos idiomas cubre.
            </Text>
            {asrModels.map((spec) => (
              <ModelCard
                key={spec.id}
                spec={spec}
                ramBytes={totalMemoryBytes}
              />
            ))}
          </View>
          <View style={styles.column}>
            <Text style={styles.columnEyebrow}>02 · TRADUCCIÓN</Text>
            <Text style={styles.columnTitle}>Traducción</Text>
            <Text style={styles.columnHint}>
              NLLB cubre todos los idiomas de la app; los modelos GGUF traducen
              mejor en su ámbito, pero piden bastante más memoria.
            </Text>
            {mtModels.map((spec) => (
              <ModelCard
                key={spec.id}
                spec={spec}
                ramBytes={totalMemoryBytes}
              />
            ))}
          </View>
        </View>

        {isSetupFlow ? (
          !isReady ? (
            <Text style={styles.gateFooter}>
              Necesitas un modelo de transcripción y uno de traducción,
              descargados y seleccionados, para continuar.
            </Text>
          ) : (
            <Pressable style={styles.continueButton} onPress={goTraductor}>
              <Text style={styles.continueButtonText}>Ir al traductor</Text>
            </Pressable>
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  boot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  bootText: {
    fontFamily: theme.font.body,
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
    paddingBottom: theme.spacing.xl,
  },
  setupHero: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceStone,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  heroEyebrow: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 1.4,
    color: theme.colors.text,
  },
  deviceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  devicePill: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  deviceDot: {
    width: 8,
    height: 8,
    marginRight: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.action,
  },
  deviceLine: {
    fontFamily: theme.font.body,
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  recommendButton: {
    minHeight: 44,
    flexGrow: 1,
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: theme.colors.action,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignItems: "center",
  },
  recommendButtonText: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.caption,
    color: theme.colors.onAction,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  errorText: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.error,
  },
  columns: {
    gap: theme.spacing.xl,
    marginTop: theme.spacing.xl,
  },
  column: {
    width: "100%",
  },
  columnEyebrow: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 1.3,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
  },
  columnTitle: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.title,
    color: theme.colors.text,
  },
  columnHint: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.ml,
    lineHeight: 18,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.ml,
    backgroundColor: theme.colors.surface,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  cardTitle: {
    fontFamily: theme.font.heading,
    flex: 1,
    fontSize: 17,
    color: theme.colors.text,
  },
  recommendedBadge: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
  },
  recommended: {
    fontFamily: theme.font.heading,
    fontSize: 8,
    letterSpacing: 0.8,
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
  gateFooter: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    lineHeight: 18,
  },
  continueButton: {
    minHeight: 52,
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.ml,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.action,
  },
  continueButtonText: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.onAction,
  },
});
