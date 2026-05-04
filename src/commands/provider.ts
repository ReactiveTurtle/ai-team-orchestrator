import { loadConfig, saveSettings } from "../config.js";

export async function providerCommand(args: string[], rootDir = process.cwd()): Promise<void> {
  const [action, ...rest] = args;
  const config = await loadConfig(rootDir);

  if (!action || action === "get") {
    const command = config.settings.provider?.command;
    console.log(command ? `Provider command: ${command}` : "Provider command is not configured.");
    return;
  }

  if (action === "set") {
    const command = rest.join(" ").trim();
    if (!command) throw new Error("Usage: ai-team provider set <command>");
    const settings = {
      ...config.settings,
      provider: {
        ...config.settings.provider,
        command
      }
    };
    const path = await saveSettings(settings, rootDir);
    console.log(`Provider command saved: ${command}`);
    console.log(`Settings: ${path}`);
    return;
  }

  if (action === "clear") {
    const settings = {
      ...config.settings,
      provider: {
        ...config.settings.provider,
        command: undefined
      }
    };
    const path = await saveSettings(settings, rootDir);
    console.log("Provider command cleared.");
    console.log(`Settings: ${path}`);
    return;
  }

  throw new Error("Usage: ai-team provider [get|set|clear]");
}
