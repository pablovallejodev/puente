import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { ChatHeadComponent } from '@/components/basics/headers';
import { ChatMessageItem } from '@/components/traductor/chat-message-item';
import { LanguageSlotButton } from '@/components/traductor/language-slot-button';
import { ModeMenuButton } from '@/components/traductor/mode-menu-button';
import { findTraductorLanguageById, findTraductorLanguageByLocale } from '@/constants/traductor-languages';
import { useTraductorSession } from '@/contexts/traductor-session-context';
import { useModelCatalog } from '@/contexts/model-catalog-context';
import { useChatMessages } from '@/hooks/use-chat-messages';
import {
  useSpeechTranscriptor,
  type SpeechInputMode,
  type TranscriptionOutcome,
} from '@/hooks/use-speech-transcriptor';
import { useTranslator } from '@/hooks/use-translator';
import { readMicPaused, writeMicPaused } from '@/lib/model-preferences';
import { resolveSpeechDisableMode } from '@/lib/speech-disable-mode';
import { resolveTranslationTarget } from '@/lib/traductor-target';
import { STANDARD_HORIZONTAL_PADDING } from '@/constants/ui';
import { StatusBarComponent } from '@/utils/statusbar';
import { theme } from '@/constants/theme';

const directionArrowIcon = require('@/assets/icons/arrows/white/right.png');
const directionArrowLeftIcon = require('@/assets/icons/arrows/white/left.png');
const micOnIcon = require('@/assets/icons/mic/white.png');
const micOffIcon = require('@/assets/icons/mic/off.png');

/** Soft transcription errors stay visible briefly, then leave the list. */
const TRANSCRIPTION_ERROR_DISMISS_MS = 2500;

function sourceIdFromLocale(locale: string): string {
  const byLocale = findTraductorLanguageByLocale(locale);
  if (byLocale) return byLocale.id;
  const prefix = locale.split('-')[0]?.toLowerCase();
  if (prefix) {
    const byId = findTraductorLanguageById(prefix);
    if (byId) return byId.id;
    return prefix;
  }
  return 'und';
}

export default function TraductorComponent() {
  const router = useRouter();
  const [isFocused, setIsFocused] = useState(true);
  const [micPaused, setMicPaused] = useState(false);
  const [micHydrated, setMicHydrated] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      void activateKeepAwakeAsync('traductor-session');
      return () => {
        setIsFocused(false);
        deactivateKeepAwake('traductor-session');
      };
    }, []),
  );

  const { mode, setMode, modeMenuInitiallyOpen, inputLanguage, outputLanguage, languageTwo, baseHydrated } =
    useTraductorSession();

  const {
    messages,
    beginPendingTranscript,
    completePendingTranscript,
    discardPendingTranscript,
    failPendingTranscript,
    removeMessage,
    appendFinalTranscript,
    onTranslationUpdate,
  } = useChatMessages();

  const flatListRef = useRef<FlatList>(null);
  const pendingIdRef = useRef<string | null>(null);
  const errorTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Accent + scroll track the last completed transcript, not ephemeral pending/error.
  const latestMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].transcriptionStatus === 'done') return messages[i].id;
    }
    return null;
  }, [messages]);
  const prevLatestIdRef = useRef<string | null>(null);

  const clearErrorTimer = useCallback((messageId: string) => {
    const timer = errorTimersRef.current.get(messageId);
    if (timer) clearTimeout(timer);
    errorTimersRef.current.delete(messageId);
  }, []);

  const failPendingWithDismiss = useCallback(
    (messageId: string, message: string) => {
      failPendingTranscript(messageId, message);
      clearErrorTimer(messageId);
      const timer = setTimeout(() => {
        errorTimersRef.current.delete(messageId);
        removeMessage(messageId);
      }, TRANSCRIPTION_ERROR_DISMISS_MS);
      errorTimersRef.current.set(messageId, timer);
    },
    [clearErrorTimer, failPendingTranscript, removeMessage],
  );

  useEffect(() => {
    const timers = errorTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const paused = await readMicPaused();
        if (!cancelled) setMicPaused(paused);
      } catch {
        /* prefs best-effort — keep default (open) */
      } finally {
        if (!cancelled) setMicHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const speechInput: SpeechInputMode = useMemo(() => {
    if (mode === 'conversation') return { mode: 'auto' };
    if (inputLanguage.kind === 'universal') return { mode: 'auto' };
    return { mode: 'fixed', locale: inputLanguage.language.speechLocale };
  }, [inputLanguage, mode]);

  const prefsReady = baseHydrated && micHydrated;
  const speechEnabled = isFocused && prefsReady && !micPaused;
  const speechDisableMode = resolveSpeechDisableMode({
    micPaused,
    isFocused,
    baseHydrated: prefsReady,
  });

  const toggleMicPaused = useCallback(() => {
    setMicPaused((prev) => {
      const next = !prev;
      void writeMicPaused(next).catch(() => {
        /* prefs best-effort */
      });
      return next;
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleTranslation = useCallback(
    (messageId: string, translated: string, status: 'queued' | 'translating' | 'done' | 'error') => {
      onTranslationUpdate(messageId, translated, status);
    },
    [onTranslationUpdate],
  );

  const { status, error, diagnostics, ready, retry, canRetryLoad, isTranslating, pendingCount, enqueueTranslation } =
    useTranslator(handleTranslation);

  const handleTranscriptionStart = useCallback(() => {
    if (pendingIdRef.current) return;
    const sourceLanguageId =
      mode === 'conversation' ? 'und' : inputLanguage.kind === 'fixed' ? inputLanguage.language.id : 'und';
    pendingIdRef.current = beginPendingTranscript(sourceLanguageId);
  }, [beginPendingTranscript, inputLanguage, mode]);

  const handleTranscriptionEnd = useCallback(
    (outcome: TranscriptionOutcome) => {
      const id = pendingIdRef.current;
      pendingIdRef.current = null;
      if (!id) return;

      if (outcome.type === 'cancel') {
        clearErrorTimer(id);
        discardPendingTranscript(id);
        return;
      }

      failPendingWithDismiss(id, outcome.type === 'empty' ? 'No se entendió' : 'No se pudo transcribir');
    },
    [clearErrorTimer, discardPendingTranscript, failPendingWithDismiss],
  );

  const handleFinalTranscript = useCallback(
    (text: string, _isFinal: boolean, detectedLocale?: string) => {
      const locale =
        detectedLocale ??
        (mode === 'one_way' && inputLanguage.kind === 'fixed' ? inputLanguage.language.speechLocale : '');
      const trimmed = text.trim();
      if (!locale || !trimmed) {
        const id = pendingIdRef.current;
        pendingIdRef.current = null;
        if (id) failPendingWithDismiss(id, 'No se entendió');
        return;
      }

      const sourceLanguageId = sourceIdFromLocale(locale);
      const pendingId = pendingIdRef.current;
      pendingIdRef.current = null;
      if (pendingId) clearErrorTimer(pendingId);

      const messageId = pendingId
        ? completePendingTranscript(pendingId, trimmed, sourceLanguageId)
          ? pendingId
          : appendFinalTranscript(trimmed, sourceLanguageId)
        : appendFinalTranscript(trimmed, sourceLanguageId);
      if (!messageId) return;

      const targetLocale = resolveTranslationTarget({
        mode,
        detectedLocale: locale,
        languageOne: outputLanguage,
        languageTwo,
      });

      enqueueTranslation({
        messageId,
        text: trimmed,
        inputLocale: locale,
        outputLanguage: targetLocale,
      });
    },
    [
      appendFinalTranscript,
      clearErrorTimer,
      completePendingTranscript,
      enqueueTranslation,
      failPendingWithDismiss,
      inputLanguage,
      languageTwo,
      mode,
      outputLanguage,
    ],
  );

  const {
    error: speechError,
    checkingPermissions,
    isListening,
    isTranscribing,
    backlogDropped,
  } = useSpeechTranscriptor(speechInput, {
    requiresOnDeviceRecognition: true,
    onTranscriptionStart: handleTranscriptionStart,
    onTranscriptionEnd: handleTranscriptionEnd,
    onInterimTranscript: handleFinalTranscript,
    enabled: speechEnabled,
    disableMode: speechDisableMode,
    clearStickyAfterAccept: mode === 'conversation',
  });

  const { isReady: modelsReady, booting: modelsBooting } = useModelCatalog();

  useEffect(() => {
    if (modelsBooting) return;
    if (!modelsReady) {
      router.replace('/modelos' as Href);
    }
  }, [modelsBooting, modelsReady, router]);

  useEffect(() => {
    if (!latestMessageId) return;
    if (prevLatestIdRef.current === latestMessageId) return;
    prevLatestIdRef.current = latestMessageId;
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [latestMessageId]);

  const statusLabel = !prefsReady
    ? 'Preparando preferencias…'
    : status === 'loading'
      ? 'Cargando motor de traducción…'
      : checkingPermissions
        ? 'Cargando reconocimiento (Whisper)…'
        : speechError
          ? 'Error de reconocimiento'
          : status === 'error'
            ? 'Error'
            : isTranscribing
              ? 'Entendiendo…'
              : isTranslating
                ? pendingCount > 0
                  ? `Traduciendo… (+${pendingCount} en cola)`
                  : 'Traduciendo…'
                : micPaused
                  ? 'Micrófono pausado'
                  : backlogDropped
                    ? 'Algunos fragmentos se omitieron'
                    : isListening
                      ? 'Escuchando'
                      : ready
                        ? 'Listo en el dispositivo'
                        : 'Error';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarComponent />
      <ChatHeadComponent titleText="Traductor" onSettingsPress={() => router.push('/modelos' as Href)} />

      <View style={styles.statusRow}>
        <View style={styles.statusPill} accessibilityLiveRegion="polite">
          <View
            style={[
              styles.statusDot,
              (isListening || isTranscribing || isTranslating) && styles.statusDotActive,
              (speechError || status === 'error') && styles.statusDotError,
            ]}
          />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatMessageItem message={item} isLatest={item.id === latestMessageId} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyMarkFrame}>
              <Image source={require('@/assets/icon.png')} style={styles.emptyMark} accessibilityIgnoresInvertColors />
            </View>
            <Text style={styles.emptyTitle}>Habla. Escucha. Entiende.</Text>
            <Text style={styles.emptyText}>
              Empieza a hablar y Puente traducirá la conversación aquí, sin sacar tu voz del teléfono.
            </Text>
            <Text style={styles.emptyPrivacy}>TU VOZ NO SALE DEL TELÉFONO</Text>
          </View>
        }
      />

      {error ? (
        <View style={styles.errorBox} accessibilityLiveRegion="assertive">
          <Text style={styles.errorText}>{error}</Text>
          {diagnostics ? (
            <Text style={styles.errorMeta}>
              [{diagnostics.code}@{diagnostics.stage}]
            </Text>
          ) : null}
          {(canRetryLoad || ready) && (
            <Pressable style={styles.retryButton} onPress={retry}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {speechError ? (
        <View style={styles.errorBox} accessibilityLiveRegion="assertive">
          <Text style={styles.errorText}>{speechError.message}</Text>
        </View>
      ) : null}

      <View style={styles.bottomPanel}>
        <View style={styles.controlsRow}>
          <View style={styles.controlsSide} />
          <ModeMenuButton mode={mode} onChangeMode={setMode} initiallyOpen={modeMenuInitiallyOpen} />
          <View style={[styles.controlsSide, styles.controlsSideEnd]}>
            <Pressable
              style={({ pressed }) => [
                styles.micButton,
                micPaused && styles.micButtonPaused,
                pressed && styles.micButtonPressed,
              ]}
              onPress={toggleMicPaused}
              accessibilityRole="button"
              accessibilityState={{ checked: !micPaused }}
              accessibilityLabel={micPaused ? 'Reanudar micrófono' : 'Pausar micrófono'}
              hitSlop={8}
            >
              <Image
                source={micPaused ? micOffIcon : micOnIcon}
                style={[styles.micIcon, micPaused && styles.micIconPaused]}
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          </View>
        </View>
        <View style={styles.languagePair}>
          {mode === 'conversation' ? (
            <LanguageSlotButton slot="output" language={outputLanguage} slotLabel="Idioma 1" />
          ) : inputLanguage.kind === 'universal' ? (
            <LanguageSlotButton slot="input" kind="universal" />
          ) : (
            <LanguageSlotButton slot="input" kind="fixed" language={inputLanguage.language} />
          )}
          <View style={styles.directionMark} accessibilityElementsHidden>
            {mode === 'conversation' ? (
              <View style={styles.bidirectionalMark}>
                <Image
                  source={directionArrowIcon}
                  style={styles.directionArrowIconBi}
                  accessibilityIgnoresInvertColors
                />
                <Image
                  source={directionArrowLeftIcon}
                  style={styles.directionArrowIconBi}
                  accessibilityIgnoresInvertColors
                />
              </View>
            ) : (
              <Image source={directionArrowIcon} style={styles.directionArrowIcon} accessibilityIgnoresInvertColors />
            )}
          </View>
          {mode === 'conversation' ? (
            <LanguageSlotButton slot="lang2" language={languageTwo} slotLabel="Idioma 2" />
          ) : (
            <LanguageSlotButton slot="output" language={outputLanguage} slotLabel="Traduce a" />
          )}
        </View>
        {mode === 'one_way' && inputLanguage.kind === 'universal' ? (
          <Text style={styles.helperText}>Si la detección automática falla, fija el idioma de entrada.</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  statusRow: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
  },
  statusPill: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.ml,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  statusDot: {
    width: 6,
    height: 6,
    marginRight: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.textMuted,
  },
  statusDotActive: {
    backgroundColor: theme.colors.action,
  },
  statusDotError: {
    backgroundColor: theme.colors.error,
  },
  statusText: {
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 0.3,
    color: theme.colors.text,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.sm,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xl,
  },
  emptyMarkFrame: {
    width: 88,
    height: 88,
    padding: 5,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceStone,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  emptyMark: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.md,
  },
  emptyTitle: {
    marginTop: theme.spacing.lg,
    fontFamily: theme.font.heading,
    fontSize: theme.type.title,
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 300,
    marginTop: theme.spacing.sm,
    fontFamily: theme.font.body,
    fontSize: theme.type.body,
    lineHeight: 22,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  emptyPrivacy: {
    marginTop: theme.spacing.md,
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 1.1,
    color: theme.colors.text,
    textAlign: 'center',
  },
  errorBox: {
    marginHorizontal: STANDARD_HORIZONTAL_PADDING,
    marginBottom: 8,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.surface,
  },
  errorText: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.colors.error,
  },
  errorMeta: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.colors.text,
    marginTop: 4,
  },
  retryButton: {
    minHeight: 44,
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.action,
    borderRadius: theme.radius.sm,
  },
  retryText: {
    fontFamily: theme.font.heading,
    fontSize: 12,
    color: theme.colors.text,
  },
  bottomPanel: {
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingHorizontal: STANDARD_HORIZONTAL_PADDING,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.ml,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.hairline,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  controlsSide: {
    flex: 1,
  },
  controlsSideEnd: {
    alignItems: 'flex-end',
  },
  micButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  micButtonPaused: {
    backgroundColor: theme.colors.surfaceStone,
  },
  micButtonPressed: {
    backgroundColor: theme.colors.pressed,
    transform: [{ scale: 0.96 }],
  },
  micIcon: {
    width: 16,
    height: 16,
    tintColor: theme.colors.text,
  },
  micIconPaused: {
    tintColor: theme.colors.textMuted,
    opacity: 0.85,
  },
  languagePair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  directionMark: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.action,
  },
  directionArrowIcon: {
    width: 13,
    height: 13,
    tintColor: theme.colors.onAction,
  },
  bidirectionalMark: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  directionArrowIconBi: {
    width: 11,
    height: 11,
    tintColor: theme.colors.onAction,
  },
  helperText: {
    fontFamily: theme.font.body,
    fontSize: theme.type.micro,
    color: theme.colors.text,
    lineHeight: 14,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    textAlign: 'center',
  },
});
