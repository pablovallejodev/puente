import "dotenv/config";

import { loadConfig } from "./config";
import { runChat } from "./commands/chat";
import { listModels } from "./commands/models";
import { runPrompt } from "./commands/prompt";
import { showIdentity } from "./commands/whoami";
import { EXIT } from "./lib/errors";

const USAGE = `
Cursor SDK CLI

Usage:
  npm run dev -- prompt "<message>"   One-shot prompt (Agent.prompt)
  npm run dev -- chat [message]       Multi-turn session (Agent.create)
  npm run dev -- models               List available models
  npm run dev -- whoami               Show authenticated API key info

Environment:
  CURSOR_API_KEY     Required
  CURSOR_MODEL       Default: composer-2
  CURSOR_RUNTIME     local (default) | cloud
  CURSOR_CWD         Local agent working directory
  CLOUD_REPO_URL     Required when CURSOR_RUNTIME=cloud
`.trim();

type Command = "prompt" | "chat" | "models" | "whoami";

function parseCommand(argv: string[]): { command: Command; args: string[] } {
  const [command, ...args] = argv;

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(EXIT.ok);
  }

  const valid: Command[] = ["prompt", "chat", "models", "whoami"];
  if (!valid.includes(command as Command)) {
    console.error(`Unknown command: ${command}\n`);
    console.log(USAGE);
    process.exit(EXIT.usage);
  }

  if (command === "prompt" && args.length === 0) {
    console.error('Missing prompt message. Example: npm run dev -- prompt "Explain src/index.ts"\n');
    console.log(USAGE);
    process.exit(EXIT.usage);
  }

  return { command: command as Command, args };
}

async function main(): Promise<void> {
  const { command, args } = parseCommand(process.argv.slice(2));

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(EXIT.startup);
  }

  switch (command) {
    case "prompt":
      await runPrompt(config, args.join(" "));
      break;
    case "chat":
      await runChat(config, args.length > 0 ? args.join(" ") : undefined);
      break;
    case "models":
      await listModels(config);
      break;
    case "whoami":
      await showIdentity(config);
      break;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(EXIT.startup);
});
