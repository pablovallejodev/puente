import { useEffect, useRef } from 'react';
import {
  BackHandler,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useKeepAwake } from 'expo-keep-awake';
import { ChatHeadComponent } from '../basics/headers';
import { StatusBarHiddenComponent } from '@/utils/statusbar';
import { useSpeechTranscriptor } from '@/hooks/use-speech-transcriptor';

export default function ChatComponent() {
  useKeepAwake();
  const {
    transcript,
    detectedLanguage,
  } = useSpeechTranscriptor();

  const router = useRouter();
  const listRef = useRef<FlatList>(null);

  let backPressEvent = false;

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (backPressEvent) BackHandler.exitApp();

      backPressEvent = true;
      setTimeout(() => {
        backPressEvent = false;
      }, 800);

      return true;
    });

    return () => backHandler.remove();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBarHiddenComponent />
      <ChatHeadComponent
        titleText={`Real time chat translation`}
      />
      <Text style={styles.languageText}>
        {detectedLanguage}
      </Text>
      <Text style={styles.transcriptedText}>
        {transcript}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  languageText: {
    fontFamily: "Mulish_800ExtraBold",
    fontSize: 12,
    color: "black",
    alignSelf: "center",
    textAlign: "center",
  },
  transcriptedText: {
    fontFamily: "Mulish_500Medium",
    fontSize: 16,
    color: "black",
    alignSelf: "center",
    textAlign: "center",
  },
});
