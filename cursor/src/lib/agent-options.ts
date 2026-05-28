import type { AgentOptions } from "@cursor/sdk";

import type { AppConfig } from "../config";

export function buildAgentOptions(config: AppConfig): AgentOptions {
  const options: AgentOptions = {
    apiKey: config.apiKey,
    model: { id: config.model },
  };

  if (config.runtime === "local") {
    options.local = {
      cwd: config.localCwd,
      settingSources: [],
    };
    return options;
  }

  options.cloud = {
    repos: [{ url: config.cloudRepoUrl! }],
    skipReviewerRequest: true,
  };

  return options;
}
