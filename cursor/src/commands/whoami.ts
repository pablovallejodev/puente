import { Cursor } from "@cursor/sdk";

import type { AppConfig } from "../config";
import { handleStartupError } from "../lib/errors";

export async function showIdentity(config: AppConfig): Promise<void> {
  try {
    const user = await Cursor.me({ apiKey: config.apiKey });

    console.log(`API key: ${user.apiKeyName}`);
    if (user.userEmail) {
      console.log(`Email: ${user.userEmail}`);
    }
    if (user.userFirstName || user.userLastName) {
      console.log(`Name: ${[user.userFirstName, user.userLastName].filter(Boolean).join(" ")}`);
    }
    if (user.userId !== undefined) {
      console.log(`User ID: ${user.userId}`);
    }
    console.log(`Created: ${user.createdAt}`);
  } catch (error) {
    handleStartupError(error);
  }
}
