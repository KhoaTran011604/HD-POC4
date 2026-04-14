// CLI entry point: collect → cache check → extract → cache save → emit extraction.json
import { Command } from 'commander';
import { Project } from 'ts-morph';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { collectFiles } from './collect.js';
import { checkCache, saveCache } from './cache.js';
import { extractFile } from './extract.js';
import type { ExtractionResult } from './types.js';

const OUT_DIR = '../.graphify-ts-out';

const program = new Command();

program
  .name('graphify-ts')
  .description('TypeScript/JS code knowledge graph extractor')
  .argument('[path]', 'root directory to analyse', '.')
  .option('--no-cache', 'skip reading cache (forces re-extraction)')
  .action(async (rootArg: string, opts: { cache: boolean }) => {
    const root = resolve(rootArg);
    console.log(`[graphify-ts] Scanning: ${root}`);

    // 1. Collect source files
    const files = collectFiles(root);
    if (files.length === 0) {
      console.error('[graphify-ts] No source files found.');
      process.exit(1);
    }
    console.log(`[graphify-ts] Found ${files.length} source file(s)`);

    // 2. Build ts-morph project (allowJs for .js/.jsx)
    const project = new Project({
      compilerOptions: { allowJs: true, skipLibCheck: true },
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(files);

    // 3. Extract per file (with cache)
    const allResults: ExtractionResult[] = [];
    let cacheHits = 0;

    for (const file of files) {
      const cached = opts.cache ? checkCache(file) : null;
      if (cached) {
        allResults.push(cached);
        cacheHits++;
        continue;
      }
      const result = extractFile(file, project, root);
      saveCache(file, result);
      allResults.push(result);
    }

    console.log(
      `[graphify-ts] Extracted ${files.length} files ` +
      `(${cacheHits} from cache, ${files.length - cacheHits} fresh)`,
    );

    // 4. Merge and emit extraction.json
    const merged = {
      root,
      files: files.length,
      nodes: allResults.flatMap((r) => r.nodes),
      edges: allResults.flatMap((r) => r.edges),
      per_file: allResults,
    };

    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    const outPath = `${OUT_DIR}/extraction.json`;
    writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf8');

    console.log(
      `[graphify-ts] Nodes: ${merged.nodes.length}  Edges: ${merged.edges.length}`,
    );
    console.log(`[graphify-ts] Output: ${outPath}`);
  });

program.parse();
