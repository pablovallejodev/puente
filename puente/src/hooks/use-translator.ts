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

export type TranslationTarget = {
  messageId: string;
  text: string;
  isFinal: boolean;
};

let finalTranslateChain: Promise<void> = Promise.resolve();

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

function translationKey(
  messageId: string,
  text: string,
  inputLanguage: string,
  outputLanguage: string,
  isFinal: boolean,
): string {
  return `${messageId}:${text.trim()}:${inputLanguage}:${outputLanguage}:${isFinal ? "f" : "p"}`;
}

export function useTranslator(
  target: TranslationTarget | null,
  inputLanguage: string,
  outputLanguage: string,
  onTranslation: (
    messageId: string,
    translated: string,
    isTranslating: boolean,
  ) => void,
) {
  const [status, setStatus] = useState<TranslatorStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TranslatorDiagnostics | null>(
    null,
  );
  const [retryToken, setRetryToken] = useState(0);

  const requestIdRef = useRef(0);
  const engineRef = useRef<NllbEngine | null>(null);
  const engineReadyRef = useRef(false);
  const lastKeyRef = useRef("");
  const loadAttemptsRef = useRef(0);
  const pendingTargetRef = useRef<TranslationTarget | null>(null);
  const onTranslationRef = useRef(onTranslation);

  onTranslationRef.current = onTranslation;

  const loadModel = useCallback(async (forceRetry = false) => {
    setStatus("loading");
    setError(null);
    setDiagnostics(null);

    if (forceRetry) {
      resetEngine();
      loadAttemptsRef.current = 0;
    }

    try {
      const engine = await loadEngine(forceRetry);
      engineRef.current = engine;
      engineReadyRef.current = true;
      setStatus("ready");
    } catch (err) {
      engineReadyRef.current = false;
      engineRef.current = null;
      loadAttemptsRef.current += 1;
      const diag = toDiagnostics(err, loadAttemptsRef.current);
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

    void loadModel().finally(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [loadModel]);

  useEffect(() => {
    if (!target?.messageId || !target.text.trim()) return;
    pendingTargetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (!engineReadyRef.current || !engineRef.current) return;

    const current = target ?? pendingTargetRef.current;
    if (!current?.messageId) return;

    const trimmed = current.text.trim();
    if (!trimmed) return;

    const key = translationKey(
      current.messageId,
      trimmed,
      inputLanguage,
      outputLanguage,
      current.isFinal,
    );

    if (key !== lastKeyRef.current) {
      lastKeyRef.current = key;
      onTranslationRef.current(current.messageId, "", true);
    } else if (retryToken === 0) {
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
      onTranslationRef.current(current.messageId, "", false);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        if (requestIdRef.current !== requestId) return;

        const started = Date.now();
        onTranslationRef.current(current.messageId, "", true);

        const runTranslate = async (): Promise<void> => {
          if (requestIdRef.current !== requestId) return;

          const run = async (attempt: number): Promise<void> => {
            try {
              const result = await engineRef.current!.translate(
                trimmed,
                srcLang,
                tgtLang,
              );
              if (requestIdRef.current !== requestId) return;

              lastKeyRef.current = key;
              onTranslationRef.current(current.messageId, result, false);
              setError(null);
              setDiagnostics(null);
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
                await run(attempt + 1);
                return;
              }

              setError(
                isTranslatorError(err)
                  ? err.toDisplayString()
                  : `[TRANSLATE_FAILED] ${diag.message}`,
              );
              onTranslationRef.current(current.messageId, "", false);
              setStatus("ready");
            }
          };

          await run(0);
        };

        if (current.isFinal) {
          finalTranslateChain = finalTranslateChain
            .then(runTranslate)
            .catch(() => undefined);
          await finalTranslateChain;
        } else {
          await runTranslate();
        }

        if (requestIdRef.current === requestId) {
          // noop — isTranslating cleared in onTranslation callback
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    target,
    inputLanguage,
    outputLanguage,
    status,
    retryToken,
  ]);

  const retry = useCallback(() => {
    const canRetryEngine =
      diagnostics?.recoverable !== false &&
      loadAttemptsRef.current < MAX_ENGINE_LOAD_ATTEMPTS;

    if (status === "error" && canRetryEngine) {
      void loadModel(true);
      return;
    }

    if (engineReadyRef.current) {
      lastKeyRef.current = "";
      setError(null);
      setDiagnostics(null);
      setStatus("ready");
      setRetryToken((n) => n + 1);
    }
  }, [loadModel, status, diagnostics]);

  return {
    status,
    isTranslating: false,
    error,
    diagnostics,
    ready: status === "ready" && engineReadyRef.current,
    retry,
    canRetryLoad:
      diagnostics?.recoverable !== false &&
      loadAttemptsRef.current < MAX_ENGINE_LOAD_ATTEMPTS,
  };
}
