export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export const MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  "nomic-embed-text": 768,
  "all-minilm": 384,
  "mxbai-embed-large": 1024,
  "bge-m3": 1024,
  "BAAI/bge-m3": 1024,
  "text-embedding-bge-m3": 1024,
};

export const DEFAULT_DIMENSIONS = 1536;
