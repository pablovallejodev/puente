import path from "node:path";

export type Runtime = "local" | "cloud";

export interface AppConfig {
  apiKey: string;
  model: string;
  runtime: Runtime;
  localCwd: string;
  cloudRepoUrl?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseRuntime(value: string | undefined): Runtime {
  if (!value || value === "local") {
    return "local";
  }
  if (value === "cloud") {
    return "cloud";
  }
  throw new Error(`Invalid CURSOR_RUNTIME "${value}". Expected "local" or "cloud".`);
}

export function loadConfig(): AppConfig {
  const runtime = parseRuntime(process.env.CURSOR_RUNTIME);
  const localCwd = path.resolve(
    process.env.CURSOR_CWD ?? path.join(__dirname, "..", ".."),
  );

  const config: AppConfig = {
    apiKey: requireEnv("CURSOR_API_KEY"),
    model: process.env.CURSOR_MODEL?.trim() || "composer-2",
    runtime,
    localCwd,
  };

  if (runtime === "cloud") {
    const cloudRepoUrl = process.env.CLOUD_REPO_URL?.trim();
    if (!cloudRepoUrl) {
      throw new Error(
        "CLOUD_REPO_URL is required when CURSOR_RUNTIME=cloud.",
      );
    }
    config.cloudRepoUrl = cloudRepoUrl;
  }

  return config;
}
