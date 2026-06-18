import { useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { AudioModule, setAudioModeAsync } from "expo-audio";

export function useSpeechTranscriptor(inputLanguage: string) {
  const [hasPermissions, setHasPermissions] = useState<boolean>(false);
  const [checkingPermissions, setCheckingPermissions] = useState<boolean>(true);

  const [detectedLanguage, setDetectedLanguage] = useState<string>("");

  const [transcript, setTranscript] = useState<string>("");
  const [isListening, setIsListening] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<number>(0);

  const finalTranscriptRef = useRef<string>("");
  const isMountedRef = useRef<boolean>(true);

  useSpeechRecognitionEvent("start", async () => {
    if (!isMountedRef.current) return;
    setIsListening(true);
  });

  useSpeechRecognitionEvent("end", async () => {
    if (!isMountedRef.current) return;
    setIsListening(false);

    if (
      finalTranscriptRef.current &&
      finalTranscriptRef.current.trim() !== ""
    ) {
      const transcriptToSend = finalTranscriptRef.current.trim();
      finalTranscriptRef.current = "";
      //await handleSendMessage(transcriptToSend);
    }
  });

  useSpeechRecognitionEvent("result", async (event) => {
    if (!isMountedRef.current) return;

    if (event.results && event.results.length > 0) {
      const transcriptText = event.results
        .map((_result) => _result.transcript)
        .join(" ");
      const goodTranscript = `${transcriptText[0].toUpperCase()}${transcriptText.slice(1)}`;

      setTranscript(goodTranscript);

      if (event.isFinal && goodTranscript.trim() !== "")
        finalTranscriptRef.current = goodTranscript.trim();
    }
  });

  useSpeechRecognitionEvent("error", async (event) => {
    if (!isMountedRef.current) return;
    setIsListening(false);

    console.log("SPEECH ERROR", event.message, event.code, event.error);

    if (event.error !== "aborted" && event.error !== "no-speech") {
      setError(2);
      setTimeout(() => {
        if (isMountedRef.current) setError(0);
      }, 4500);
    }
  });

  const requestPermissions = async () => {
    try {
      setCheckingPermissions(true);

      const audioStatus = await AudioModule.requestRecordingPermissionsAsync();
      if (!audioStatus.granted) {
        //console.log('[Voice] Audio permissions denied');
        setHasPermissions(false);
        setCheckingPermissions(false);
        return;
      }

      const speechStatus =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!speechStatus.granted) {
        setHasPermissions(false);
        setCheckingPermissions(false);
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      if (!available) {
        setHasPermissions(false);
        setCheckingPermissions(false);
        return;
      }

      setHasPermissions(true);
      setCheckingPermissions(false);

      await startListening();
    } catch (e: any) {
      setHasPermissions(false);
      setCheckingPermissions(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    requestPermissions();

    return () => {
      isMountedRef.current = false;

      try {
        ExpoSpeechRecognitionModule.stop();
      } catch (e) {
        console.error("Error during cleanup:", e);
      }
    };
  }, []);

  useSpeechRecognitionEvent("languagedetection", (event) => {
    setDetectedLanguage(event.detectedLanguage);
  });

  const startListening = async () => {
    if (isListening) return console.log("Cannot start listening: busy");

    try {
      setTranscript("");
      finalTranscriptRef.current = "";

      console.log("STARTING LISTENING");

      ExpoSpeechRecognitionModule.start({
        lang: inputLanguage,
        maxAlternatives: 1,
        addsPunctuation: true,
        continuous: true,
        interimResults: true,
        requiresOnDeviceRecognition: false,
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      setIsListening(false);
      setError(2);
      setTimeout(() => {
        if (isMountedRef.current) setError(0);
      }, 4500);
    }
  };

  const stopListening = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    } catch (e: any) {
      console.error("Error stopping speech to text recognition:", e);
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => stopListening();
  }, []);

  return {
    isListening,
    transcript,
    detectedLanguage,
    error,
  };
}
