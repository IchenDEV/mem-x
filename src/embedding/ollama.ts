import type { EmbeddingProvider } from "./provider.js";

const DIMENSIONS: Record<string, number> = {
  "nomic-embed-text": 768,
  "all-minilm": 384,
  "mxbai-embed-large": 1024,
};

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export function createOllamaProvider(
  model = "nomic-embed-text",
  baseUrl = "http://localhost:11434",
): EmbeddingProvider {
  const dimensions = DIMENSIONS[model] ?? 768;

  async function callOllama(texts: string[]): Promise<Float32Array[]> {
    const res = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as OllamaEmbedResponse;
    return data.embeddings.map((e) => new Float32Array(e));
  }

  return {
    dimensions,

    async embed(text: string): Promise<Float32Array> {
      const result = await callOllama([text]);
      return result[0];
    },

    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      return callOllama(texts);
    },
  };
}
