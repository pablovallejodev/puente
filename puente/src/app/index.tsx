import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAppContext } from '@/context/app-context';
import {
  checkModelReady,
  downloadModel,
  getBootstrapErrorMessage,
  getModelDownloadProgress,
  loadTranslator,
  resetTranslatorCache,
} from '@/lib/model-manager';

type BootstrapPhase = 'checking' | 'downloading' | 'loading-model' | 'error';

const KEEP_AWAKE_TAG = 'puente-model-download';

export default function LoadingScreen() {
  const router = useRouter();
  const { setTranslator } = useAppContext();
  const [phase, setPhase] = useState<BootstrapPhase>('checking');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Preparing Puente…');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const bootstrapStartedRef = useRef(false);

  const bootstrap = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPhase('error');
      setErrorMessage(
        'Puente requires native speech recognition and on-device translation. Use the Android or iOS development build.',
      );
      return;
    }

    setPhase('checking');
    setErrorMessage(null);
    setProgress(0);
    setStatusText('Checking model files…');

    try {
      if (!checkModelReady()) {
        setPhase('downloading');
        setStatusText(
          Platform.OS === 'android'
            ? 'Downloading model (~2 GB). You can lock the screen — download continues in the background.'
            : 'Downloading translation model…',
        );
        await downloadModel(setProgress);
      } else {
        setProgress(100);
      }

      setPhase('loading-model');
      setStatusText('Loading model…');
      const translator = await loadTranslator();
      setTranslator(translator);
      router.replace('/home');
    } catch (error) {
      console.error('Bootstrap failed:', error);
      setPhase('error');
      setErrorMessage(getBootstrapErrorMessage(error));
    }
  }, [router, setTranslator]);

  const handleRetry = useCallback(() => {
    resetTranslatorCache();
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;
    console.log('[puente] bootstrap:start');
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (phase !== 'downloading') {
      return;
    }

    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);

    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'downloading') {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setProgress(getModelDownloadProgress());
      }
    });

    return () => subscription.remove();
  }, [phase]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText type="title" style={styles.title}>
            Puente
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            On-device speech translation
          </ThemedText>

          {phase === 'error' ? (
            <View style={styles.statusBlock}>
              <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
              {Platform.OS !== 'web' ? (
                <Pressable style={styles.retryButton} onPress={handleRetry}>
                  <ThemedText style={styles.retryLabel}>Retry</ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.statusBlock}>
              <ActivityIndicator size="large" />
              <ThemedText type="small" themeColor="textSecondary" style={styles.statusText}>
                {statusText}
              </ThemedText>
              {phase === 'downloading' ? (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                  <ThemedText type="code">{progress}%</ThemedText>
                </>
              ) : null}
            </View>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: 56,
    lineHeight: 60,
  },
  subtitle: {
    textAlign: 'center',
  },
  statusBlock: {
    marginTop: Spacing.five,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: Spacing.three,
  },
  statusText: {
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#3c87f7',
  },
  errorText: {
    textAlign: 'center',
    color: '#d64545',
  },
  retryButton: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    backgroundColor: '#3c87f7',
  },
  retryLabel: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
