// SHA256-keyed cache for ExtractionResult — stores per-file in graphify-ts-out/cache/
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ExtractionResult } from './types.js';

const CACHE_DIR = join('../.graphify-ts-out', 'cache');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function cacheFilePath(hash: string): string {
  return join(CACHE_DIR, `${hash}.json`);
}

/**
 * Returns cached ExtractionResult if file content matches stored hash, else null.
 */
export function checkCache(filePath: string): ExtractionResult | null {
  try {
    const hash = hashFile(filePath);
    const cachePath = cacheFilePath(hash);
    if (!existsSync(cachePath)) return null;
    const raw = readFileSync(cachePath, 'utf8');
    return JSON.parse(raw) as ExtractionResult;
  } catch {
    return null;
  }
}

/**
 * Saves ExtractionResult keyed by SHA256 of the source file content.
 */
export function saveCache(filePath: string, result: ExtractionResult): void {
  try {
    ensureCacheDir();
    const hash = hashFile(filePath);
    const cachePath = cacheFilePath(hash);
    writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf8');
  } catch {
    // cache save failure is non-fatal
  }
}
