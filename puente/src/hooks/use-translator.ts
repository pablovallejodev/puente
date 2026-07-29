import { useCallback, useEffect, useRef, useState } from "react";

import { mapSpeechLocaleToFlores } from "@/constants/languages";
import {
  loadEngine,
  MAX_ENGINE_LOAD_ATTEMPTS,
  resetEngine,
  type NllbEngine,
} from "@/lib/nllb-engine";
import {
  LatestFirstPreserveScheduler,
  translationJobKey,
} from "@/lib/translation-scheduler";
import {
  isTranslatorError,
  type TranslatorErrorInfo,
  TranslatorError,
} from "@/lib/translator-errors";
import type { TranslationStatus } from "@/hooks/use-chat-messages";

const MAX_TRANSLATE_RETRIES = 1;

export type TranslatorStatus = "loading" | "ready" | "error";

export type TranslatorDiagnostics = TranslatorErrorInfo & {
  attempt?: number;
  elapsedMs?: number;
  messageId?: string;
};

export type TranslateRequest = {
  messageId: string;
  text: string;
  inputLocale: string;
  outputLanguage: string;
};

type TranslateJob = TranslateRequest & { id: string; key: string };

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
  messageId?: string,
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
      messageId,
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
    messageId,
  };
}

export function useTranslator(
  onTranslation: (
    messageId: string,
    translated: string,
    status: TranslationStatus,
  ) => void,
) {
  const [status, setStatus] = useState<TranslatorStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TranslatorDiagnostics | null>(
    null,
  );
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);

  const engineRef = useRef<NllbEngine | null>(null);
  const engineReadyRef = useRef(false);
  const loadAttemptsRef = useRef(0);
  const onTranslationRef = useRef(onTranslation);
  const mountedRef = useRef(true);
  const lastFailedJobRef = useRef<TranslateJob | null>(null);
  const schedulerRef = useRef<LatestFirstPreserveScheduler<TranslateJob> | null>(
    null,
  );

  onTranslationRef.current = onTranslation;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      schedulerRef.current?.clear();
    };
  }, []);

  const syncQueueUi = useCallback(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler || !mountedRef.current) return;
    setPendingCount(scheduler.pendingCount);
    setActiveMessageId(scheduler.activeJob?.id ?? null);
    setIsTranslating(scheduler.activeJob !== null);
  }, []);

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
      if (!mountedRef.current) return;
      engineRef.current = engine;
      engineReadyRef.current = true;
      setStatus("ready");
    } catch (err) {
      if (!mountedRef.current) return;
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
    void loadModel();
  }, [loadModel]);

  useEffect(() => {
    schedulerRef.current = new LatestFirstPreserveScheduler<TranslateJob>({
      onState: (job, state) => {
        if (!mountedRef.current) return;
        // Only status transitions — execute owns the translated text for done/error.
        if (state === "queued" || state === "translating") {
          onTranslationRef.current(job.id, "", state);
        }
        syncQueueUi();
      },
      execute: async (job, isCancelled) => {
        const engine = engineRef.current;
        if (!engine || !engineReadyRef.current) {
          if (!isCancelled()) {
            lastFailedJobRef.current = job;
            onTranslationRef.current(job.id, "", "error");
            if (mountedRef.current) {
              setError("Motor de traducción no listo");
              setDiagnostics({
                code: "ENGINE_LOAD_FAILED",
                stage: "asset.prepare",
                message: "Motor de traducción no listo",
                recoverable: true,
                messageId: job.id,
              });
            }
          }
          return false;
        }

        let srcLang: string;
        let tgtLang: string;
        try {
          srcLang = localeToFloresOrThrow(job.inputLocale, "input");
          tgtLang = localeToFloresOrThrow(job.outputLanguage, "output");
        } catch (err) {
          if (isCancelled()) return false;
          const diag = toDiagnostics(err, undefined, undefined, job.id);
          lastFailedJobRef.current = job;
          onTranslationRef.current(job.id, "", "error");
          if (mountedRef.current) {
            setDiagnostics(diag);
            setError(
              isTranslatorError(err) ? err.toDisplayString() : diag.message,
            );
          }
          return false;
        }

        if (srcLang === tgtLang) {
          if (isCancelled()) return false;
          onTranslationRef.current(job.id, job.text, "done");
          if (mountedRef.current) {
            setError(null);
            setDiagnostics(null);
            setStatus("ready");
          }
          return true;
        }

        const started = Date.now();
        const run = async (attempt: number): Promise<boolean> => {
          if (isCancelled()) return false;
          try {
            const result = await engine.translate(
              job.text,
              srcLang,
              tgtLang,
              { shouldCancel: isCancelled },
            );
            if (isCancelled() || result === null) return false;

            onTranslationRef.current(job.id, result, "done");
            if (mountedRef.current) {
              setError(null);
              setDiagnostics(null);
              setStatus("ready");
            }
            lastFailedJobRef.current = null;
            return true;
          } catch (err) {
            if (isCancelled()) return false;

            const diag = toDiagnostics(
              err,
              attempt,
              Date.now() - started,
              job.id,
            );
            if (
              isTranslatorError(err) &&
              err.recoverable &&
              attempt < MAX_TRANSLATE_RETRIES
            ) {
              return run(attempt + 1);
            }

            lastFailedJobRef.current = job;
            if (mountedRef.current) {
              setDiagnostics(diag);
              setError(
                isTranslatorError(err)
                  ? err.toDisplayString()
                  : `[TRANSLATE_FAILED] ${diag.message}`,
              );
              setStatus("ready");
            }
            onTranslationRef.current(job.id, "", "error");
            return false;
          }
        };

        return run(0);
      },
    });

    return () => {
      schedulerRef.current?.clear();
      schedulerRef.current = null;
    };
  }, [syncQueueUi]);

  const enqueueTranslation = useCallback((request: TranslateRequest) => {
    const trimmed = request.text.trim();
    if (!trimmed || !request.messageId) return;
    if (!request.inputLocale || !request.outputLanguage) return;

    const job: TranslateJob = {
      ...request,
      text: trimmed,
      id: request.messageId,
      key: translationJobKey(
        request.messageId,
        trimmed,
        request.inputLocale,
        request.outputLanguage,
      ),
    };

    schedulerRef.current?.enqueue(job);
    syncQueueUi();
  }, [syncQueueUi]);

  const retry = useCallback(() => {
    const canRetryEngine =
      diagnostics?.recoverable !== false &&
      loadAttemptsRef.current < MAX_ENGINE_LOAD_ATTEMPTS;

    if (status === "error" && canRetryEngine) {
      void loadModel(true);
      return;
    }

    const failed = lastFailedJobRef.current;
    if (failed && engineReadyRef.current) {
      setError(null);
      setDiagnostics(null);
      schedulerRef.current?.enqueue(failed);
      syncQueueUi();
    }
  }, [loadModel, status, diagnostics, syncQueueUi]);

  return {
    status,
    isTranslating,
    activeMessageId,
    pendingCount,
    error,
    diagnostics,
    ready: status === "ready" && engineReadyRef.current,
    enqueueTranslation,
    retry,
    canRetryLoad:
      diagnostics?.recoverable !== false &&
      loadAttemptsRef.current < MAX_ENGINE_LOAD_ATTEMPTS,
  };
}
