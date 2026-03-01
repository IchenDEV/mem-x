import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_cfg: unknown) {}
    embeddings = {
      create: vi.fn(async ({ input }: { input: string | string[] }) => {
        const texts = Array.isArray(input) ? input : [input];
        return {
          data: texts.map((_, i) => ({
            index: i,
            embedding: [0.1, 0.2, 0.3, 0.4],
          })),
        };
      }),
    };
  },
}));

const { mockConfig } = vi.hoisted(() => ({ mockConfig: vi.fn() }));
vi.mock("../src/utils/config.js", () => ({
  loadConfig: mockConfig,
  saveConfig: vi.fn(),
  setConfigValue: vi.fn(),
}));

import { createOpenAIProvider } from "../src/embedding/openai.js";
import { createOllamaProvider } from "../src/embedding/ollama.js";
import { getEmbeddingProvider, resetEmbeddingProvider } from "../src/embedding/factory.js";

describe("openai provider", () => {
  it("embed returns Float32Array", async () => {
    const p = createOpenAIProvider("key", "text-embedding-3-small", "http://localhost");
    const r = await p.embed("test");
    expect(r).toBeInstanceOf(Float32Array);
    expect(r.length).toBe(4);
  });

  it("embedBatch returns array", async () => {
    const p = createOpenAIProvider("key");
    const r = await p.embedBatch(["a", "b"]);
    expect(r.length).toBe(2);
    expect(r[0]).toBeInstanceOf(Float32Array);
  });

  it("embedBatch empty input returns empty", async () => {
    const p = createOpenAIProvider("key");
    expect(await p.embedBatch([])).toEqual([]);
  });

  it("dimensions from known model", () => {
    expect(createOpenAIProvider("key", "text-embedding-3-large").dimensions).toBe(3072);
  });

  it("dimensions defaults for unknown model", () => {
    expect(createOpenAIProvider("key", "custom").dimensions).toBe(1536);
  });
});

describe("ollama provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("embed calls API and returns Float32Array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
      })),
    );
    const p = createOllamaProvider("nomic-embed-text", "http://localhost:11434");
    const r = await p.embed("test");
    expect(r).toBeInstanceOf(Float32Array);
    expect(fetch).toHaveBeenCalled();
  });

  it("embedBatch empty returns empty", async () => {
    const p = createOllamaProvider();
    expect(await p.embedBatch([])).toEqual([]);
  });

  it("throws on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "fail" })),
    );
    const p = createOllamaProvider();
    await expect(p.embed("test")).rejects.toThrow("Ollama API error");
  });

  it("dimensions from known model", () => {
    expect(createOllamaProvider("nomic-embed-text").dimensions).toBe(768);
  });

  it("dimensions defaults for unknown model", () => {
    expect(createOllamaProvider("custom").dimensions).toBe(768);
  });
});

describe("factory", () => {
  beforeEach(() => {
    resetEmbeddingProvider();
    mockConfig.mockReturnValue({
      embedding: { provider: "openai" as const, model: "text-embedding-3-small", apiKey: "key" },
      db: { path: "test.db" },
    });
  });

  afterEach(() => resetEmbeddingProvider());

  it("creates openai provider", () => {
    expect(getEmbeddingProvider().dimensions).toBe(1536);
  });

  it("caches provider on second call", () => {
    expect(getEmbeddingProvider()).toBe(getEmbeddingProvider());
  });

  it("creates openai provider with baseUrl and no apiKey", () => {
    mockConfig.mockReturnValue({
      embedding: { provider: "openai" as const, model: "bge-m3", baseUrl: "http://localhost:1234/v1" },
      db: { path: "test.db" },
    });
    resetEmbeddingProvider();
    expect(getEmbeddingProvider().dimensions).toBe(1024);
  });

  it("throws when openai has no apiKey and no baseUrl", () => {
    mockConfig.mockReturnValue({
      embedding: { provider: "openai" as const, model: "test", apiKey: "" },
      db: { path: "test.db" },
    });
    resetEmbeddingProvider();
    expect(() => getEmbeddingProvider()).toThrow("API key not configured");
  });

  it("creates ollama provider", () => {
    mockConfig.mockReturnValue({
      embedding: { provider: "ollama" as const, model: "nomic-embed-text" },
      db: { path: "test.db" },
    });
    resetEmbeddingProvider();
    expect(getEmbeddingProvider().dimensions).toBe(768);
  });

  it("throws for unknown provider", () => {
    mockConfig.mockReturnValue({
      embedding: { provider: "unknown" as any, model: "test" },
      db: { path: "test.db" },
    });
    resetEmbeddingProvider();
    expect(() => getEmbeddingProvider()).toThrow("Unknown embedding provider");
  });

  it("resetEmbeddingProvider clears cache", () => {
    const p1 = getEmbeddingProvider();
    resetEmbeddingProvider();
    mockConfig.mockReturnValue({
      embedding: { provider: "openai" as const, model: "text-embedding-3-large", apiKey: "k" },
      db: { path: "test.db" },
    });
    const p2 = getEmbeddingProvider();
    expect(p2).not.toBe(p1);
    expect(p2.dimensions).toBe(3072);
  });
});
