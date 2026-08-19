import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Puente',
  slug: 'puente',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'puente',
  userInterfaceStyle: 'light',
  ios: {
    icon: './assets/icon.png',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'Puente uses the microphone continuously while Traductor is open to listen and translate your speech in real time. Audio is processed on device and is not saved.',
      NSSpeechRecognitionUsageDescription:
        'Puente transcribes speech on-device with a local Whisper model. Audio is processed on the device and is not saved.',
    },
    bundleIdentifier: 'dev.pablovallejo.puente',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#F2F6D0',
    },
    permissions: [
      'android.permission.INTERNET',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.POST_NOTIFICATIONS',
    ],
    predictiveBackGestureEnabled: false,
    package: 'dev.pablovallejo.puente',
  },
  web: {
    output: 'static',
  },
  plugins: [
    './plugins/with-large-heap',
    './plugins/with-ort-sherpa-packaging',
    ['@kesha-antonov/react-native-background-downloader', { skipMmkvDependency: true }],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F2F6D0',
        android: {
          image: './assets/icon.png',
          imageWidth: 76,
        },
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission:
          'Puente uses the microphone continuously while Traductor is open to listen and translate your speech in real time. Audio is processed on device and is not saved.',
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission:
          'Puente uses the microphone continuously while Traductor is open to listen and translate your speech in real time. Audio is processed on device and is not saved.',
        speechRecognitionPermission:
          'Puente transcribes speech on-device with a local Whisper model. Audio is processed on the device and is not saved.',
        androidSpeechServicePackages: ['com.google.android.as', 'com.google.android.googlequicksearchbox'],
      },
    ],
    'expo-localization',
    'expo-font',
    'expo-router',
    'expo-secure-store',
    // Native GGUF runtime (llama.cpp). Without this plugin the TurboModule is
    // not linked and every llama catalog entry fails with ENGINE_MODULE_UNAVAILABLE.
    'llama.rn',
    'expo-asset',
    'expo-image',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'e060bd60-a102-4ae9-bc00-dcaeaff360f6',
    },
  },
};

export default config;
