// CLI entry point: collect → cache check → extract → build graph → report
import { Command } from 'commander';
import { Project } from 'ts-morph';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { collectFiles } from './collect.js';
import { checkCache, saveCache } from './cache.js';
import { extractFile } from './extract.js';
import { buildGraph } from './build.js';
import { analyzeBasic, surprisingConnections, suggestQuestions } from './analyze.js';
import { cluster, buildCommunities } from './cluster.js';
import { renderReport } from './report.js';
import { query as queryGraph } from './query.js';
import { benchmark, printBenchmark, appendBenchmark } from './benchmark.js';
import { install, uninstall } from './install.js';
import { llmExtract } from './llm-extract.js';
import type { ExtractionResult } from './types.js';

const OUT_DIR = '../.graphify-ts-out';

const program = new Command();

// install / uninstall subcommands
program
  .command('install')
  .description('Install Claude Code skill + PreToolUse hook')
  .action(() => install());

program
  .command('uninstall')
  .description('Remove Claude Code skill + PreToolUse hook')
  .action(() => uninstall());

// default analyse command
program
  .name('graphify-ts')
  .description('TypeScript/JS code knowledge graph extractor')
  .argument('[path]', 'root directory to analyse', '.')
  .option('--no-cache', 'skip reading cache (forces re-extraction)')
  .option('-q, --query <question>', 'query the graph for focused context')
  .option('--llm', 'optional LLM pass: extract jsdoc/comment semantics as INFERRED edges')
  .action(async (rootArg: string, opts: { cache: boolean; query?: string; llm?: boolean }) => {
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

    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

    // 4a. Optional: --llm pass — augment with INFERRED semantic edges before merging
    if (opts.llm) {
      console.log('[graphify-ts] Running LLM pass (--llm)...');
      const inferredEdges = await llmExtract(allResults, (p) => readFileSync(p, 'utf8'));
      // Inject inferred edges into a synthetic result so they flow through the normal path
      if (inferredEdges.length > 0) {
        allResults.push({ file: '__llm__', nodes: [], edges: inferredEdges });
      }
    }

    // 4b. Merge and emit extraction.json
    const merged = {
      root,
      files: files.length,
      nodes: allResults.flatMap((r) => r.nodes),
      edges: allResults.flatMap((r) => r.edges),
      per_file: allResults,
    };

    const extractionPath = `${OUT_DIR}/extraction.json`;
    writeFileSync(extractionPath, JSON.stringify(merged, null, 2), 'utf8');
    console.log(
      `[graphify-ts] Nodes: ${merged.nodes.length}  Edges: ${merged.edges.length}`,
    );
    console.log(`[graphify-ts] Extraction: ${extractionPath}`);

    // 5. Build graph, cluster, analyze, write graph.json + GRAPH_REPORT.md
    const graph = buildGraph(allResults);
    const analysis = analyzeBasic(graph);
    const communityMap = cluster(graph);
    const communities = buildCommunities(graph, communityMap);
    const surprises = surprisingConnections(graph, communityMap);
    const questions = suggestQuestions(graph, communityMap);
    const report = renderReport(graph, analysis, { communities, surprises, questions });

    console.log(`[graphify-ts] Communities: ${communities.length}`);

    const graphPath = `${OUT_DIR}/graph.json`;
    const reportPath = `${OUT_DIR}/GRAPH_REPORT.md`;
    writeFileSync(graphPath, JSON.stringify(graph.export(), null, 2), 'utf8');
    writeFileSync(reportPath, report, 'utf8');

    console.log(`[graphify-ts] Graph: ${graph.order} nodes, ${graph.size} edges`);
    console.log(`[graphify-ts] graph.json:      ${graphPath}`);
    console.log(`[graphify-ts] GRAPH_REPORT.md: ${reportPath}`);

    // 6. Benchmark: corpus tokens vs query tokens (auto-runs after every full build)
    const benchResult = benchmark(graph, files);
    appendBenchmark(reportPath, benchResult);
    printBenchmark(benchResult);

    // 7. Optional: --query → focused context block for LLM injection
    if (opts.query) {
      const qResult = queryGraph(opts.query, graph);
      console.log('\n--- Graph Context ---');
      console.log(qResult.contextBlock || '(no matching nodes found for query)');
      console.log(
        `\n(~${qResult.tokenEstimate.toLocaleString()} tokens vs ~${benchResult.corpusTokens.toLocaleString()} corpus tokens)`,
      );
    }
  });

program.parse();
