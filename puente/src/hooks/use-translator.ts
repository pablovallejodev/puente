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
  inputLocale: string;
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
  inputLocale: string,
  outputLanguage: string,
  isFinal: boolean,
): string {
  return `${messageId}:${text.trim()}:${inputLocale}:${outputLanguage}:${isFinal ? "f" : "p"}`;
}

export function useTranslator(
  target: TranslationTarget | null,
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

  const engineRef = useRef<NllbEngine | null>(null);
  const engineReadyRef = useRef(false);
  const loadAttemptsRef = useRef(0);
  const onTranslationRef = useRef(onTranslation);
  /** Per-message generation — stale completions for older gens are discarded. */
  const messageGenRef = useRef<Map<string, number>>(new Map());
  /** Last completed key per messageId — avoids re-running identical work. */
  const lastKeyByMessageRef = useRef<Map<string, string>>(new Map());
  /** Only used to retry the engine-load case for the latest target. */
  const latestTargetRef = useRef<TranslationTarget | null>(null);

  onTranslationRef.current = onTranslation;

  const bumpGeneration = useCallback((messageId: string): number => {
    const next = (messageGenRef.current.get(messageId) ?? 0) + 1;
    messageGenRef.current.set(messageId, next);
    return next;
  }, []);

  const isCurrentGeneration = useCallback(
    (messageId: string, generation: number): boolean =>
      messageGenRef.current.get(messageId) === generation,
    [],
  );

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
    if (target?.messageId && target.text.trim()) {
      latestTargetRef.current = target;
    }
  }, [target]);

  useEffect(() => {
    if (!engineReadyRef.current || !engineRef.current) return;

    // Only translate the explicit current target — never a stale pending from
    // a previous message when languages/status change.
    const current = target;
    if (!current?.messageId) return;

    const trimmed = current.text.trim();
    if (!trimmed) return;

    const inputLocale = current.inputLocale;
    if (!inputLocale) return;

    const messageId = current.messageId;
    const key = translationKey(
      messageId,
      trimmed,
      inputLocale,
      outputLanguage,
      current.isFinal,
    );

    const lastKey = lastKeyByMessageRef.current.get(messageId);
    if (key === lastKey && retryToken === 0) return;

    const generation = bumpGeneration(messageId);
    lastKeyByMessageRef.current.set(messageId, key);
    onTranslationRef.current(messageId, "", true);

    let srcLang: string;
    let tgtLang: string;
    try {
      srcLang = localeToFloresOrThrow(inputLocale, "input");
      tgtLang = localeToFloresOrThrow(outputLanguage, "output");
    } catch (err) {
      if (!isCurrentGeneration(messageId, generation)) return;
      const diag = toDiagnostics(err);
      setDiagnostics(diag);
      setError(isTranslatorError(err) ? err.toDisplayString() : diag.message);
      setStatus("error");
      onTranslationRef.current(messageId, "", false);
      return;
    }

    if (srcLang === tgtLang) {
      onTranslationRef.current(messageId, trimmed, false);
      setError(null);
      setDiagnostics(null);
      setStatus("ready");
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        if (!isCurrentGeneration(messageId, generation)) return;

        const started = Date.now();
        onTranslationRef.current(messageId, "", true);

        const runTranslate = async (): Promise<void> => {
          if (!isCurrentGeneration(messageId, generation)) return;

          const run = async (attempt: number): Promise<void> => {
            try {
              const result = await engineRef.current!.translate(
                trimmed,
                srcLang,
                tgtLang,
              );
              if (!isCurrentGeneration(messageId, generation)) return;

              onTranslationRef.current(messageId, result, false);
              setError(null);
              setDiagnostics(null);
              setStatus("ready");
            } catch (err) {
              if (!isCurrentGeneration(messageId, generation)) return;

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
              onTranslationRef.current(messageId, "", false);
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
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    target,
    outputLanguage,
    status,
    retryToken,
    bumpGeneration,
    isCurrentGeneration,
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
      const latest = latestTargetRef.current;
      if (latest?.messageId) {
        lastKeyByMessageRef.current.delete(latest.messageId);
      }
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
