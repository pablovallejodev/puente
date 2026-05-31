import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Puente",
  slug: "puente",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "puente",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/icon-transparent.png",
    resizeMode: "cover",
    backgroundColor: "#24998B",
  },
  ios: {
    icon: "./assets/expo.icon",
    infoPlist: {
      NSMicrophoneUsageDescription:
        "Puente needs microphone access to listen for speech and translate it in real time.",
      NSSpeechRecognitionUsageDescription:
        "Puente uses on-device speech recognition to detect what you say.",
    },
    bundleIdentifier: "com.bubblesit.puente",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#E6F4FE",
    },
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.INTERNET",
    ],
    predictiveBackGestureEnabled: false,
    package: "com.bubblesit.puente",
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
          image: "./assets/images/splash-icon.png",
          imageWidth: 76,
        },
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
