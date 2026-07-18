import { useCallback, useEffect, useRef, useState } from "react";

import { mapSpeechLocaleToFlores } from "@/constants/languages";
import {
  loadEngine,
  MAX_ENGINE_LOAD_ATTEMPTS,
  resetEngine,
  type NllbEngine,
} from "@/lib/nllb-engine";
import {
  isTranslatorError,
  type TranslatorErrorInfo,
  TranslatorError,
} from "@/lib/translator-errors";

const DEBOUNCE_MS = 600;
const MAX_TRANSLATE_RETRIES = 1;

export type TranslatorStatus = "loading" | "ready" | "error";

export type TranslatorDiagnostics = TranslatorErrorInfo & {
  attempt?: number;
  elapsedMs?: number;
};

function localeToFloresOrThrow(
  locale: string,
  role: "input" | "output",
): string {
  const flores = mapSpeechLocaleToFlores(locale);
  if (!flores) {
    throw new TranslatorError({
      code: "LANGUAGE_UNSUPPORTED",
      stage: "tokenizer.load",
      message: `Locale no soportado (${role}): ${locale}`,
      recoverable: false,
      context: { locale, role },
    });
  }
  return flores;
}

function toDiagnostics(
  err: unknown,
  attempt?: number,
  elapsedMs?: number,
): TranslatorDiagnostics {
  if (isTranslatorError(err)) {
    return {
      code: err.code,
      stage: err.stage,
      message: err.message,
      recoverable: err.recoverable,
      context: err.context,
      attempt,
      elapsedMs,
    };
  }
  const message = err instanceof Error ? err.message : "Error desconocido";
  return {
    code: "TRANSLATE_FAILED",
    stage: "decode.run",
    message,
    recoverable: true,
    attempt,
    elapsedMs,
  };
}

export function useTranslator(
  transcript: string,
  inputLanguage: string = "en-US",
  outputLanguage: string = "es-ES",
) {
  const [translated, setTranslated] = useState("");
  const [status, setStatus] = useState<TranslatorStatus>("loading");
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TranslatorDiagnostics | null>(
    null,
  );

  const requestIdRef = useRef(0);
  const engineRef = useRef<NllbEngine | null>(null);
  const engineReadyRef = useRef(false);
  const lastTranslatedInputRef = useRef("");
  const [loadAttempts, setLoadAttempts] = useState(0);
  const translateRetriesRef = useRef(0);

  const loadModel = useCallback(async (forceRetry = false) => {
    setStatus("loading");
    setError(null);
    setDiagnostics(null);

    if (forceRetry) {
      resetEngine();
      setLoadAttempts(0);
    }

    try {
      const engine = await loadEngine(forceRetry);
      engineRef.current = engine;
      engineReadyRef.current = true;
      setStatus("ready");
    } catch (err) {
      engineReadyRef.current = false;
      engineRef.current = null;
      setLoadAttempts((n) => n + 1);
      const diag = toDiagnostics(err, loadAttempts + 1);
      setDiagnostics(diag);
      setError(
        isTranslatorError(err)
          ? err.toDisplayString()
          : `[ENGINE_LOAD_FAILED] ${diag.message}`,
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadModel().finally(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [loadModel]);

  useEffect(() => {
    if (!engineReadyRef.current || !engineRef.current) return;

    const trimmed = transcript.trim();
    if (!trimmed) {
      setTranslated("");
      lastTranslatedInputRef.current = "";
      return;
    }

    if (trimmed === lastTranslatedInputRef.current) {
      return;
    }

    const requestId = ++requestIdRef.current;
    let srcLang: string;
    let tgtLang: string;
    try {
      srcLang = localeToFloresOrThrow(inputLanguage, "input");
      tgtLang = localeToFloresOrThrow(outputLanguage, "output");
    } catch (err) {
      const diag = toDiagnostics(err);
      setDiagnostics(diag);
      setError(isTranslatorError(err) ? err.toDisplayString() : diag.message);
      setStatus("error");
      return;
    }

    const timer = setTimeout(async () => {
      if (requestIdRef.current !== requestId) return;

      const started = Date.now();
      setIsTranslating(true);
      setError(null);
      setDiagnostics(null);

      const run = async (attempt: number): Promise<void> => {
        try {
          const result = await engineRef.current!.translate(
            trimmed,
            srcLang,
            tgtLang,
          );
          if (requestIdRef.current !== requestId) return;

          setTranslated(result);
          lastTranslatedInputRef.current = trimmed;
          translateRetriesRef.current = 0;
          setStatus("ready");
        } catch (err) {
          if (requestIdRef.current !== requestId) return;

          const diag = toDiagnostics(err, attempt, Date.now() - started);
          setDiagnostics(diag);

          if (
            isTranslatorError(err) &&
            err.recoverable &&
            attempt < MAX_TRANSLATE_RETRIES
          ) {
            translateRetriesRef.current = attempt + 1;
            await run(attempt + 1);
            return;
          }

          setError(
            isTranslatorError(err)
              ? err.toDisplayString()
              : `[TRANSLATE_FAILED] ${diag.message}`,
          );
          setStatus("ready");
        }
      };

      await run(0);
      setIsTranslating(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [transcript, inputLanguage, outputLanguage]);

  const retry = useCallback(() => {
    const canRetryEngine =
      diagnostics?.recoverable !== false &&
      loadAttempts < MAX_ENGINE_LOAD_ATTEMPTS;
    if (status === "error" && canRetryEngine) {
      void loadModel(true);
      return;
    }
    if (engineReadyRef.current) {
      lastTranslatedInputRef.current = "";
      translateRetriesRef.current = 0;
      setError(null);
      setDiagnostics(null);
      setStatus("ready");
    }
  }, [loadModel, status, diagnostics, loadAttempts]);

  return {
    translated,
    status,
    isTranslating,
    error,
    diagnostics,
    ready: status === "ready" && engineReadyRef.current,
    retry,
    canRetryLoad:
      diagnostics?.recoverable !== false &&
      loadAttempts < MAX_ENGINE_LOAD_ATTEMPTS,
  };
}
