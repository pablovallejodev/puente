import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from "expo-audio";

import { acceptTranscript } from "@/lib/transcript-filter";
import {
  createSpeechDetector,
  SAMPLE_RATE as WHISPER_SAMPLE_RATE,
  SpeechSegmenter,
} from "@/lib/vad";
import { loadAsrEngine, type AsrEngine } from "@/lib/engines";
import { speechLocaleToWhisperLang } from "@/constants/whisper-languages";
import { EngineError, isEngineError } from "@/lib/engine-errors";
import { isWhisperError } from "@/lib/whisper-errors";

export type SpeechError = {
  code: string;
  message: string;
} | null;

export type SpeechInputMode =
  | { mode: "auto" }
  | { mode: "fixed"; locale: string };

/** Why a started chunk did not produce an accepted transcript. */
export type TranscriptionOutcome =
  | { type: "cancel" }
  | { type: "empty" }
  | { type: "error"; code: string; message: string };

export type SpeechTranscriptorOptions = {
  /** Ignored: Whisper is always on-device. Kept for API compatibility. */
  requiresOnDeviceRecognition?: boolean;
  /** Fired when Whisper starts processing a VAD chunk (before result). */
  onTranscriptionStart?: () => void;
  /**
   * Fired when a started chunk ends without an accepted transcript.
   * `cancel` = session/stop; `empty` = noSpeech/filter; `error` = engine throw.
   */
  onTranscriptionEnd?: (outcome: TranscriptionOutcome) => void;
  onInterimTranscript?: (
    text: string,
    isFinal: boolean,
    detectedLocale?: string,
  ) => void;
  enabled?: boolean;
};

const STICKY_TTL_MS = 45_000;
/** Ponytail: hard ceiling on queued PCM (~24s). Upgrade: age/priority drop policy. */
const MAX_BACKLOG_MS = 24_000;
const MAX_BACKLOG_SAMPLES = Math.floor(
  (WHISPER_SAMPLE_RATE * MAX_BACKLOG_MS) / 1000,
);

type QueuedChunk = {
  pcm: Float32Array;
  sessionId: number;
  seq: number;
};

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

function backlogSamples(queue: QueuedChunk[]): number {
  let total = 0;
  for (const c of queue) total += c.pcm.length;
  return total;
}

export function useSpeechTranscriptor(
  input: SpeechInputMode,
  options: SpeechTranscriptorOptions = {},
) {
  const {
    onTranscriptionStart,
    onTranscriptionEnd,
    onInterimTranscript,
    enabled = true,
  } = options;

  const modeKey = inputModeKey(input);

  const [hasPermissions, setHasPermissions] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [backlogDropped, setBacklogDropped] = useState(false);
  const [error, setError] = useState<SpeechError>(null);
  const [engineReady, setEngineReady] = useState(false);

  const isMountedRef = useRef(false);
  const permissionsGrantedRef = useRef(false);
  const inputRef = useRef(input);
  const onStartRef = useRef(onTranscriptionStart);
  const onEndRef = useRef(onTranscriptionEnd);
  const onInterimRef = useRef(onInterimTranscript);
  const engineRef = useRef<AsrEngine | null>(null);
  const segmenterRef = useRef<SpeechSegmenter | null>(null);
  const enabledRef = useRef(enabled);
  const prevModeKeyRef = useRef(modeKey);
  const stickyLangRef = useRef<{ language: string; at: number } | null>(null);
  const sessionIdRef = useRef(0);
  const seqRef = useRef(0);
  const queueRef = useRef<QueuedChunk[]>([]);
  const pumpingRef = useRef(false);
  const cancelActiveRef = useRef(false);
  const pumpQueueRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    inputRef.current = input;
    onStartRef.current = onTranscriptionStart;
    onEndRef.current = onTranscriptionEnd;
    onInterimRef.current = onInterimTranscript;
    enabledRef.current = enabled;
  }, [
    input,
    onTranscriptionStart,
    onTranscriptionEnd,
    onInterimTranscript,
    enabled,
  ]);

  const bumpSession = useCallback(() => {
    sessionIdRef.current += 1;
    cancelActiveRef.current = true;
    queueRef.current = [];
    seqRef.current = 0;
    stickyLangRef.current = null;
    segmenterRef.current?.reset();
    setBacklogDropped(false);
  }, []);

  const pumpQueue = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;

    try {
      while (queueRef.current.length > 0) {
        const engine = engineRef.current;
        if (!engine || !isMountedRef.current) break;

        const chunk = queueRef.current.shift()!;
        if (chunk.sessionId !== sessionIdRef.current) continue;
        if (!enabledRef.current) break;

        cancelActiveRef.current = false;
        setIsTranscribing(true);
        onStartRef.current?.();
        let acceptedThisChunk = false;
        let endOutcome: TranscriptionOutcome = { type: "empty" };

        try {
          const current = inputRef.current;
          if (
            engine.languageDetection === "none" &&
            current.mode === "auto"
          ) {
            // Transducers (Parakeet) never name the language. Running them in
            // Universal mode would produce text the translator cannot target.
            throw new EngineError({
              code: "ENGINE_NO_LANGUAGE_DETECTION",
              stage: "asr.language",
              message:
                "Este modelo no detecta el idioma. Fija el idioma de entrada o elige un modelo Whisper / SenseVoice.",
              recoverable: false,
              context: { modelId: engine.modelId },
            });
          }

          const sticky =
            current.mode === "auto" &&
            stickyLangRef.current &&
            Date.now() - stickyLangRef.current.at < STICKY_TTL_MS
              ? stickyLangRef.current.language
              : null;

          const result = await engine.transcribe(chunk.pcm, {
            language:
              current.mode === "auto"
                ? "auto"
                : speechLocaleToWhisperLang(current.locale),
            stickyLanguage: sticky,
            shouldCancel: () =>
              cancelActiveRef.current ||
              chunk.sessionId !== sessionIdRef.current ||
              !enabledRef.current,
          });

          if (
            !isMountedRef.current ||
            chunk.sessionId !== sessionIdRef.current ||
            !enabledRef.current
          ) {
            endOutcome = { type: "cancel" };
            continue;
          }

          if (result.noSpeech || !result.text.trim()) {
            endOutcome = { type: "empty" };
            continue;
          }

          const accepted = acceptTranscript(result.text);
          if (!accepted) {
            endOutcome = { type: "empty" };
            continue;
          }

          if (
            current.mode === "auto" &&
            !result.usedSticky &&
            !result.noSpeech
          ) {
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
              noSpeechProb: Number(result.noSpeechProb.toFixed(3)),
              textLen: accepted.length,
            });
          }

          acceptedThisChunk = true;
          setTranscript(accepted);
          onInterimRef.current?.(accepted, true, result.speechLocale || undefined);
          setTranscript("");
          setError(null);
        } catch (err) {
          if (
            !isMountedRef.current ||
            chunk.sessionId !== sessionIdRef.current
          ) {
            endOutcome = { type: "cancel" };
            continue;
          }
          if (isWhisperError(err) || isEngineError(err)) {
            setError({
              code: err.code,
              message: err.toDisplayString(),
            });
            endOutcome = {
              type: "error",
              code: err.code,
              message: err.toDisplayString(),
            };
          } else {
            const message = err instanceof Error ? err.message : String(err);
            setError({ code: "asr_failed", message });
            endOutcome = { type: "error", code: "asr_failed", message };
          }
        } finally {
          if (isMountedRef.current) {
            if (!acceptedThisChunk) onEndRef.current?.(endOutcome);
            setIsTranscribing(false);
          }
        }
      }
    } finally {
      pumpingRef.current = false;
      if (
        queueRef.current.length > 0 &&
        enabledRef.current &&
        isMountedRef.current
      ) {
        void pumpQueueRef.current();
      }
    }
  }, []);

  useEffect(() => {
    pumpQueueRef.current = pumpQueue;
  }, [pumpQueue]);

  const enqueueChunk = useCallback((pcm: Float32Array) => {
    if (!enabledRef.current || !isMountedRef.current) return;
    const sessionId = sessionIdRef.current;
    seqRef.current += 1;
    queueRef.current.push({ pcm, sessionId, seq: seqRef.current });

    while (
      backlogSamples(queueRef.current) > MAX_BACKLOG_SAMPLES &&
      queueRef.current.length > 1
    ) {
      queueRef.current.shift();
      setBacklogDropped(true);
    }

    void pumpQueueRef.current();
  }, []);

  // Detector selection is async (it may load the Silero graph), so audio that
  // arrives before it resolves is simply dropped: that is the first few hundred
  // milliseconds after mount, before anyone has started speaking.
  useEffect(() => {
    let cancelled = false;
    let segmenter: SpeechSegmenter | null = null;

    void (async () => {
      const detector = await createSpeechDetector();
      if (cancelled) {
        detector.dispose();
        return;
      }
      segmenter = new SpeechSegmenter(detector, {
        onSpeechChunk: enqueueChunk,
      });
      segmenterRef.current = segmenter;
      if (__DEV__) console.info("[vad] detector", detector.id);
    })();

    return () => {
      cancelled = true;
      segmenterRef.current = null;
      segmenter?.dispose();
    };
  }, [enqueueChunk]);

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (!enabledRef.current || !permissionsGrantedRef.current) return;
    const floatBuf = bufferToFloat32(buffer);
    const pcm = resampleTo16k(floatBuf, buffer.sampleRate);
    segmenterRef.current?.push(pcm);
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
    void segmenterRef.current?.flush();
    setIsListening(false);
  }, [stream]);

  const startListeningInternal = useCallback(async () => {
    if (!enabledRef.current || !permissionsGrantedRef.current) return;
    if (!engineRef.current) return;

    try {
      segmenterRef.current?.reset();
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
    bumpSession();
    stopListening();
    await new Promise((r) => setTimeout(r, 150));
    await startListeningInternal();
  }, [bumpSession, startListeningInternal, stopListening]);

  const requestPermissionsAndLoad = useCallback(async () => {
    try {
      // Fast resume: engine already warm (e.g. unmute). Avoid permission
      // flicker and "Cargando reconocimiento…" on every re-enable.
      if (permissionsGrantedRef.current && engineRef.current) {
        setCheckingPermissions(false);
        setEngineReady(true);
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });
        if (enabledRef.current) {
          await startListeningInternal();
        }
        return;
      }

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

      const engine = await loadAsrEngine();
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
      if (isWhisperError(err) || isEngineError(err)) {
        setError({
          code: err.code,
          message: err.toDisplayString(),
        });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setError({ code: "asr_load_failed", message });
      }
    }
  }, [startListeningInternal]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sessionIdRef.current += 1;
      cancelActiveRef.current = true;
      queueRef.current = [];
      try {
        stream.stop();
      } catch {
        /* ignore */
      }
      segmenterRef.current?.reset();
      void setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
    };
  }, [stream]);

  useEffect(() => {
    if (!enabled) {
      // Defer session reset: bumpSession setStates; sync call inside the
      // effect would cascade into the same commit under React Compiler.
      queueMicrotask(() => {
        bumpSession();
        stopListening();
      });
      void setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      return;
    }

    // Intentional mount/enable load: permissions + ASR engine. The lint rule
    // flags any setState reached from an effect; here it is the bootstrap path.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- engine bootstrap on enable
    void requestPermissionsAndLoad();
  }, [enabled, requestPermissionsAndLoad, stopListening, bumpSession]);

  useEffect(() => {
    if (!permissionsGrantedRef.current || !enabled || !engineReady) return;
    if (prevModeKeyRef.current === modeKey) return;
    prevModeKeyRef.current = modeKey;
    void restartListening();
  }, [modeKey, enabled, engineReady, restartListening]);

  useEffect(() => {
    if (isMountedRef.current) {
      setIsListening(isStreaming);
    }
  }, [isStreaming]);

  return {
    isListening,
    isTranscribing,
    backlogDropped,
    transcript,
    error,
    hasPermissions,
    checkingPermissions: checkingPermissions || (enabled && !engineReady),
    restartListening,
    stopListening,
  };
}
