import { useEffect, useRef } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TranslationMessageItem } from '@/components/translation-message';
import { getLanguageLabel } from '@/constants/languages';
import { Spacing } from '@/constants/theme';
import { useAppContext } from '@/context/app-context';
import { useSpeechTranslator } from '@/hooks/use-speech-translator';

export default function HomeComponent() {
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const { baseLanguage, clearMessages, messages, translator } = useAppContext();
  const { clearError, errorMessage, isListening, isTranslating, toggleListening } =
    useSpeechTranslator();

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  if (Platform.OS === 'web') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title">Puente</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.webFallback}>
            Puente requires a native development build on Android or iOS. Web does not support
            on-device speech recognition or ONNX translation.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const controlsDisabled = !translator || isTranslating;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            Puente
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={messages.length === 0}
            onPress={clearMessages}
            style={({ pressed }) => [
              styles.clearButton,
              messages.length === 0 && styles.clearButtonDisabled,
              pressed && messages.length > 0 && styles.pressed,
            ]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Clear
            </ThemedText>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.listContentEmpty,
          ]}
          renderItem={({ item }) => <TranslationMessageItem message={item} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyTitle}>
                No translations yet
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.emptyBody}>
                Tap Start to listen. Final utterances will appear here translated into your base
                language.
              </ThemedText>
            </View>
          }
        />

        {errorMessage ? (
          <Pressable onPress={clearError} style={styles.errorBanner}>
            <ThemedText type="small" style={styles.errorBannerText}>
              {errorMessage}
            </ThemedText>
          </Pressable>
        ) : null}

        <View style={styles.footer}>
          {isListening ? (
            <View style={styles.listeningRow}>
              <View style={styles.listeningDot} />
              <ThemedText type="small" themeColor="textSecondary">
                Listening…
              </ThemedText>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/languages')}
            style={({ pressed }) => [styles.languageButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold">
              Idioma base: {getLanguageLabel(baseLanguage)}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={controlsDisabled && !isListening}
            onPress={() => void toggleListening()}
            style={({ pressed }) => [
              styles.toggleButton,
              isListening ? styles.toggleButtonStop : styles.toggleButtonStart,
              controlsDisabled && !isListening && styles.toggleButtonDisabled,
              pressed && styles.pressed,
            ]}>
            <ThemedText style={styles.toggleLabel}>
              {isListening ? 'Stop' : isTranslating ? 'Translating…' : 'Start'}
            </ThemedText>
          </Pressable>
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
  webFallback: {
    marginTop: Spacing.three,
    lineHeight: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  headerTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  clearButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  clearButtonDisabled: {
    opacity: 0.4,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  emptyTitle: {
    fontWeight: '600',
  },
  emptyBody: {
    textAlign: 'center',
    lineHeight: 24,
  },
  errorBanner: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(214, 69, 69, 0.12)',
  },
  errorBannerText: {
    color: '#d64545',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128, 128, 128, 0.25)',
  },
  listeningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'center',
  },
  listeningDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3c87f7',
  },
  languageButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(128, 128, 128, 0.12)',
  },
  toggleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  toggleButtonStart: {
    backgroundColor: '#3c87f7',
  },
  toggleButtonStop: {
    backgroundColor: '#d64545',
  },
  toggleButtonDisabled: {
    opacity: 0.5,
  },
  toggleLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});
