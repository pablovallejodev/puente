import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ChatHeadComponent,
  StandardHeadComponent,
} from "@/components/basics/headers";
import {
  exceedsPairBudget,
  formatBytes,
  getModelSpec,
  modePairPeakBytes,
  pairBudgetBytes,
  pairPeakRamBytes,
  PRESET_MODES,
  presetModePeakBytes,
  resolveActiveMode,
  SILERO_VAD_MODEL_ID,
  type PresetMode,
} from "@/constants/model-catalog";
import { STANDARD_HORIZONTAL_PADDING } from "@/constants/ui";
import {
  useModelCatalog,
  type ModelUiState,
} from "@/contexts/model-catalog-context";
import { StatusBarDarkComponent } from "@/utils/statusbar";
import { theme } from "@/constants/theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function installProgress(state: ModelUiState): number {
  if (state.status === "installed" || state.status === "selected") return 1;
  if (state.status === "downloading" || state.status === "paused") {
    return state.progress;
  }
  return 0;
}

function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

export default function ConfiguracionComponent() {
  const {
    isReady,
    booting,
    totalMemoryBytes,
    lastError,
    clearError,
    download,
    pauseDownload,
    applyModelPair,
    getModelState,
    selected,
  } = useModelCatalog();

  const [isSetupFlow] = useState(() => !isReady);
  const [busyModeId, setBusyModeId] = useState<string | null>(null);
  const [customExpanded, setCustomExpanded] = useState(false);
  const sileroKickoff = useRef(false);

  const selectedAsr = selected.asr ? getModelSpec(selected.asr) : undefined;
  const selectedMt = selected.mt ? getModelSpec(selected.mt) : undefined;
  const activeMode = resolveActiveMode(selected.asr, selected.mt);

  const pairPeak =
    selectedAsr && selectedMt
      ? pairPeakRamBytes(selectedAsr.peakRamBytes, selectedMt.peakRamBytes)
      : null;
  const pairBudget = pairBudgetBytes(totalMemoryBytes);
  const showRamPressure =
    selectedAsr != null &&
    selectedMt != null &&
    exceedsPairBudget(
      selectedAsr.peakRamBytes,
      selectedMt.peakRamBytes,
      totalMemoryBytes,
    );

  const ramPhoneLabel =
    totalMemoryBytes != null
      ? `${(totalMemoryBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
      : "—";
  const ramModeLabel = pairPeak != null ? `~${formatBytes(pairPeak)}` : "—";
  const budgetRatio =
    pairPeak != null && pairBudget != null && pairBudget > 0
      ? Math.min(pairPeak / pairBudget, 1)
      : 0;

  const customRamLabel = useMemo(() => {
    if (!selected.asr || !selected.mt) return null;
    return `~${formatBytes(modePairPeakBytes(selected.asr, selected.mt))} RAM`;
  }, [selected.asr, selected.mt]);

  useEffect(() => {
    if (booting || sileroKickoff.current) return;
    const status = getModelState(SILERO_VAD_MODEL_ID).status;
    if (status !== "not_installed") return;
    sileroKickoff.current = true;
    void download(SILERO_VAD_MODEL_ID).catch(() => {
      clearError();
    });
  }, [booting, download, getModelState, clearError]);

  const onPreset = useCallback(
    async (mode: PresetMode) => {
      const asrState = getModelState(mode.asrId);
      const mtState = getModelState(mode.mtId);
      const pairReady =
        (asrState.status === "installed" || asrState.status === "selected") &&
        (mtState.status === "installed" || mtState.status === "selected");
      if (activeMode === mode.id && pairReady) return;
      if (busyModeId === mode.id) return;
      animateLayout();
      setCustomExpanded(false);
      setBusyModeId(mode.id);
      clearError();
      try {
        await applyModelPair(mode.asrId, mode.mtId);
      } catch {
        /* paused or lastError — busy cleared in finally */
      } finally {
        setBusyModeId(null);
      }
    },
    [activeMode, applyModelPair, busyModeId, clearError, getModelState],
  );

  const onPauseMode = useCallback(
    async (mode: PresetMode) => {
      const asrState = getModelState(mode.asrId);
      const mtState = getModelState(mode.mtId);
      try {
        if (asrState.status === "downloading") {
          await pauseDownload(mode.asrId);
        }
        if (mtState.status === "downloading") {
          await pauseDownload(mode.mtId);
        }
      } catch {
        /* lastError */
      } finally {
        if (busyModeId === mode.id) setBusyModeId(null);
      }
    },
    [busyModeId, getModelState, pauseDownload],
  );

  const showCustomSlots = activeMode === "personalizado" || customExpanded;

  const onToggleCustom = useCallback(() => {
    // Active custom pair already shows the slots; tap is a no-op collapse/open
    // only when exploring before a non-preset pair is chosen.
    if (activeMode === "personalizado") return;
    animateLayout();
    setCustomExpanded((v) => !v);
  }, [activeMode]);

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
        <ChatHeadComponent titleText="Configuración inicial" />
      ) : (
        <StandardHeadComponent
          titleText="Configuración"
          loading={false}
          onBack={() => router.back()}
        />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.ramHero}>
          <Text style={styles.heroEyebrow}>TU DISPOSITIVO</Text>
          <View style={styles.ramRow}>
            <View style={styles.ramMetric}>
              <Text style={styles.ramLabel}>RAM del teléfono</Text>
              <Text style={styles.ramValue}>{ramPhoneLabel}</Text>
            </View>
            <View style={styles.ramMetric}>
              <Text style={styles.ramLabel}>RAM del modo</Text>
              <Text style={styles.ramValue}>{ramModeLabel}</Text>
            </View>
          </View>
          {pairPeak != null && pairBudget != null ? (
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  showRamPressure && styles.barFillWarn,
                  { width: `${Math.round(budgetRatio * 100)}%` },
                ]}
              />
            </View>
          ) : (
            <Text style={styles.ramHint}>Elige un modo para continuar</Text>
          )}
        </View>

        {showRamPressure ? (
          <View
            style={styles.ramWarnBox}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.ramWarnText}>
              Tu teléfono no tiene suficiente RAM para estos modelos. Corre el
              riesgo de que se pete.
            </Text>
          </View>
        ) : null}

        {lastError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{lastError.toDisplayString()}</Text>
          </View>
        ) : null}

        <View style={styles.modes}>
          {PRESET_MODES.map((mode) => {
            const selectedMode = activeMode === mode.id;
            const busy = busyModeId === mode.id;
            const asrState = getModelState(mode.asrId);
            const mtState = getModelState(mode.mtId);
            const modeDownloading =
              asrState.status === "downloading" ||
              mtState.status === "downloading";
            const modePaused =
              !modeDownloading &&
              (asrState.status === "paused" || mtState.status === "paused");
            const pct = Math.round(
              ((installProgress(asrState) + installProgress(mtState)) / 2) *
                100,
            );
            return (
              <Pressable
                key={mode.id}
                style={[
                  styles.modeButton,
                  selectedMode && styles.modeButtonSelected,
                ]}
                onPress={() => {
                  if (modeDownloading) return;
                  void onPreset(mode);
                }}
                accessibilityRole="button"
                accessibilityState={{
                  selected: selectedMode,
                  busy: modeDownloading || busy,
                }}
              >
                <View style={styles.modeTextCol}>
                  <Text
                    style={[
                      styles.modeLabel,
                      selectedMode && styles.modeLabelSelected,
                    ]}
                  >
                    {selectedMode ? `✓ ${mode.label}` : mode.label}
                  </Text>
                  {mode.subtitle ? (
                    <Text
                      style={[
                        styles.modeSubtitle,
                        selectedMode && styles.modeSubtitleSelected,
                      ]}
                    >
                      {mode.subtitle}
                    </Text>
                  ) : null}
                  {modeDownloading || busy ? (
                    <>
                      <Text
                        style={[
                          styles.modeBusy,
                          selectedMode && styles.modeBusySelected,
                        ]}
                      >
                        {pct < 100
                          ? `Descargando… ${pct}%`
                          : "Seleccionando…"}
                      </Text>
                      {pct < 100 ? (
                        <Text
                          style={[
                            styles.modeHint,
                            selectedMode && styles.modeHintSelected,
                          ]}
                        >
                          Puedes salir de la app; la descarga continúa.
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                  {modePaused ? (
                    <Text
                      style={[
                        styles.modeBusy,
                        selectedMode && styles.modeBusySelected,
                      ]}
                    >
                      Pausada · {pct}%
                    </Text>
                  ) : null}
                </View>
                {modeDownloading ? (
                  <Pressable
                    style={[
                      styles.pauseChip,
                      selectedMode && styles.pauseChipSelected,
                    ]}
                    onPress={() => void onPauseMode(mode)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Pausar descarga de ${mode.label}`}
                  >
                    <Text
                      style={[
                        styles.pauseChipText,
                        selectedMode && styles.pauseChipTextSelected,
                      ]}
                    >
                      Pausar
                    </Text>
                  </Pressable>
                ) : (
                  <Text
                    style={[
                      styles.modeRam,
                      selectedMode && styles.modeRamSelected,
                    ]}
                  >
                    ~{formatBytes(presetModePeakBytes(mode))} RAM
                  </Text>
                )}
              </Pressable>
            );
          })}

          <View>
            <Pressable
              style={[
                styles.modeButton,
                activeMode === "personalizado" && styles.modeButtonSelected,
              ]}
              onPress={onToggleCustom}
              accessibilityRole="button"
              accessibilityState={{
                selected: activeMode === "personalizado",
                expanded: showCustomSlots,
              }}
            >
              <Text
                style={[
                  styles.modeLabel,
                  activeMode === "personalizado" && styles.modeLabelSelected,
                ]}
              >
                {activeMode === "personalizado"
                  ? "✓ Personalizado"
                  : "Personalizado"}
              </Text>
              <Text
                style={[
                  styles.modeRam,
                  activeMode === "personalizado" && styles.modeRamSelected,
                ]}
              >
                {customRamLabel ?? "—"}
              </Text>
            </Pressable>

            {showCustomSlots ? (
              <View style={styles.customRow}>
                <CustomSlot
                  title="Transcriptor"
                  label={selectedAsr?.shortLabel ?? selectedAsr?.label}
                  onPress={() =>
                    router.push("/modelos/transcriptores" as Href)
                  }
                />
                <CustomSlot
                  title="Traductor"
                  label={selectedMt?.shortLabel ?? selectedMt?.label}
                  onPress={() => router.push("/modelos/traductores" as Href)}
                />
              </View>
            ) : null}
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

function CustomSlot({
  title,
  label,
  onPress,
}: {
  title: string;
  label?: string;
  onPress: () => void;
}) {
  const filled = label != null;
  return (
    <Pressable
      style={[styles.slot, filled ? styles.slotFilled : styles.slotEmpty]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${label ?? "Seleccionar"}`}
    >
      <Text style={styles.slotTitle}>{title}</Text>
      <Text style={[styles.slotValue, !filled && styles.slotValueEmpty]}>
        {label ?? "Seleccionar"}
      </Text>
    </Pressable>
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
    flexGrow: 1,
  },
  ramHero: {
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
    color: theme.colors.textMuted,
  },
  ramRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  ramMetric: {
    flex: 1,
  },
  ramLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
  },
  ramValue: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.title,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  barTrack: {
    marginTop: theme.spacing.md,
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.background,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.action,
  },
  barFillWarn: {
    backgroundColor: theme.colors.error,
  },
  ramHint: {
    marginTop: theme.spacing.md,
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
  },
  ramWarnBox: {
    borderWidth: 1,
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  ramWarnText: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.error,
    lineHeight: 18,
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
  modes: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.sm,
    flex: 1,
  },
  modeButton: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.surface,
  },
  modeButtonSelected: {
    backgroundColor: theme.colors.action,
    borderColor: theme.colors.action,
  },
  modeButtonDimmed: {
    opacity: 0.5,
  },
  modeTextCol: {
    flex: 1,
    minWidth: 0,
  },
  modeLabel: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.title,
    color: theme.colors.text,
  },
  modeLabelSelected: {
    color: theme.colors.onAction,
  },
  modeSubtitle: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  modeSubtitleSelected: {
    color: theme.colors.onAction,
    opacity: 0.85,
  },
  modeBusy: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  modeBusySelected: {
    color: theme.colors.onAction,
  },
  modeHint: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  modeHintSelected: {
    color: theme.colors.onAction,
    opacity: 0.8,
  },
  modeRam: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
    flexShrink: 0,
  },
  modeRamSelected: {
    color: theme.colors.onAction,
    opacity: 0.9,
  },
  pauseChip: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  pauseChipSelected: {
    borderColor: theme.colors.onAction,
    backgroundColor: "transparent",
  },
  pauseChipText: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.caption,
    color: theme.colors.text,
  },
  pauseChipTextSelected: {
    color: theme.colors.onAction,
  },
  customRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  slot: {
    flex: 1,
    minHeight: 72,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    paddingVertical: theme.spacing.ml,
    paddingHorizontal: theme.spacing.md,
    justifyContent: "center",
  },
  slotEmpty: {
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.background,
  },
  slotFilled: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.surface,
  },
  slotTitle: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 0.8,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
  },
  slotValue: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  slotValueEmpty: {
    color: theme.colors.textMuted,
  },
  gateFooter: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: theme.spacing.lg,
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
