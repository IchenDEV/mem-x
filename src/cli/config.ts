import { Command } from "commander";
import { loadConfig, setConfigValue } from "../utils/config.js";

const setCmd = new Command("set")
  .argument("<key>", "Config key (e.g. embedding.apiKey)")
  .argument("<value>", "Config value")
  .action((key: string, value: string) => {
    setConfigValue(key, value);
    console.log(`Set ${key} = ${value}`);
  });

const showCmd = new Command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    const display = {
      ...config,
      embedding: {
        ...config.embedding,
        apiKey: config.embedding.apiKey
          ? `${config.embedding.apiKey.slice(0, 8)}...`
          : "(not set)",
      },
    };
    console.log(JSON.stringify(display, null, 2));
  });

export const configCommand = new Command("config")
  .description("Manage configuration")
  .addCommand(setCmd)
  .addCommand(showCmd);
