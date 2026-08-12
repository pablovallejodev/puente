import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback } from 'react';

import { StandardHeadComponent } from '@/components/basics/headers';
import { ModelCard } from '@/components/modelos/model-card';
import { defaultCompanionPeakBytes, getModelSpec } from '@/constants/model-catalog';
import { STANDARD_HORIZONTAL_PADDING } from '@/constants/ui';
import { useModelCatalog } from '@/contexts/model-catalog-context';
import { StatusBarDarkComponent } from '@/utils/statusbar';
import { theme } from '@/constants/theme';

export default function TranscriptoresComponent() {
  const { booting, totalMemoryBytes, lastError, selected, asrModels } = useModelCatalog();

  const companionPeak = selected.mt != null ? (getModelSpec(selected.mt)?.peakRamBytes ?? 0) : undefined;

  const onSelected = useCallback(() => {
    router.back();
  }, []);

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
      <StandardHeadComponent titleText="Transcriptores" loading={false} onBack={() => router.back()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {lastError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{lastError.toDisplayString()}</Text>
          </View>
        ) : null}
        {asrModels.map((spec) => (
          <ModelCard
            key={spec.id}
            spec={spec}
            ramBytes={totalMemoryBytes}
            companionPeakBytes={companionPeak ?? defaultCompanionPeakBytes(spec)}
            onSelected={onSelected}
          />
        ))}
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
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.error,
  },
});
