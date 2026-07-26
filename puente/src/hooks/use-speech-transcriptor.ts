import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from "expo-audio";

import {
  WHISPER_SAMPLE_RATE,
  WhisperAudioEndpoint,
} from "@/lib/whisper-audio-endpoint";
import {
  loadWhisperEngine,
  type WhisperEngine,
} from "@/lib/whisper-engine";
import { isWhisperError } from "@/lib/whisper-errors";

export type SpeechError = {
  code: string;
  message: string;
} | null;

export type SpeechInputMode =
  | { mode: "auto" }
  | { mode: "fixed"; locale: string };

export type SpeechTranscriptorOptions = {
  /** Ignored: Whisper is always on-device. Kept for API compatibility. */
  requiresOnDeviceRecognition?: boolean;
  onInterimTranscript?: (
    text: string,
    isFinal: boolean,
    detectedLocale?: string,
  ) => void;
  enabled?: boolean;
};

const STICKY_TTL_MS = 45_000;

function bufferToFloat32(buffer: AudioStreamBuffer): Float32Array {
  if (buffer.channels !== 1) {
    const view = new Float32Array(buffer.data);
    const frames = Math.floor(view.length / buffer.channels);
    const mono = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < buffer.channels; c++) {
        sum += view[i * buffer.channels + c];
      }
      mono[i] = sum / buffer.channels;
    }
    return mono;
  }
  return new Float32Array(buffer.data);
}

function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === WHISPER_SAMPLE_RATE) return input;
  if (inputRate <= 0 || input.length === 0) return input;
  const outLen = Math.max(
    1,
    Math.floor((input.length * WHISPER_SAMPLE_RATE) / inputRate),
  );
  const out = new Float32Array(outLen);
  const ratio = inputRate / WHISPER_SAMPLE_RATE;
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

function inputModeKey(input: SpeechInputMode): string {
  return input.mode === "auto" ? "auto" : `fixed:${input.locale}`;
}

export function useSpeechTranscriptor(
  input: SpeechInputMode,
  options: SpeechTranscriptorOptions = {},
) {
  const { onInterimTranscript, enabled = true } = options;

  const modeKey = inputModeKey(input);

  const [hasPermissions, setHasPermissions] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<SpeechError>(null);
  const [engineReady, setEngineReady] = useState(false);

  const isMountedRef = useRef(true);
  const permissionsGrantedRef = useRef(false);
  const inputRef = useRef(input);
  const onInterimRef = useRef(onInterimTranscript);
  const engineRef = useRef<WhisperEngine | null>(null);
  const endpointRef = useRef<WhisperAudioEndpoint | null>(null);
  const chunkHandlerRef = useRef<(pcm: Float32Array) => void>(() => {});
  const transcribingRef = useRef(false);
  const enabledRef = useRef(enabled);
  const prevModeKeyRef = useRef(modeKey);
  const stickyLangRef = useRef<{ language: string; at: number } | null>(null);

  inputRef.current = input;
  onInterimRef.current = onInterimTranscript;
  enabledRef.current = enabled;

  useEffect(() => {
    endpointRef.current = new WhisperAudioEndpoint({
      onSpeechChunk: (pcm) => {
        chunkHandlerRef.current(pcm);
      },
    });
    return () => {
      endpointRef.current?.reset();
      endpointRef.current = null;
    };
  }, []);

  chunkHandlerRef.current = (pcm: Float32Array) => {
    void (async () => {
      const engine = engineRef.current;
      if (!engine || !isMountedRef.current || !enabledRef.current) return;
      if (transcribingRef.current) return;

      transcribingRef.current = true;
      endpointRef.current?.setBusy(true);
      try {
        const current = inputRef.current;
        const sticky =
          current.mode === "auto" &&
          stickyLangRef.current &&
          Date.now() - stickyLangRef.current.at < STICKY_TTL_MS
            ? stickyLangRef.current.language
            : null;

        const result = await engine.transcribe(
          pcm,
          current.mode === "auto" ? "auto" : current.locale,
          { stickyLanguage: sticky },
        );

        if (!isMountedRef.current || !result.text.trim()) return;

        if (current.mode === "auto" && !result.usedSticky) {
          stickyLangRef.current = {
            language: result.language,
            at: Date.now(),
          };
        }

        if (__DEV__) {
          console.info("[stt] detect", {
            language: result.language,
            prob: Number(result.languageProb.toFixed(3)),
            sticky: result.usedSticky,
            locale: result.speechLocale,
            textLen: result.text.length,
          });
        }

        setTranscript(result.text);
        onInterimRef.current?.(result.text, true, result.speechLocale);
        setTranscript("");
        setError(null);
      } catch (err) {
        if (!isMountedRef.current) return;
        if (isWhisperError(err)) {
          setError({
            code: err.code,
            message: err.toDisplayString(),
          });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          setError({ code: "whisper_failed", message });
        }
      } finally {
        transcribingRef.current = false;
        endpointRef.current?.setBusy(false);
      }
    })();
  };

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (!enabledRef.current || !permissionsGrantedRef.current) return;
    const floatBuf = bufferToFloat32(buffer);
    const pcm = resampleTo16k(floatBuf, buffer.sampleRate);
    endpointRef.current?.push(pcm);
  }, []);

  const { stream, isStreaming } = useAudioStream({
    sampleRate: WHISPER_SAMPLE_RATE,
    channels: 1,
    encoding: "float32",
    onBuffer,
  });

  const stopListening = useCallback(() => {
    try {
      stream.stop();
    } catch {
      /* ignore */
    }
    endpointRef.current?.flush();
    setIsListening(false);
  }, [stream]);

  const startListeningInternal = useCallback(async () => {
    if (!enabledRef.current || !permissionsGrantedRef.current) return;
    if (!engineRef.current) return;

    try {
      endpointRef.current?.reset();
      await stream.start();
      setIsListening(true);
      setError(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      setIsListening(false);
      const message = err instanceof Error ? err.message : String(err);
      setError({ code: "start_failed", message });
    }
  }, [stream]);

  const restartListening = useCallback(async () => {
    stopListening();
    await new Promise((r) => setTimeout(r, 150));
    await startListeningInternal();
  }, [startListeningInternal, stopListening]);

  const requestPermissionsAndLoad = useCallback(async () => {
    try {
      setCheckingPermissions(true);

      const mic = await requestRecordingPermissionsAsync();
      if (!mic.granted) {
        setHasPermissions(false);
        permissionsGrantedRef.current = false;
        setCheckingPermissions(false);
        setError({
          code: "permission_denied",
          message: "Se necesita permiso de micrófono",
        });
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      setHasPermissions(true);
      permissionsGrantedRef.current = true;

      const engine = await loadWhisperEngine();
      if (!isMountedRef.current) return;
      engineRef.current = engine;
      setEngineReady(true);
      setCheckingPermissions(false);

      if (enabledRef.current) {
        await startListeningInternal();
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setHasPermissions(false);
      permissionsGrantedRef.current = false;
      setEngineReady(false);
      setCheckingPermissions(false);
      if (isWhisperError(err)) {
        setError({
          code: err.code,
          message: err.toDisplayString(),
        });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setError({ code: "whisper_load_failed", message });
      }
    }
  }, [startListeningInternal]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      stopListening();
      void setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      return () => {
        isMountedRef.current = false;
      };
    }

    void requestPermissionsAndLoad();

    return () => {
      isMountedRef.current = false;
      stopListening();
      void setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
    };
  }, [enabled, requestPermissionsAndLoad, stopListening]);

  useEffect(() => {
    if (!permissionsGrantedRef.current || !enabled || !engineReady) return;
    if (prevModeKeyRef.current === modeKey) return;
    prevModeKeyRef.current = modeKey;
    stickyLangRef.current = null;
    void restartListening();
  }, [modeKey, enabled, engineReady, restartListening]);

  useEffect(() => {
    if (isMountedRef.current) {
      setIsListening(isStreaming);
    }
  }, [isStreaming]);

  return {
    isListening,
    transcript,
    error,
    hasPermissions,
    checkingPermissions: checkingPermissions || (enabled && !engineReady),
    restartListening,
    stopListening,
  };
}
