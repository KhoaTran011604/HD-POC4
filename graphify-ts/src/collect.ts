// File collector: glob TS/JS sources, apply .gitignore + hardcoded exclusions
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';
import ignore, { Ignore } from 'ignore';

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const MAX_FILES = 500;

const ALWAYS_EXCLUDE = [
  'node_modules',
  'dist',
  '.git',
  'graphify-ts-out',
  '.next',
  'coverage',
  'build',
  '__pycache__',
];

function loadGitignore(root: string): Ignore {
  const ig = ignore();
  const gitignorePath = join(root, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    ig.add(content);
  }
  return ig;
}

function isExcludedDir(name: string): boolean {
  return ALWAYS_EXCLUDE.includes(name);
}

function walkDir(
  dir: string,
  root: string,
  ig: Ignore,
  results: string[],
): void {
  if (results.length >= MAX_FILES) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // skip unreadable dirs
  }

  for (const entry of entries) {
    if (results.length >= MAX_FILES) break;

    const fullPath = join(dir, entry);
    const relPath = relative(root, fullPath).replace(/\\/g, '/');

    if (isExcludedDir(entry)) continue;
    if (ig.ignores(relPath)) continue;

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDir(fullPath, root, ig, results);
    } else if (stat.isFile() && SOURCE_EXTS.has(extname(entry))) {
      results.push(fullPath);
    }
  }
}

/**
 * Collect all TS/JS source files under root, respecting .gitignore.
 * Returns absolute paths. Capped at MAX_FILES (500).
 */
export function collectFiles(root: string): string[] {
  const ig = loadGitignore(root);
  const results: string[] = [];
  walkDir(root, root, ig, results);
  return results;
}
