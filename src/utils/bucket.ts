import { resolve } from "node:path";
import { homedir } from "node:os";

let _bucket = process.env.MEM_X_BUCKET || "default";

export function setBucket(name: string): void {
  _bucket = name;
}

export function getBucket(): string {
  return _bucket;
}

export function getBucketDataDir(): string {
  return resolve(homedir(), ".mem-x", _bucket);
}
