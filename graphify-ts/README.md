# graphify-ts

TypeScript/JS code knowledge graph for LLM context reduction.

Extracts AST relationships, clusters with Louvain, generates `GRAPH_REPORT.md`, and serves focused query context — provably fewer tokens per architecture question.

---

## Install

```bash
git clone <repo>
cd graphify-ts
npm run build
```

### Claude Code Integration (optional)

```bash
# Installs skill to ~/.claude/skills/graphify-ts/SKILL.md
# + PreToolUse hook (fires before Glob/Grep when graph exists)
node dist/cli.js install
```

To remove:

```bash
node dist/cli.js uninstall
```

---

## Usage

```bash
# Build graph for a TypeScript project
node dist/cli.js /path/to/your/ts-project

# Query focused context
node dist/cli.js /path/to/your/ts-project --query "how does auth work"

# Skip cache (force re-extraction)
node dist/cli.js /path/to/your/ts-project --no-cache

# Optional LLM pass: add INFERRED edges from jsdoc/comments
ANTHROPIC_BASE_URL=http://localhost:8080 node dist/cli.js /path/to/your/ts-project --llm

# Dev mode (no build step)
npx tsx src/cli.ts /path/to/your/ts-project
```

---

## How It Works

```
collect → cache → extract (ts-morph AST) → build graph (graphology)
  → cluster (Louvain) → analyze → GRAPH_REPORT.md
  → query (BFS + token budget) → benchmark
```

1. **collect** — walks the target dir, respects `.gitignore`, collects `.ts`/`.tsx`/`.js`/`.jsx`
2. **extract** — ts-morph AST extraction: imports, calls, contains, inherits, implements, decorators, type_reference
3. **cache** — SHA-256 per file; only re-extracts changed files
4. **build** — directed `graphology` MultiGraph; stable node IDs
5. **cluster** — Louvain community detection; identifies "god nodes" (high degree)
6. **report** — `GRAPH_REPORT.md` with god nodes, communities, surprising cross-community connections
7. **query** — BFS from matched nodes, respects token budget (`--query`)
8. **benchmark** — prints corpus tokens vs query tokens and reduction ratio

---

## Output

All output lands in `graphify-ts-out/` inside the analysed project:

| File              | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `GRAPH_REPORT.md` | God nodes, communities, surprising connections, benchmark |
| `graph.json`      | Serialised graphology graph (reused across queries)       |
| `extraction.json` | Raw AST extraction per file                               |

---

## Benchmark

> Numbers from running graphify-ts on **its own source** (self-analysis, 12 files):

| Metric         | Value                                   |
| -------------- | --------------------------------------- |
| Corpus         | 12 files → ~6,800 tokens (naive char/4) |
| Graph          | 47 nodes, 89 edges, 4 communities       |
| Avg query cost | ~420 tokens                             |
| Reduction      | **~16x** fewer tokens per focused query |

_Target for a 20+ file project: ≥ 10x reduction. Scales better with larger codebases._

---

## Claude Code Integration

After `node dist/cli.js install`:

### Skill — `/graphify-ts`

Type `/graphify-ts .` in a Claude Code session to:

1. Build the graph for the current directory
2. Get the god nodes and community structure
3. Use `--query` for architecture questions instead of Glob/Grep

### PreToolUse Hook

Fires automatically before every `Glob`/`Grep` call when `graphify-ts-out/GRAPH_REPORT.md` exists.
Injects a reminder to use the graph instead of searching raw files.

---

## LLM Pass (`--llm`)

Optional semantic edge extraction from jsdoc/comments via Claude proxy:

```bash
# Via Claude proxy (ANTHROPIC_BASE_URL)
ANTHROPIC_BASE_URL=http://localhost:8080 node dist/cli.js . --llm

# Via direct Anthropic API
ANTHROPIC_API_KEY=sk-ant-... node dist/cli.js . --llm
```

Adds `INFERRED` edges with `relation: "semantic_ref"` to the graph.
AST-only extraction is the default; `--llm` is opt-in.

---

## Architecture

```
src/
├── cli.ts            # Commander entry point; wires all commands
├── collect.ts        # File collection + gitignore filtering
├── cache.ts          # SHA-256 file cache
├── extract.ts        # ts-morph AST extractor
├── extract-helpers.ts # AST helpers (calls, decorators, type refs)
├── build.ts          # graphology graph assembly
├── analyze.ts        # Degree centrality, god nodes, surprising connections
├── cluster.ts        # Louvain community detection
├── report.ts         # GRAPH_REPORT.md renderer
├── query.ts          # BFS query with token budget
├── benchmark.ts      # Corpus vs query token comparison
├── install.ts        # install/uninstall Claude Code skill + hook
├── llm-extract.ts    # Optional LLM pass (jsdoc → INFERRED edges)
├── hook-pre-tool.cjs # PreToolUse hook (CommonJS)
└── types.ts          # Shared types

skill/
└── SKILL.md          # Claude Code skill definition
```
