import { CursorAgentError } from "@cursor/sdk";
import type { RunResult } from "@cursor/sdk";

export const EXIT = {
  ok: 0,
  startup: 1,
  run: 2,
  usage: 64,
} as const;

export function handleStartupError(error: unknown): never {
  if (error instanceof CursorAgentError) {
    console.error(`Startup failed: ${error.message}`);
    console.error(`Retryable: ${error.isRetryable}`);
    process.exit(EXIT.startup);
  }

  if (error instanceof Error) {
    console.error(error.message);
    process.exit(EXIT.startup);
  }

  console.error(String(error));
  process.exit(EXIT.startup);
}

export function assertRunSucceeded(result: RunResult): void {
  if (result.status === "finished") {
    return;
  }

  console.error(`Run ${result.id} ended with status: ${result.status}`);
  if (result.result) {
    console.error(result.result);
  }
  process.exit(EXIT.run);
}
