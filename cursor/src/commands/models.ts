import { Cursor } from "@cursor/sdk";

import type { AppConfig } from "../config";
import { handleStartupError } from "../lib/errors";

export async function listModels(config: AppConfig): Promise<void> {
  try {
    const models = await Cursor.models.list({ apiKey: config.apiKey });

    if (models.length === 0) {
      console.log("No models available for this API key.");
      return;
    }

    for (const model of models) {
      const aliases = model.aliases?.length
        ? ` (aliases: ${model.aliases.join(", ")})`
        : "";
      console.log(`${model.id}${aliases}`);
      if (model.description) {
        console.log(`  ${model.description}`);
      }
    }
  } catch (error) {
    handleStartupError(error);
  }
}
