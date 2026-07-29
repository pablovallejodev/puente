import { useCallback, useEffect, useRef, useState } from "react";

import {
  isSameLanguage,
  loadMtEngine,
  MAX_ENGINE_LOAD_ATTEMPTS,
  resetMtEngine,
  type MtEngine,
} from "@/lib/engines";
import {
  LatestFirstPreserveScheduler,
  translationJobKey,
} from "@/lib/translation-scheduler";
import { isEngineError } from "@/lib/engine-errors";
import { lookupPhrase } from "@/lib/mt/phrase-lookup";
import {
  isTranslatorError,
  type TranslatorErrorInfo,
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
  if (isEngineError(err)) {
    return {
      code: "TRANSLATE_FAILED",
      stage: "decode.run",
      message: err.toDisplayString(),
      recoverable: err.recoverable,
      context: { engineCode: err.code, ...err.context },
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

function formatLoadError(err: unknown, diag: TranslatorDiagnostics): string {
  if (isTranslatorError(err)) return err.toDisplayString();
  if (isEngineError(err)) return err.toDisplayString();
  return `[ENGINE_LOAD_FAILED] ${diag.message}`;
}

function formatTranslateError(err: unknown, diag: TranslatorDiagnostics): string {
  if (isTranslatorError(err)) return err.toDisplayString();
  if (isEngineError(err)) return err.toDisplayString();
  return `[TRANSLATE_FAILED] ${diag.message}`;
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
  const [loadAttempts, setLoadAttempts] = useState(0);

  const engineRef = useRef<MtEngine | null>(null);
  const engineReadyRef = useRef(false);
  const onTranslationRef = useRef(onTranslation);
  const mountedRef = useRef(true);
  const lastFailedJobRef = useRef<TranslateJob | null>(null);
  const schedulerRef = useRef<LatestFirstPreserveScheduler<TranslateJob> | null>(
    null,
  );

  useEffect(() => {
    onTranslationRef.current = onTranslation;
  }, [onTranslation]);

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
      resetMtEngine();
      setLoadAttempts(0);
    }

    try {
      const engine = await loadMtEngine(forceRetry);
      if (!mountedRef.current) return;
      engineRef.current = engine;
      engineReadyRef.current = true;
      setStatus("ready");
    } catch (err) {
      if (!mountedRef.current) return;
      engineReadyRef.current = false;
      engineRef.current = null;
      setLoadAttempts((n) => n + 1);
      const diag = toDiagnostics(err);
      setDiagnostics(diag);
      setError(formatLoadError(err, diag));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // Defer so the effect does not cascade setState into the same commit
    // (React Compiler rule). Loading still starts on the next microtask.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadModel();
    });
    return () => {
      cancelled = true;
    };
  }, [loadModel]);

  useEffect(() => {
    schedulerRef.current = new LatestFirstPreserveScheduler<TranslateJob>({
      onState: (job, state) => {
        if (!mountedRef.current) return;
        // Status only — execute owns translated text for done/error.
        // Passing "" here must not wipe a finished translation (see onTranslationUpdate).
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

        // Same language in and out: the engine would paraphrase rather than
        // translate, so hand the text back untouched.
        if (isSameLanguage(job.inputLocale, job.outputLanguage)) {
          if (isCancelled()) return false;
          onTranslationRef.current(job.id, job.text, "done");
          if (mountedRef.current) {
            setError(null);
            setDiagnostics(null);
            setStatus("ready");
          }
          return true;
        }

        // Short greetings and courtesy phrases: NLLB invents context for these.
        // A human table is cheaper and more accurate than any model here.
        const phraseHit = lookupPhrase(
          job.text,
          job.inputLocale,
          job.outputLanguage,
        );
        if (phraseHit !== null) {
          if (isCancelled()) return false;
          onTranslationRef.current(job.id, phraseHit, "done");
          if (mountedRef.current) {
            setError(null);
            setDiagnostics(null);
            setStatus("ready");
          }
          lastFailedJobRef.current = null;
          return true;
        }

        if (
          !engine.supportsLocale(job.inputLocale) ||
          !engine.supportsLocale(job.outputLanguage)
        ) {
          if (isCancelled()) return false;
          lastFailedJobRef.current = job;
          const unsupported =
            !engine.supportsLocale(job.inputLocale)
              ? job.inputLocale
              : job.outputLanguage;
          if (mountedRef.current) {
            setDiagnostics({
              code: "LANGUAGE_UNSUPPORTED",
              stage: "tokenizer.load",
              message: `El modelo activo no admite este idioma: ${unsupported}`,
              recoverable: false,
              messageId: job.id,
              context: { locale: unsupported, modelId: engine.modelId },
            });
            setError(
              `El modelo activo no admite este idioma: ${unsupported}`,
            );
            setStatus("ready");
          }
          onTranslationRef.current(job.id, "", "error");
          return false;
        }

        const started = Date.now();
        const run = async (attempt: number): Promise<boolean> => {
          if (isCancelled()) return false;
          try {
            const result = await engine.translate(
              job.text,
              job.inputLocale,
              job.outputLanguage,
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
            const recoverable =
              (isTranslatorError(err) || isEngineError(err)) &&
              err.recoverable &&
              attempt < MAX_TRANSLATE_RETRIES;
            if (recoverable) {
              return run(attempt + 1);
            }

            lastFailedJobRef.current = job;
            if (mountedRef.current) {
              setDiagnostics(diag);
              setError(formatTranslateError(err, diag));
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
      loadAttempts < MAX_ENGINE_LOAD_ATTEMPTS;

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
  }, [loadModel, status, diagnostics, syncQueueUi, loadAttempts]);

  return {
    status,
    isTranslating,
    activeMessageId,
    pendingCount,
    error,
    diagnostics,
    ready: status === "ready",
    enqueueTranslation,
    retry,
    canRetryLoad:
      diagnostics?.recoverable !== false &&
      loadAttempts < MAX_ENGINE_LOAD_ATTEMPTS,
  };
}
