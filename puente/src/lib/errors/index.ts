/**
 * Entry point for error reporting across the app.
 *
 * `describeError()` turns any thrown value into the block we want in a bug
 * report: the machine-readable line plus the documented cause and fix.
 * `logDiagnostic()` prints it in development only.
 */

import {
  DiagnosticError,
  causeMessage,
  isDiagnosticError,
  type DiagnosticSnapshot,
} from "@/lib/errors/diagnostic";
import { describeCode } from "@/lib/errors/error-catalog";

export {
  DiagnosticError,
  causeMessage,
  isDiagnosticError,
  looksLikeDiskFull,
  looksLikeMissingNativeModule,
  looksLikeOutOfMemory,
  looksLikeReleasedSession,
} from "@/lib/errors/diagnostic";
export type {
  DiagnosticContext,
  DiagnosticDomain,
  DiagnosticInfo,
  DiagnosticSnapshot,
} from "@/lib/errors/diagnostic";
export {
  describeCode,
  documentedCodes,
  hasDoc,
  type ErrorDoc,
} from "@/lib/errors/error-catalog";

/** Machine-readable snapshot of any thrown value. */
export function toSnapshot(err: unknown): DiagnosticSnapshot {
  if (isDiagnosticError(err)) return err.toSnapshot();
  return {
    domain: "engine",
    code: "ENGINE_RUN_FAILED",
    stage: "engine.resolve",
    message: causeMessage(err),
    recoverable: true,
  };
}

/**
 * Human-readable report: the log line, then what it means and what to do.
 * Used by the dev logger and safe to paste verbatim into an issue.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof DiagnosticError)) {
    return `[unclassified] ${causeMessage(err)}`;
  }

  const doc = describeCode(err.domain, err.code);
  const lines = [err.toLogString()];
  if (doc) {
    lines.push(`  qué pasa : ${doc.summary}`);
    lines.push(`  por qué  : ${doc.cause}`);
    lines.push(`  qué hacer: ${doc.fix}`);
  } else {
    lines.push(`  (sin entrada en error-catalog.ts para ${err.domain}:${err.code})`);
  }
  lines.push(`  reintentable: ${err.recoverable ? "sí" : "no"}`);
  return lines.join("\n");
}

/** Development-only structured log. No-op in release builds. */
export function logDiagnostic(scope: string, err: unknown): void {
  if (!__DEV__) return;
  console.warn(`[${scope}]\n${describeError(err)}`);
}
