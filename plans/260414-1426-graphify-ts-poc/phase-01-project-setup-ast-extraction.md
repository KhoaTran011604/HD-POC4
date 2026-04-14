# Phase 01 — Project Setup + AST Extraction

## Context Links
- Parent plan: [plan.md](./plan.md)
- Research: [ts-morph APIs](./research/researcher-01-ts-morph-apis.md)
- Reference: [graphify extract.py](../../graphify/graphify/extract.py)
- Reference: [graphify detect.py](../../graphify/graphify/detect.py)

## Overview
- **Date:** 2026-04-14
- **Priority:** P1 (Critical path — all phases depend on this)
- **Status:** complete
- **Effort:** ~4h
- **Goal:** `npx graphify-ts .` emits valid `graphify-ts-out/extraction.json` + per-file cache entries

## Key Insights
- ts-morph `SourceFile.getFunctions()` misses arrow functions → must also walk `VariableDeclarations` with `SyntaxKind.ArrowFunction`
- Call-graph: `callExpr.getExpression().getSymbol()?.getDeclarations()` reliable for internal code only; external npm calls → skip
- Load all project files via `tsconfig.json` path (or pass list) so cross-file symbol resolution works
- SHA256 cache: hash file content → store in `graphify-ts-out/cache/{hash}.json`; skip on re-run if hash matches

## Requirements
### Functional
- `collect(root)` — glob `.ts .tsx .js .jsx`, skip `node_modules/`, `dist/`, `.git/`, patterns from `.gitignore`
- `extract(filePath, project)` — returns `ExtractionResult` per file
- `cache.check(filePath)` / `cache.save(filePath, result)` — SHA256-keyed JSON files
- Node types: `file`, `class`, `function`, `method`
- Edge types: `imports`, `contains`, `method`, `calls`
- All edges tagged `EXTRACTED`; call-graph edges where callee can't be resolved → `INFERRED`
- CLI: `graphify-ts [path]` — runs collect → extract → cache → prints summary

### Non-functional
- No LLM calls in this phase
- Each source file < 200 lines; split helpers to `extract-helpers.ts` if needed
- Output `graphify-ts-out/extraction.json` for debugging

## Architecture
```
src/
├── collect.ts       # glob + .gitignore filter → string[]
├── extract.ts       # ts-morph Project → ExtractionResult per file
├── extract-helpers.ts  # _makeId(), _extractImports(), _extractCallGraph()
├── cache.ts         # SHA256 check/save for ExtractionResult
├── types.ts         # shared interfaces (ExtractionResult, Node, Edge)
└── cli.ts           # commander entry: runs collect+extract+cache
```

## Shared Types (types.ts)
```typescript
export interface GraphNode {
  id: string;
  label: string;
  type: 'file' | 'class' | 'function' | 'method' | 'interface';
  source_file: string;
  source_location: string; // "L{line}"
}
export interface GraphEdge {
  source: string;
  target: string;
  relation: 'imports' | 'contains' | 'method' | 'calls' | 'uses'
    | 'inherits' | 'implements' | 'type_reference' | 'decorator';
  confidence: 'EXTRACTED' | 'INFERRED';
}
// <!-- Updated: Validation Session 1 - rich extraction types added -->
export interface ExtractionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

## Implementation Steps

### Step 1: Init project
```bash
mkdir graphify-ts && cd graphify-ts
npm init -y
npm i ts-morph graphology graphology-traversal graphology-communities-louvain commander
npm i -D typescript tsx @types/node
npx tsc --init --module commonjs --target ES2022 --outDir dist --rootDir src
```

### Step 2: `collect.ts`
- `collectFiles(root: string): string[]`
- Use `fast-glob` or `node:fs` recursive walk
- Read `.gitignore` at root, parse patterns, filter with `minimatch`
- Always exclude: `node_modules`, `dist`, `.git`, `graphify-ts-out`

### Step 3: `types.ts` — define `GraphNode`, `GraphEdge`, `ExtractionResult`

### Step 4: `cache.ts`
```typescript
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
const CACHE_DIR = 'graphify-ts-out/cache';
export function checkCache(filePath: string): ExtractionResult | null;
export function saveCache(filePath: string, result: ExtractionResult): void;
// key = SHA256(file content)
```

### Step 5: `extract.ts` + `extract-helpers.ts`
```typescript
// extract.ts
import { Project, SyntaxKind } from 'ts-morph';
export function extractFile(filePath: string, project: Project): ExtractionResult

// Nodes to extract per file:
// 1. File node: id=makeId(filePath), type='file'
// 2. Classes: sf.getClasses() → name, getMethods() per class
// 3. Functions: sf.getFunctions() UNION variableDecls with ArrowFunction
// 4. Imports: sf.getImportDeclarations() → named/default/namespace

// Call-graph (INFERRED pass):
// Walk all CallExpression nodes → getExpression().getSymbol()?.getDeclarations()
// If declaration resolves to a node in our Project → add 'calls' EXTRACTED edge
// Else → skip (external npm)
```

Critical: use `visited: Set<string>` to prevent circular import cycles when building cross-file edges.

### Step 6: `cli.ts` — skeleton
```typescript
import { Command } from 'commander';
const program = new Command();
program.argument('[path]', 'root dir', '.').action(async (root) => {
  const files = collectFiles(root);
  const project = new Project({ addFilesFromTsConfig: false });
  project.addSourceFilesAtPaths(files);
  const allResults: ExtractionResult[] = [];
  for (const file of files) {
    const cached = checkCache(file);
    if (cached) { allResults.push(cached); continue; }
    const result = extractFile(file, project);
    saveCache(file, result);
    allResults.push(result);
  }
  // Phase 2 will consume allResults
  console.log(`Extracted ${files.length} files`);
});
program.parse();
```

## Todo List
- [x] `npm init` + install deps + tsconfig
- [x] `types.ts` — interfaces
- [x] `collect.ts` — glob + gitignore filter
- [x] `cache.ts` — SHA256 check/save
- [x] `extract-helpers.ts` — `_makeId`, `_extractImports`, `_extractArrows`
- [x] `extract.ts` — main extractor
- [x] `cli.ts` — basic command
- [x] Test on graphify source folder itself

## Success Criteria
- `npx graphify-ts graphify/graphify` runs without error
- Outputs `graphify-ts-out/extraction.json` with nodes > 0, edges > 0
- Re-running uses cache (faster second run)
- Arrow functions in TS files are captured as function nodes

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Arrow functions missed | High | Explicit `VariableDeclaration + ArrowFunction` walk |
| Cross-file call resolution fails | Medium | Fall back to INFERRED; log warning |
| .gitignore parsing edge cases | Low | Use `ignore` npm package (same as git) |
| ts-morph OOM on large project | Low | Limit to `addSourceFilesAtPaths` not full tsconfig scan |

## Security Considerations
- Never eval or exec extracted code
- Sanitize file paths (no `..` traversal outside root)
- Cap max files (default 500) to prevent resource exhaustion

## Next Steps
→ Phase 02: consume `allResults[]` to build graphology DirectedGraph + render GRAPH_REPORT.md
