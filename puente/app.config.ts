import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Puente",
  slug: "puente",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "puente",
  userInterfaceStyle: "automatic",
  ios: {
    icon: "./assets/icon.png",
    infoPlist: {
      NSMicrophoneUsageDescription:
        "Puente uses the microphone continuously while Classic is open to listen and translate your speech in real time. Audio is processed on device and is not saved.",
      NSSpeechRecognitionUsageDescription:
        "Puente uses speech recognition to transcribe what you say. With an internet connection recognition runs online; offline it uses on-device models when available.",
    },
    bundleIdentifier: "com.pablovallejo.puente",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#E6F4FE",
    },
    permissions: [
      "android.permission.INTERNET",
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
    ],
    predictiveBackGestureEnabled: false,
    package: "com.pablovallejo.puente",
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "./plugins/with-large-heap",
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        android: {
          image: "./assets/icon.png",
          imageWidth: 76,
        },
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission:
          "Puente uses the microphone continuously while Classic is open to listen and translate your speech in real time. Audio is processed on device and is not saved.",
      },
    ],
    [
      "expo-speech-recognition",
      {
        microphonePermission:
          "Puente uses the microphone continuously while Classic is open to listen and translate your speech in real time. Audio is processed on device and is not saved.",
        speechRecognitionPermission:
          "Puente uses speech recognition to transcribe what you say. With an internet connection recognition runs online; offline it uses on-device models when available.",
        androidSpeechServicePackages: [
          "com.google.android.as",
          "com.google.android.googlequicksearchbox",
        ],
      },
    ],
    "expo-localization",
    "expo-font",
    "expo-router",
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "e060bd60-a102-4ae9-bc00-dcaeaff360f6",
    },
  },
};

export default config;
