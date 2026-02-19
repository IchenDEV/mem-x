import OpenAI from "openai";
import type { EmbeddingProvider } from "./provider.js";

const DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  "bge-m3": 1024,
  "BAAI/bge-m3": 1024,
  "text-embedding-bge-m3": 1024,
};

export function createOpenAIProvider(
  apiKey: string,
  model = "text-embedding-3-small",
  baseUrl?: string,
): EmbeddingProvider {
  const client = new OpenAI({
    apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });

  const dimensions = DIMENSIONS[model] ?? 1536;

  return {
    dimensions,

    async embed(text: string): Promise<Float32Array> {
      const res = await client.embeddings.create({
        model,
        input: text,
        encoding_format: "float",
      });
      return new Float32Array(res.data[0].embedding as number[]);
    },

    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const res = await client.embeddings.create({
        model,
        input: texts,
        encoding_format: "float",
      });
      return res.data
        .sort((a, b) => a.index - b.index)
        .map((d) => new Float32Array(d.embedding as number[]));
    },
  };
}
