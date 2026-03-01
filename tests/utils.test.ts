import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { generateId } from "../src/utils/id.js";
import { loadConfig, saveConfig, setConfigValue } from "../src/utils/config.js";
import { getBucket, setBucket, getBucketDataDir } from "../src/utils/bucket.js";

vi.mock("node:os", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:os")>();
  return { ...orig, homedir: vi.fn(orig.homedir) };
});

describe("generateId", () => {
  it("returns a valid UUID v4", () => {
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("config", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "mem-x-cfg-"));
    vi.mocked(homedir).mockReturnValue(testDir);
  });

  afterEach(() => {
    vi.mocked(homedir).mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("loadConfig returns defaults when no file exists", () => {
    const cfg = loadConfig();
    expect(cfg.embedding.provider).toBe("openai");
    expect(cfg.embedding.model).toBe("text-embedding-3-small");
  });

  it("saveConfig + loadConfig roundtrip", () => {
    const cfg = loadConfig();
    cfg.embedding.model = "custom-model";
    saveConfig(cfg);
    expect(loadConfig().embedding.model).toBe("custom-model");
  });

  it("setConfigValue with dot notation", () => {
    setConfigValue("embedding.model", "new-model");
    expect(loadConfig().embedding.model).toBe("new-model");
  });

  it("setConfigValue throws for invalid key path", () => {
    expect(() => setConfigValue("nonexistent.deep.key", "val")).toThrow(
      "Invalid config key",
    );
  });
});

describe("bucket", () => {
  const origBucket = getBucket();

  afterEach(() => setBucket(origBucket));

  it("default bucket is 'default'", () => {
    setBucket("default");
    expect(getBucket()).toBe("default");
  });

  it("setBucket changes current bucket", () => {
    setBucket("agent-a");
    expect(getBucket()).toBe("agent-a");
  });

  it("getBucketDataDir returns path under home directory", () => {
    setBucket("my-agent");
    const dir = getBucketDataDir();
    expect(dir).toBe(resolve(homedir(), ".mem-x", "my-agent"));
  });
});
