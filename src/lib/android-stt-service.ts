import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export const ANDROID_AS_PACKAGE = 'com.google.android.as';
export const ANDROID_GOOGLE_APP_PACKAGE = 'com.google.android.googlequicksearchbox';

export type AndroidLocaleSnapshot = {
  supportedLocales: string[];
  installedLocales: string[];
  /** Package that provided this snapshot. Only `.as` can back offline mode. */
  servicePackage: string | null;
  /** True when framework reports on-device recognition is actually creatable. */
  onDeviceAvailable: boolean;
};

let onDevicePackage: string | null | undefined;
let onlinePackage: string | null | undefined;
let onDeviceAvailableCache: boolean | undefined;

async function probePackage(pkg: string): Promise<{
  ok: boolean;
  supportedLocales: string[];
  installedLocales: string[];
}> {
  try {
    const result = await ExpoSpeechRecognitionModule.getSupportedLocales({
      androidRecognitionServicePackage: pkg,
    });
    return {
      ok: true,
      supportedLocales: result.locales ?? [],
      installedLocales: result.installedLocales ?? [],
    };
  } catch {
    return { ok: false, supportedLocales: [], installedLocales: [] };
  }
}

/** Framework-level check — false on GrapheneOS / devices without on-device service. */
export function isOnDeviceSttSupported(): boolean {
  if (Platform.OS === 'ios') {
    return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  }
  if (Platform.OS !== 'android') return false;
  if (onDeviceAvailableCache !== undefined) return onDeviceAvailableCache;
  try {
    onDeviceAvailableCache = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    onDeviceAvailableCache = false;
  }
  return onDeviceAvailableCache;
}

export async function getOnDeviceSttPackage(): Promise<string | null> {
  if (onDevicePackage !== undefined) return onDevicePackage;
  if (Platform.OS !== 'android') {
    onDevicePackage = null;
    return null;
  }
  if (!isOnDeviceSttSupported()) {
    onDevicePackage = null;
    return null;
  }
  const probe = await probePackage(ANDROID_AS_PACKAGE);
  onDevicePackage = probe.ok ? ANDROID_AS_PACKAGE : null;
  return onDevicePackage;
}

export function getOnDeviceSttPackageSync(): string | null {
  return onDevicePackage ?? null;
}

export async function getOnlineSttPackage(): Promise<string | null> {
  if (onlinePackage !== undefined) return onlinePackage;
  if (Platform.OS !== 'android') {
    onlinePackage = null;
    return null;
  }
  for (const pkg of [ANDROID_GOOGLE_APP_PACKAGE, ANDROID_AS_PACKAGE]) {
    const probe = await probePackage(pkg);
    if (probe.ok) {
      onlinePackage = pkg;
      return pkg;
    }
  }
  onlinePackage = null;
  return null;
}

/**
 * Prefer `.as` for offline model lists. Fall back to Google app only for
 * online locale probing — that fallback must never enable downloaded mode.
 */
export async function fetchAndroidLocaleSnapshot(): Promise<AndroidLocaleSnapshot> {
  const onDeviceAvailable = isOnDeviceSttSupported();

  if (onDeviceAvailable) {
    const asProbe = await probePackage(ANDROID_AS_PACKAGE);
    if (asProbe.ok) {
      onDevicePackage = ANDROID_AS_PACKAGE;
      return {
        supportedLocales: asProbe.supportedLocales,
        installedLocales: asProbe.installedLocales,
        servicePackage: ANDROID_AS_PACKAGE,
        onDeviceAvailable: true,
      };
    }
  }

  onDevicePackage = null;

  const onlineProbe = await probePackage(ANDROID_GOOGLE_APP_PACKAGE);
  if (onlineProbe.ok) {
    onlinePackage = ANDROID_GOOGLE_APP_PACKAGE;
    return {
      supportedLocales: onlineProbe.supportedLocales,
      // Never treat Google-app locales as offline-installed.
      installedLocales: [],
      servicePackage: ANDROID_GOOGLE_APP_PACKAGE,
      onDeviceAvailable: false,
    };
  }

  throw new Error('Failed to retrieve recognition service package');
}

export function resetAndroidSttPackageCache(): void {
  onDevicePackage = undefined;
  onlinePackage = undefined;
  onDeviceAvailableCache = undefined;
}
