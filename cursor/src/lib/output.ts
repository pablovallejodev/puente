import type { SDKMessage } from "@cursor/sdk";

export function writeAssistantText(message: SDKMessage): void {
  if (message.type !== "assistant") {
    return;
  }

  for (const block of message.message.content) {
    if (block.type === "text") {
      process.stdout.write(block.text);
    }
  }
}

export async function streamRun(
  run: { stream(): AsyncGenerator<SDKMessage, void>; wait(): Promise<unknown> },
): Promise<void> {
  for await (const event of run.stream()) {
    writeAssistantText(event);
  }
}
