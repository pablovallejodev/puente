import { StatusBarHiddenComponent } from '@/utils/statusbar';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { useModelCatalog } from '@/contexts/model-catalog-context';

export default function IndexComponent() {
  const router = useRouter();
  const { booting, ready, isReady } = useModelCatalog();

  useEffect(() => {
    if (booting || !ready) return;
    router.replace((isReady ? '/traductor' : '/modelos') as Href);
  }, [booting, ready, isReady, router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <View style={styles.content}>
        <View style={styles.markFrame}>
          <Image
            source={require('@/assets/icon.png')}
            style={styles.mark}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessible={false}
          />
        </View>
        <Text style={styles.wordmark}>PUENTE</Text>
        <Text style={styles.slogan}>Lo que une civilizaciones</Text>
        <ActivityIndicator style={styles.loader} size="small" color={theme.colors.action} />
        <Text style={styles.loadingText} accessibilityLiveRegion="polite">
          Comprobando modelos locales
        </Text>
      </View>
      <Text style={styles.localNote}>Tu voz no sale del teléfono.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  markFrame: {
    width: 120,
    height: 120,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  mark: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.lg,
  },
  wordmark: {
    marginTop: theme.spacing.lg,
    fontFamily: theme.font.display,
    fontSize: theme.type.display,
    letterSpacing: 7,
    color: theme.colors.text,
    textAlign: 'center',
  },
  slogan: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.font.body,
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  loader: {
    marginTop: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.ml,
    fontFamily: theme.font.body,
    fontSize: theme.type.caption,
    color: theme.colors.textMuted,
  },
  localNote: {
    paddingBottom: theme.spacing.lg,
    fontFamily: theme.font.heading,
    fontSize: theme.type.micro,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
