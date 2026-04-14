# Research Report: graphify-ts POC

**Date:** 2026-04-14 | **Deadline:** ~2026-05-05 (2–3 weeks)

---

## Executive Summary

Dựa trên graphify (Python), ta kế thừa **3 tư tưởng cốt lõi** để build TypeScript POC:

1. **AST-first, LLM-second** — code được parse tĩnh (ts-morph), không dùng LLM cho code extraction → zero cost cho pass đầu tiên
2. **Graph thay vì full-file scan** — AI nhận subgraph BFS thay vì toàn bộ file → token giảm 40–95%
3. **GRAPH_REPORT.md là "map"** — AI đọc map trước khi đi vào file, không grep mù

Mục tiêu POC: **đo được con số token reduction thực tế** + **dễ plug vào dự án TS/JS bất kỳ**

---

## graphify Core Architecture (Python → hiểu để kế thừa)

```
collect() → extract() → build() → cluster() → analyze() → report()
```

| Module | Role | Giữ lại trong TS POC? |
|--------|------|-----------------------|
| `detect.py` | collect files, respect .gitignore | ✓ |
| `extract.py` | tree-sitter AST → nodes+edges dict | ✓ (dùng ts-morph) |
| `build.py` | merge extractions → NetworkX graph | ✓ (dùng graphology) |
| `cluster.py` | Leiden community detection | ✓ (Louvain in JS) |
| `analyze.py` | god nodes, surprising connections | ✓ |
| `report.py` | GRAPH_REPORT.md | ✓ |
| `benchmark.py` | token reduction metrics | ✓ core diff |
| `serve.py` | MCP server | optional v2 |
| `watch.py` | file watch + incremental | optional v2 |
| `ingest.py` | URL/video/PDF fetch | ✗ (out of scope) |

**Extraction schema (giữ nguyên tư tưởng):**
```json
{
  "nodes": [{ "id": "str", "label": "str", "source_file": "str", "source_location": "L42" }],
  "edges": [{ "source": "id", "target": "id", "relation": "calls|imports|uses", "confidence": "EXTRACTED|INFERRED" }]
}
```

**Confidence tags:**
- `EXTRACTED` — import statement, direct call (từ AST, certain 100%)
- `INFERRED` — indirect call, semantic similarity (từ pattern analysis, có confidence score)

**Token reduction mechanism:**
- Naive: đọc tất cả raw files → N tokens
- graphify: BFS từ query terms → subgraph N/71.5 tokens trung bình
- SHA256 cache per file → re-run chỉ xử lý changed files

---

## TS POC Architecture

### Tech Stack

| Layer | Package | Version | Why |
|-------|---------|---------|-----|
| AST Parser | `ts-morph` | ^20.0 | Wraps TS Compiler API; `getMethods()`, `getReferencedSymbols()`, import navigation |
| Graph Engine | `graphology` | ^0.25 | TypeScript-native, BFS/DFS built-in, JSON serialize |
| Community Detection | `graphology-communities-louvain` | ^2.0 | Modularity optimization, `Map<nodeId, communityId>` output |
| Optional | `graphology-shortest-path` | — | Shortest path queries |
| Runtime | `typescript` ^5.3 + `tsx` | — | Dev runner |

### Pipeline Design

```
src/
├── collect.ts      # glob .ts/.js, respect .gitignore patterns
├── extract.ts      # ts-morph → {nodes, edges} dict per file
├── build.ts        # merge extractions → graphology Graph
├── cluster.ts      # Louvain → community map + god nodes
├── analyze.ts      # god nodes, surprising connections, suggested questions
├── report.ts       # generate graphify-out/GRAPH_REPORT.md
├── query.ts        # BFS subgraph from question terms → minimal context
├── benchmark.ts    # measure raw tokens vs query tokens → reduction ratio
├── cache.ts        # SHA256 per file → skip unchanged
└── cli.ts          # entry point + Claude Code skill
```

### Extract Module (ts-morph extractions)

Từ mỗi file `.ts`/`.js`, extract:

```typescript
// NODES
- class declarations → { id: "ClassName", type: "class", ... }
- function/method declarations → { id: "fnName", type: "function", ... }
- file module → { id: "filename", type: "file", ... }

// EDGES (EXTRACTED)
- imports: A imports B → { source: "A", target: "B", relation: "imports" }
- contains: file contains class/fn → { relation: "contains" }
- method: class contains method → { relation: "method" }
- calls: fn A calls fn B (AST call expression) → { relation: "calls" }

// EDGES (INFERRED)
- uses: variable usage across files
- semantically_similar: same signature pattern (optional)
```

### Query Function (core value prop)

```typescript
// Thay vì: "đọc tất cả files liên quan đến auth"
// → Trả về subgraph BFS từ nodes matching "auth", depth=3

query("how does auth work", graph, { depth: 3, budgetTokens: 2000 })
// Returns: focused nodes + edges + source locations
// Format: compact text block for LLM context injection
```

### GRAPH_REPORT.md Structure

```markdown
# Graph Report — {project_name}

## God Nodes (top 10 most connected)
| Node | Connections | File |
...

## Communities (Louvain clusters)
| ID | Label | Members | Cohesion |
...

## Surprising Connections
...

## Suggested Questions
...

## Token Benchmark
- Corpus: X,XXX tokens (naive full read)
- Avg query: XXX tokens
- Reduction: XXx fewer tokens per query
```

---

## Token Reduction — Số Liệu Thực Tế

| Approach | Token Reduction | Source |
|----------|----------------|--------|
| RepoGraph (ICLR 2025) | 60–70% | Published paper |
| repomix (Tree-sitter) | ~70% | Open source tool |
| aider (repo-map + dynamic) | 40–60% | Production tool |
| graphify Python (52 files) | **71.5x** (98.6%) | Worked examples in repo |
| graphify Python (6 files) | ~5.4x (81%) | Worked examples in repo |

**Insight:** Token reduction tỷ lệ với corpus size. POC cần benchmark trên ít nhất 1 real project 20–50 files để có số liệu có ý nghĩa.

**Benchmark method (từ graphify):**
```
corpus_tokens = total raw file chars / 4  (1 token ≈ 4 chars)
query_tokens  = BFS subgraph serialized text / 4
reduction_ratio = corpus_tokens / query_tokens
```

---

## Phân Kỳ Triển Khai (2–3 tuần)

### Week 1 — Core Pipeline
- [ ] `collect.ts` — glob + .gitignore support
- [ ] `extract.ts` — ts-morph: classes, functions, imports, call-graph edges
- [ ] `build.ts` — graphology Graph assembly
- [ ] `cache.ts` — SHA256 per file
- [ ] `report.ts` — GRAPH_REPORT.md template
- [ ] `cli.ts` — `npx graphify-ts .`

### Week 2 — Intelligence Layer
- [ ] `cluster.ts` — Louvain community detection + god nodes
- [ ] `analyze.ts` — surprising connections, suggested questions
- [ ] `query.ts` — BFS subgraph with token budget
- [ ] `benchmark.ts` — corpus vs query token comparison
- Output: interactive HTML graph (vis.js or D3 minimal)

### Week 3 — Integration & Demo
- [ ] Claude Code skill (`SKILL.md` + install hook)
- [ ] Claude proxy integration (nếu cần LLM pass cho comments/jsdoc)
- [ ] Demo casestudy trên 1 real TS project
- [ ] README với số liệu benchmark thực tế
- [ ] npm package / publishable as library

---

## Claude Code Integration (kế thừa từ graphify)

**Skill trigger:** `/graphify-ts .`

**Always-on hook** (PreToolUse before Glob/Grep):
```
"graphify-ts: Knowledge graph exists. Read graphify-out/GRAPH_REPORT.md 
for god nodes and community structure before searching raw files."
```

**CLAUDE.md injection:**
```markdown
## Code Graph
- Run `/graphify-ts .` to build/update the knowledge graph
- Before answering architecture questions, read `graphify-out/GRAPH_REPORT.md`
- Use `query()` for focused context instead of full-file reads
```

---

## Điểm Khác Biệt vs graphify Python

| | graphify (Python) | graphify-ts POC |
|--|-------------------|-----------------|
| Language | Python | TypeScript |
| AST | tree-sitter (23 langs) | ts-morph (TS/JS only) |
| Graph lib | NetworkX | graphology |
| Clustering | Leiden (graspologic) | Louvain (graphology) |
| Multimodal | PDF, images, video | ✗ (code only) |
| Scope | Production tool | POC/casestudy |
| Install | pip | npm/npx |
| LLM extraction | Claude subagents | Optional (jsdoc/comments) |
| MCP server | ✓ | Optional v2 |

---

## Rủi Ro & Mitigation

| Rủi Ro | Mức độ | Mitigation |
|--------|--------|------------|
| ts-morph chậm trên large codebase | Medium | SHA256 cache + incremental mode |
| Louvain cho kết quả không ổn định | Low | Fixed seed + resolution tuning |
| Dynamic calls không capture được | Medium | Flag as INFERRED, document limitation |
| Token benchmark không đủ ấn tượng trên small projects | Medium | Demo trên codebase 20+ files, document scale behavior |
| JSX/TSX component trees | Low | Scope to .ts/.tsx only, extend later |

---

## Unresolved Questions

1. Claude proxy endpoint format? (nếu cần LLM pass cho jsdoc extraction)
2. Nên output `graph.json` theo graphology format hay graphify-compatible format?
3. Có cần vis.js interactive HTML hay GRAPH_REPORT.md đủ cho POC demo?
4. Circular dependencies trong BFS — dùng `visited` set hay giới hạn `depth`?
