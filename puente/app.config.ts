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
        "Puente needs microphone access to listen for speech and translate it in real time.",
      NSSpeechRecognitionUsageDescription:
        "Puente uses on-device speech recognition to detect what you say.",
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
          "Deepfriend needs access to your microphone for the call. We only will record when you press the talk button and we never save the audio, never.",
      },
    ],
    [
      "expo-speech-recognition",
      {
        microphonePermission:
          "Puente needs microphone access to listen for speech and translate it in real time.",
        speechRecognitionPermission:
          "Puente uses on-device speech recognition to detect what you say.",
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
