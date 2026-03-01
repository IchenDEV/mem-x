import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

export interface MemXConfig {
  embedding: {
    provider: "openai" | "ollama";
    model: string;
    apiKey?: string;
    baseUrl?: string;
  };
}

const DEFAULT_CONFIG: MemXConfig = {
  embedding: {
    provider: "openai",
    model: "text-embedding-3-small",
    apiKey: "",
  },
};

function getMemXHome(): string {
  return resolve(homedir(), ".mem-x");
}

function getConfigPath(): string {
  return resolve(getMemXHome(), "config.json");
}

export function loadConfig(): MemXConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };

  const raw = readFileSync(configPath, "utf-8");
  return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
}

export function saveConfig(config: MemXConfig): void {
  const dir = getMemXHome();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n");
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obj: any = config;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]];
    if (obj === undefined) throw new Error(`Invalid config key: ${key}`);
  }
  obj[parts[parts.length - 1]] = value;
  saveConfig(config);
}
