import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatHeadComponent, StandardHeadComponent } from '@/components/basics/headers';
import {
  exceedsPairBudget,
  formatBytes,
  getModelSpec,
  ASR_MODELS,
  MT_MODELS,
  pairPeakRamBytes,
  PRESET_MODES,
  presetModePeakBytes,
  resolveActiveMode,
  SILERO_VAD_MODEL_ID,
  type ModelSpec,
  type PresetMode,
} from '@/constants/model-catalog';
import { STANDARD_HORIZONTAL_PADDING } from '@/constants/ui';
import { useModelCatalog, type ModelUiState } from '@/contexts/model-catalog-context';
import { StatusBarComponent } from '@/utils/statusbar';
import { theme } from '@/constants/theme';

function installProgress(state: ModelUiState): number {
  if (state.status === 'installed' || state.status === 'selected') return 1;
  if (state.status === 'downloading' || state.status === 'paused') {
    return state.progress;
  }
  return 0;
}

export default function ConfiguracionComponent() {
  const {
    isReady,
    booting,
    totalMemoryBytes,
    lastError,
    clearError,
    download,
    applyModelPair,
    getModelState,
    selected,
  } = useModelCatalog();

  const [isSetupFlow] = useState(() => !isReady);
  const [targetPair, setTargetPair] = useState<{ asrId: string; mtId: string } | null>(null);
  const presetRequestRef = useRef(0);

  const displayedAsrId = targetPair?.asrId ?? selected.asr;
  const displayedMtId = targetPair?.mtId ?? selected.mt;
  const displayedAsr = displayedAsrId ? getModelSpec(displayedAsrId) : undefined;
  const displayedMt = displayedMtId ? getModelSpec(displayedMtId) : undefined;
  const activeMode = resolveActiveMode(selected.asr, selected.mt);

  const pairPeak =
    displayedAsr && displayedMt ? pairPeakRamBytes(displayedAsr.peakRamBytes, displayedMt.peakRamBytes) : null;
  const showRamPressure =
    displayedAsr != null &&
    displayedMt != null &&
    exceedsPairBudget(displayedAsr.peakRamBytes, displayedMt.peakRamBytes, totalMemoryBytes);

  const ramPhoneLabel = totalMemoryBytes != null ? `${(totalMemoryBytes / (1024 * 1024 * 1024)).toFixed(1)} GB` : '—';
  const ramModeLabel = pairPeak != null ? `~${formatBytes(pairPeak)}` : '—';
  const ramRatio =
    pairPeak != null && totalMemoryBytes != null && totalMemoryBytes > 0 ? Math.min(pairPeak / totalMemoryBytes, 1) : 0;

  useEffect(() => {
    if (booting || !isReady) return;
    const pairDownloading = [...ASR_MODELS, ...MT_MODELS].some(
      (model) => getModelState(model.id).status === 'downloading',
    );
    if (pairDownloading) return;

    const vadState = getModelState(SILERO_VAD_MODEL_ID);
    if (vadState.error || (vadState.status !== 'not_installed' && vadState.status !== 'paused')) return;
    void download(SILERO_VAD_MODEL_ID).catch(() => {
      clearError();
    });
  }, [booting, clearError, download, getModelState, isReady]);

  const openTranscribers = useCallback(() => {
    setTargetPair(null);
    router.push('/modelos/transcriptores' as Href);
  }, []);

  const openTranslators = useCallback(() => {
    setTargetPair(null);
    router.push('/modelos/traductores' as Href);
  }, []);

  const onPreset = useCallback(
    (mode: PresetMode) => {
      const request = ++presetRequestRef.current;
      setTargetPair({ asrId: mode.asrId, mtId: mode.mtId });
      clearError();
      void applyModelPair(mode.asrId, mode.mtId)
        .then(() => {
          if (presetRequestRef.current !== request) return;
          setTargetPair((current) => (current?.asrId === mode.asrId && current.mtId === mode.mtId ? null : current));
        })
        .catch(() => {
          /* paused or lastError — keep the target visible for retry */
        });
    },
    [applyModelPair, clearError],
  );

  const goTraductor = useCallback(() => {
    if (!isReady) return;
    router.replace('/traductor' as Href);
  }, [isReady]);

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBarComponent />
        <View style={styles.boot}>
          <ActivityIndicator size="large" color={theme.colors.text} />
          <Text style={styles.bootText}>Comprobando modelos…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarComponent />
      {isSetupFlow ? (
        <ChatHeadComponent titleText="Configuración inicial" />
      ) : (
        <StandardHeadComponent titleText="Configuración" loading={false} onBack={() => router.back()} />
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.ramSummary} accessibilityLabel={`Pareja ${ramModeLabel} de ${ramPhoneLabel}`}>
          <View style={styles.ramSummaryRow}>
            <Text style={styles.ramSummaryValue}>{ramModeLabel}</Text>
            <Text style={styles.ramSummaryTotal}>{ramPhoneLabel}</Text>
          </View>
          {pairPeak != null && totalMemoryBytes != null ? (
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  showRamPressure && styles.barFillWarn,
                  { width: `${Math.round(ramRatio * 100)}%` },
                ]}
              />
            </View>
          ) : (
            <Text style={styles.ramHint}>Elige un modo para continuar</Text>
          )}
        </View>

        <View style={styles.modelCards}>
          <ModelProgressCard
            title="Transcriptor"
            spec={displayedAsr}
            state={displayedAsrId ? getModelState(displayedAsrId) : undefined}
            onPress={openTranscribers}
          />
          <ModelProgressCard
            title="Traductor"
            spec={displayedMt}
            state={displayedMtId ? getModelState(displayedMtId) : undefined}
            onPress={openTranslators}
          />
        </View>

        {showRamPressure ? (
          <View style={styles.ramWarnBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.ramWarnText}>
              Tu teléfono no tiene suficiente RAM para estos modelos. Corre el riesgo de que se pete.
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
            return (
              <Pressable
                key={mode.id}
                style={[styles.modeButton, selectedMode && styles.modeButtonSelected]}
                onPress={() => onPreset(mode)}
                accessibilityRole="button"
                accessibilityState={{
                  selected: selectedMode,
                }}
              >
                <View style={styles.modeTextCol}>
                  <Text style={[styles.modeLabel, selectedMode && styles.modeLabelSelected]}>
                    {selectedMode ? `✓ ${mode.label}` : mode.label}
                  </Text>
                  {mode.subtitle ? (
                    <Text style={[styles.modeSubtitle, selectedMode && styles.modeSubtitleSelected]}>
                      {mode.subtitle}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.modeRam, selectedMode && styles.modeRamSelected]}>
                  ~{formatBytes(presetModePeakBytes(mode))}
                </Text>
              </Pressable>
            );
          })}

          <View
            style={[styles.modeButton, activeMode === 'personalizado' && styles.modeButtonSelected]}
            accessible
            accessibilityRole="text"
            accessibilityState={{ selected: activeMode === 'personalizado' }}
          >
            <Text style={[styles.modeLabel, activeMode === 'personalizado' && styles.modeLabelSelected]}>
              {activeMode === 'personalizado' ? '✓ Personalizado' : 'Personalizado'}
            </Text>
          </View>
        </View>

        {isSetupFlow ? (
          !isReady ? (
            <Text style={styles.gateFooter}>
              Necesitas un modelo de transcripción y uno de traducción, descargados y seleccionados, para continuar.
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

function ModelProgressCard({
  title,
  spec,
  state,
  onPress,
}: {
  title: string;
  spec?: ModelSpec;
  state?: ModelUiState;
  onPress: () => void;
}) {
  const progress = Math.round(Math.max(0, Math.min(1, state ? installProgress(state) : 0)) * 100);
  const status =
    state?.status === 'downloading'
      ? `Descargando… ${progress}%`
      : state?.status === 'paused'
        ? `Pausado · ${progress}%`
        : state?.status === 'selected'
          ? 'En uso · 100%'
          : state?.status === 'installed'
            ? 'Disponible · 100%'
            : 'Pendiente · 0%';

  return (
    <Pressable
      style={styles.modelCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${spec?.label ?? 'Seleccionar modelo'}. ${status}`}
    >
      <View style={styles.modelCardHeader}>
        <View style={styles.modelCardText}>
          <Text style={styles.modelCardTitle}>{title}</Text>
          <Text style={styles.modelCardModel} numberOfLines={1}>
            {spec?.shortLabel ?? spec?.label ?? 'Seleccionar modelo'}
          </Text>
        </View>
        <Text style={styles.modelCardProgress}>{progress}%</Text>
      </View>
      <View style={styles.modelCardTrack}>
        <View style={[styles.modelCardFill, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.modelCardStatus}>{status}</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
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
  ramSummary: {
    marginTop: theme.spacing.md,
  },
  ramSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  ramSummaryValue: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  ramSummaryTotal: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
  },
  barTrack: {
    marginTop: theme.spacing.sm,
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.hairline,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.action,
  },
  barFillWarn: {
    backgroundColor: theme.colors.error,
  },
  ramHint: {
    marginTop: theme.spacing.sm,
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
  modelCards: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  modelCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 96,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.surface,
  },
  modelCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  modelCardText: {
    flex: 1,
    minWidth: 0,
  },
  modelCardTitle: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
  },
  modelCardModel: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  modelCardProgress: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.caption,
    color: theme.colors.text,
  },
  modelCardTrack: {
    height: 4,
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.hairline,
    overflow: 'hidden',
  },
  modelCardFill: {
    height: '100%',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.action,
  },
  modelCardStatus: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  modes: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.sm,
    flex: 1,
  },
  modeButton: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  gateFooter: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    lineHeight: 18,
  },
  continueButton: {
    minHeight: 52,
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.ml,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.action,
  },
  continueButtonText: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.body,
    color: theme.colors.onAction,
  },
});
