---
name: graphify-ts
description: Build a code knowledge graph from TS/JS codebase and query it for focused LLM context
---

# graphify-ts skill

When user types `/graphify-ts [path]`:

1. Run: `node dist/cli.js [path]` (or `tsx src/cli.ts [path]` in dev)
2. Read `graphify-ts-out/GRAPH_REPORT.md` for god nodes and community structure
3. Use `node dist/cli.js [path] --query "..."` for focused context instead of raw file reads
4. Token benchmark is printed automatically — note the reduction ratio

## Commands

- `/graphify-ts .` — build graph for current directory
- `/graphify-ts . --query "how does auth work"` — query focused context (~10x fewer tokens)
- `/graphify-ts . --llm` — add INFERRED semantic edges from jsdoc/comments via Claude proxy

## Output

- `graphify-ts-out/GRAPH_REPORT.md` — god nodes, communities, surprising connections, benchmark
- `graphify-ts-out/graph.json` — persistent graph (query without re-extracting)
- `graphify-ts-out/extraction.json` — raw AST extraction per file (cached)

## Best Practices

Before answering architecture questions about a TypeScript codebase:

1. Check if `graphify-ts-out/GRAPH_REPORT.md` exists — if yes, read it first
2. Use the god nodes list to identify the most connected/important files
3. Use `--query` for specific questions instead of Glob/Grep across the whole project
4. The benchmark section in GRAPH_REPORT.md shows token reduction ratio for this project

## Install / Uninstall

```bash
# Install skill + PreToolUse hook
node dist/cli.js install

# Remove skill + hook
node dist/cli.js uninstall
```

## Notes

- `--no-cache` forces full re-extraction (default: reads from cache for unchanged files)
- `--llm` is optional; AST-only extraction is the default and requires no API key
- All output written to `../graphify-ts-out/` relative to the analysed project root
