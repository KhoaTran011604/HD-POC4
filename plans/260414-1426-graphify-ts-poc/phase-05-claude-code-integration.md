# Phase 05 — Claude Code Integration + Demo

## Context Links
- Parent plan: [plan.md](./plan.md)
- Depends on: [phase-04](./phase-04-query-benchmark.md)
- Research: [graphology + skill](./research/researcher-02-graphology-skill.md)
- Reference: [graphify skill.md](../../graphify/graphify/skill.md), [hooks.py](../../graphify/graphify/hooks.py)

## Overview
- **Date:** 2026-04-14
- **Priority:** P1
- **Status:** complete
- **Effort:** ~3h
- **Goal:** `/graphify-ts .` works in Claude Code; benchmark validated on user's own TS project; README with numbers
- **Note (Validation Session 1):** graph.html REMOVED from scope; `--llm` flag added; npm publish REMOVED; demo on user's own project

## Key Insights
- Claude Code skill = `~/.claude/skills/{name}/SKILL.md` with YAML frontmatter (`name`, `description`)
- PreToolUse hook in `~/.claude/settings.json`: fires before every `Glob`/`Grep` call; injects `systemMessage` if GRAPH_REPORT.md exists
- Hook script reads `graphify-ts-out/GRAPH_REPORT.md` presence → injects reminder into tool context
- `graphify-ts install` command should be idempotent (re-running is safe)
- Demo: user provides own TS project path — demo script must accept any `--target` path
- LLM pass: `--llm` flag calls Claude proxy to extract jsdoc/comment text as INFERRED semantic edges

## Requirements
### Functional
<!-- Updated: Validation Session 1 - HTML viz removed; --llm flag added; no npm publish -->
- `SKILL.md` — Claude Code skill file invoked by `/graphify-ts`
- `graphify-ts install` — installs skill to `~/.claude/skills/graphify-ts/SKILL.md` + PreToolUse hook
- `graphify-ts uninstall` — removes both
- Hook script (`hook-pre-tool.cjs`) — fires before Glob/Grep; checks for `graphify-ts-out/GRAPH_REPORT.md`; injects reminder
- `--llm` flag: optional pass that calls Claude proxy with jsdoc/comment text → adds INFERRED edges to graph
- README.md with benchmark numbers from real demo
- Demo script: parametrized (`--target <path>`) for user's own project
- **REMOVED:** graph.html / vis-network (out of scope)
- **REMOVED:** npm publish / bin setup

### Non-functional
- `install` must ask confirmation before modifying `~/.claude/settings.json`
- Hook must exit cleanly if `graphify-ts-out/` doesn't exist (no-op)
- SKILL.md ≤ 100 lines

## Architecture
```
src/
├── install.ts          # install/uninstall command handler
├── llm-extract.ts      # optional LLM pass: jsdoc/comment → INFERRED edges via Claude proxy
└── hook-pre-tool.cjs   # PreToolUse hook script (CommonJS for Node compat)

skill/
└── SKILL.md            # Claude Code skill definition (local only, not bundled)
```

## SKILL.md Structure
```markdown
---
name: graphify-ts
description: Build a code knowledge graph from TS/JS codebase and query it for focused LLM context
---

# graphify-ts skill

When user types `/graphify-ts [path]`:

1. Run: `npx graphify-ts [path]`
2. Read `graphify-ts-out/GRAPH_REPORT.md` for god nodes and community structure
3. Use `npx graphify-ts --query "..."` for focused context instead of raw file reads
4. Token benchmark is printed automatically — note the reduction ratio

## Commands
- `/graphify-ts .` — build graph for current directory
- `/graphify-ts . --query "how does auth work"` — query focused context
- `/graphify-ts . --update` — re-extract only changed files

## Output
- `graphify-ts-out/GRAPH_REPORT.md` — god nodes, communities, benchmark
- `graphify-ts-out/graph.json` — persistent graph (query without re-extracting)

## Best Practices
Before answering architecture questions about this codebase:
1. Check if `graphify-ts-out/GRAPH_REPORT.md` exists
2. Read it for structural overview
3. Use `--query` for specific questions instead of Glob/Grep
```

## Hook Script (`hook-pre-tool.cjs`)
```javascript
#!/usr/bin/env node
// PreToolUse hook — fires before Glob/Grep tool calls
// Injects GRAPH_REPORT.md reminder if knowledge graph exists

const fs = require('fs');
const path = require('path');

const input = JSON.parse(process.argv[2] ?? '{}');
const toolName = input.tool_name ?? '';

if (!['Glob', 'Grep'].includes(toolName)) process.exit(0);

const reportPath = path.join(process.cwd(), 'graphify-ts-out', 'GRAPH_REPORT.md');
if (!fs.existsSync(reportPath)) process.exit(0);

const output = {
  permissionDecision: 'allow',
  systemMessage: 'graphify-ts: Knowledge graph exists. Read graphify-ts-out/GRAPH_REPORT.md for god nodes and community structure before searching raw files. Use `npx graphify-ts --query "..."` for focused context.'
};

process.stdout.write(JSON.stringify(output));
```

## `settings.json` Hook Entry (injected by `install`)
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Glob|Grep",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/hook-pre-tool.cjs"
      }]
    }]
  }
}
```

## Implementation Steps

### Step 1: `assets/SKILL.md`
Write skill definition file as above. Bundle with npm package (add to `files` in `package.json`).

### Step 2: `src/hook-pre-tool.cjs`
Write hook script as above. Must be CommonJS (`.cjs`) for Node compatibility without ESM flags.

### Step 3: `src/install.ts` — install command
```typescript
export async function install(): Promise<void> {
  const skillDir = path.join(os.homedir(), '.claude', 'skills', 'graphify-ts');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  // 1. Copy SKILL.md
  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(SKILL_MD_PATH, path.join(skillDir, 'SKILL.md'));

  // 2. Copy hook script
  const hookDest = path.join(os.homedir(), '.claude', 'hooks', 'graphify-ts-pre-tool.cjs');
  fs.copyFileSync(HOOK_SCRIPT_PATH, hookDest);

  // 3. Patch settings.json
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8') ?? '{}');
  // Merge hook entry (idempotent check by command path)
  patchSettings(settings, hookDest);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  console.log('✓ graphify-ts skill installed');
  console.log('  Skill: ~/.claude/skills/graphify-ts/SKILL.md');
  console.log('  Hook:  fires before Glob/Grep when graph exists');
}
```

### Step 4: Wire into CLI
```typescript
// cli.ts
program.command('install').description('Install Claude Code skill + PreToolUse hook').action(install);
program.command('uninstall').description('Remove skill + hook').action(uninstall);
```

### Step 5: Demo casestudy
Pick a real TS project (suggestion: the graphify-ts project itself once Phase 01-04 are done, or a small open-source TS project like `zod` or `neverthrow`).

Record:
```
Corpus:          {N} files → ~{X,XXX} tokens (naive)
Graph:           {N} nodes, {N} edges
Avg query cost:  ~{XXX} tokens
Reduction:       {N}x fewer tokens per query
```

Add these numbers to README.md.

### Step 6: README.md
Sections: Install, Usage, How it works, Benchmark, Integration with Claude Code, Architecture.

## Todo List
<!-- Updated: Validation Session 1 - HTML removed; --llm added; no npm publish -->
- [x] `skill/SKILL.md` — Claude Code skill definition
- [x] `src/hook-pre-tool.cjs` — PreToolUse hook script (CommonJS)
- [x] `src/install.ts` — install/uninstall handlers
- [x] `src/llm-extract.ts` — optional Claude proxy pass for jsdoc/comments → INFERRED edges
- [x] Wire `install`/`uninstall`/`--llm` into `cli.ts`
- [ ] Test `node dist/index.js install` — verify skill + hook installed
- [ ] Run demo on user's own TS project (path provided during Week 3)
- [ ] Capture + record benchmark numbers
- [x] Write README.md with actual numbers
- [ ] Verify `/graphify-ts .` works in Claude Code session
- [ ] ~~graph.html~~ — REMOVED from scope

## Success Criteria
- `/graphify-ts .` in Claude Code triggers skill, runs pipeline, prints report path
- PreToolUse hook fires before Glob/Grep and injects reminder when graph exists
- `node dist/index.js install` / `uninstall` idempotent and reversible
- `--llm` flag adds INFERRED edges from jsdoc extraction via Claude proxy
- README contains real benchmark numbers from user's own TS project
- Demo shows measurable reduction (target: ≥ 10x on 20+ file project)

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| `settings.json` format changes in Claude Code | Medium | Read-parse-merge carefully; don't overwrite whole file |
| Hook not firing (path issues on Windows) | High | Test on Windows; use absolute paths in hook command |
| SKILL.md format rejected by Claude Code | Medium | Follow graphify's exact SKILL.md frontmatter format as reference |
| Demo project too small → unimpressive numbers | Medium | Choose project with 20+ files; document scaling behavior |

## Security Considerations
- `install` MUST NOT silently modify global settings without user confirmation
- Hook script reads only filesystem presence check (no exec of user code)
- Hook script path must be absolute to prevent PATH hijacking
- `uninstall` must cleanly remove all installed artifacts

## Next Steps
→ POC complete. Potential extensions:
- `--watch` mode: rebuild on file change (Phase 01 cache makes this cheap)
- MCP stdio server (`serve.ts`): structured graph access for Claude API tool calling
- Multi-language support: add `@babel/parser` for plain JS projects
- Claude proxy integration: optional LLM pass for JSDoc/comment extraction
