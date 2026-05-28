import { Agent } from "@cursor/sdk";

import type { AppConfig } from "../config";
import { buildAgentOptions } from "../lib/agent-options";
import { assertRunSucceeded, handleStartupError } from "../lib/errors";

export async function runPrompt(config: AppConfig, message: string): Promise<void> {
  try {
    const result = await Agent.prompt(message, buildAgentOptions(config));
    assertRunSucceeded(result);

    if (result.result) {
      console.log(result.result);
    }
  } catch (error) {
    handleStartupError(error);
  }
}
