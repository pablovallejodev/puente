import { Agent, CursorAgentError } from "@cursor/sdk";
import readline from "node:readline/promises";

import type { AppConfig } from "../config";
import { buildAgentOptions } from "../lib/agent-options";
import { EXIT, assertRunSucceeded, handleStartupError } from "../lib/errors";
import { streamRun } from "../lib/output";

export async function runChat(config: AppConfig, initialPrompt?: string): Promise<void> {
  let agent: Awaited<ReturnType<typeof Agent.create>> | undefined;

  try {
    agent = await Agent.create(buildAgentOptions(config));
  } catch (error) {
    handleStartupError(error);
  }

  try {
    if (initialPrompt) {
      await sendMessage(agent, initialPrompt);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("Chat started. Type a message or /exit to quit.\n");

    try {
      while (true) {
        const input = (await rl.question("> ")).trim();
        if (!input) {
          continue;
        }
        if (input === "/exit") {
          break;
        }
        await sendMessage(agent, input);
        console.log();
      }
    } finally {
      rl.close();
    }
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

async function sendMessage(
  agent: Awaited<ReturnType<typeof Agent.create>>,
  message: string,
): Promise<void> {
  try {
    const run = await agent.send(message);
    console.error(`[agent=${agent.agentId} run=${run.id}]`);

    await streamRun(run);
    const result = await run.wait();
    assertRunSucceeded(result);
  } catch (error) {
    if (error instanceof CursorAgentError) {
      console.error(`\nStartup failed: ${error.message}`);
      process.exit(EXIT.startup);
    }
    throw error;
  }
}
