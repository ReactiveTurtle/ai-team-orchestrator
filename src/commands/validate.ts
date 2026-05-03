import { loadConfig, validateConfig } from "../config.js";

export async function validateCommand(rootDir = process.cwd()): Promise<void> {
  const config = await loadConfig(rootDir);
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error("Configuration is invalid:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("Configuration is valid.");
}
