import type { EmbeddingProvider } from "./provider.js";
import { createOpenAIProvider } from "./openai.js";
import { createOllamaProvider } from "./ollama.js";
import { loadConfig } from "../utils/config.js";

let _provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (_provider) return _provider;

  const config = loadConfig();
  const { provider, model, apiKey, baseUrl } = config.embedding;

  switch (provider) {
    case "openai": {
      if (!apiKey && !baseUrl) {
        throw new Error(
          "OpenAI API key not configured. Run: mem-x config set embedding.apiKey <key>",
        );
      }
      _provider = createOpenAIProvider(apiKey || "lm-studio", model, baseUrl);
      break;
    }
    case "ollama": {
      _provider = createOllamaProvider(model, baseUrl ?? "http://localhost:11434");
      break;
    }
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }

  return _provider;
}

export function resetEmbeddingProvider(): void {
  _provider = null;
}
