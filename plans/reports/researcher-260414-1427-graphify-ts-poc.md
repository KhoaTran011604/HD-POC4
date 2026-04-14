# Research Report: TypeScript Code Knowledge Graph POC
**Date:** 2026-04-14 | **Researcher:** Claude Code

---

## 1. TypeScript AST Parsers for Code Analysis

### Top Candidates

| Parser | Best For | Type Info | Notes |
|--------|----------|-----------|-------|
| **ts-morph** | Manipulating TS code directly | ✓ Full | Wrapper around TS Compiler API; high-level abstractions for classes, functions, imports |
| **@typescript-eslint/parser** | Linting + type-aware analysis | ✓ Full | De facto 2026 standard; ESTree-compatible + TS extensions; access to semantic types |
| **@babel/parser** | JSX + experimental features | ✓ Partial | Supports TS, JSX, Flow via plugins; Babel-specific AST (superset of ESTree) |
| **acorn** | Lightweight JS parsing | ✗ None | Fast, spec-compliant ESTree; minimal overhead; plain JS only |
| **espree** | ESLint rules/plugins | ✗ None | Built on acorn; ESTree standard output |

### Recommendation for POC
**Use ts-morph** for class/function extraction and call-graph analysis. Provides:
- Direct access to `class.getMethods()`, `function.getReferencedSymbols()`
- Built-in navigation of import statements with `ImportDeclaration`
- Type information via `getType()` for semantic analysis
- Mature, stable API for extracting callgraph edges

**Alternative:** @typescript-eslint/parser if you need ESTree compatibility or plan to integrate ESLint rules later.

### Resources
- [AST Parsers Comparison 2026](https://www.pkgpulse.com/blog/acorn-vs-babel-parser-vs-espree-javascript-ast-parsers-2026)
- [TypeScript AST Viewer](https://ts-ast-viewer.com/)

---

## 2. Lightweight Graph Libraries for In-Memory Code Graphs

### Candidates Evaluated

| Library | Size | BFS | DFS | Algorithms | TypeScript | Notes |
|---------|------|-----|-----|------------|-----------|-------|
| **graphology** | Medium | ✓ | ✓ | Louvain, PageRank, centrality | ✓ Native | Robust, standard library with traversals |
| **graph-data-structure** | Tiny | ✓ | ✓ | Adjacency list | ✓ | Minimalist; good for custom algorithms |
| **graphomic** | Small | ✓ | ✗ | BFS only | ? | Fast node.js graph; adjacency list support |
| **ngraph** | Medium | ✓ | ✓ | Path algorithms | ✗ | JS-focused; layout + physics engines |

### Recommendation for POC
**Use graphology** (`@latest ~0.25.x`):
- Native TypeScript types (export default in package)
- Built-in BFS/DFS traversals via standard library
- Optional: community detection via `graphology-communities-louvain`
- JSON serialization support for GRAPH_REPORT.md
- No heavy external deps; works with Node.js streams

**Alternative:** Plain adjacency list (Map<nodeId, Set<edgeIds>>) if you want zero dependencies and custom control.

### Resources
- [Graphology Official](https://graphology.github.io/)
- [Graphology on npm](https://www.npmjs.com/package/graphology)
- [Exploring Graphology with TypeScript](https://www.xjavascript.com/blog/graphology-typescript/)

---

## 3. Community Detection for Code Clustering

### Options

| Algorithm | Library | Complexity | Output | Notes |
|-----------|---------|-----------|--------|-------|
| **Louvain** | graphology-communities-louvain | O(n log n) | Non-overlapping clusters | Greedy modularity optimization |
| **Connected Components** | graphology-components | O(n+m) | Connected subgraphs | Simpler; finds weakly/strongly connected sets |
| **Leiden** | Not in JS ecosystem | - | - | Successor to Louvain; no stable TS lib yet |

### Recommendation for POC
**Use graphology-communities-louvain** (`@latest ~2.0.x`):
- Works for both directed and undirected graphs
- Config options: `fastLocalMoves`, `resolution` (more resolution = more clusters)
- Exports partition as `Map<nodeId, communityId>`
- Good for identifying "god classes" (high modularity nodes)

**Fallback:** Implement simple connected-components BFS yourself (~30 lines) if you want zero external deps.

### Token Reduction Insight
Grouping related code into clusters enables **selective context querying**: return only nodes in relevant clusters for a given question, reducing full-file inclusion.

### Resources
- [graphology-communities-louvain docs](https://graphology.github.io/standard-library/communities-louvain.html)
- [Louvain Algorithm Explained](https://medium.com/data-science-in-your-pocket/community-detection-in-a-graph-using-louvain-algorithm-with-example-7a77e5e4b079)

---

## 4. Real-World Code-to-Graph for LLM Context Reduction

### Key Projects & Results

| Project | Approach | Token Reduction | Tech Stack |
|---------|----------|-----------------|------------|
| **RepoGraph (ICLR 2025)** | Line-level dependency graph | ~60-70% | Graph extraction @ line granularity; published paper |
| **repomix** | Tree-sitter + compression | ~70% | Tree-sitter parser; intelligent file exclusion |
| **aider** | Tree-sitter tag-map + dynamic selection | ~40-60% | Tag extraction; LLM-guided context picking |
| **rtk (Rust)** | Unknown; CLI proxy | ~60-90% | Single binary; focuses on command-level context |

### Token Savings Summary
- **Naive approach** (full files): 100% baseline
- **Graph-based selective context (BFS/DFS)**: **40-95% token reduction** depending on query focus
- **Community clustering first**: Further optimizes by excluding irrelevant clusters before querying

### Practical Insights from Analysis

1. **Line-level granularity (RepoGraph)** is more precise than file/function granularity, but requires line-number AST mapping
2. **Tree-sitter** (used by aider + repomix) is language-agnostic; consider for multi-language support
3. **Dynamic selection** (aider's approach) beats static compression; LLM itself picks relevant context
4. **Selective subgraph queries** reduce token waste from "finding things" (80% of overhead per Medium article)

### Recommendation for POC
1. **Implement function/class-level granularity** (not line-level) for v1; simpler AST mapping
2. **Build BFS query(question) function** to extract minimal subgraph (callers + callees + imports)
3. **Benchmark against full-file approach:** measure tokens via OpenAI API or mock token counter
4. **Add Louvain clustering** for "god node" detection; enable cluster-filtered queries
5. **Generate GRAPH_REPORT.md** with:
   - Centrality metrics (betweenness, closeness for hub detection)
   - Clusters and their inter-cluster edges
   - Top 10 "gateway" functions (high in/out degree)

### Real-World Papers & Tools
- [RepoGraph Paper (ICLR 2025)](https://arxiv.org/abs/2410.14684v1)
- [Repomix (GitHub)](https://github.com/yamadashy/repomix)
- [Token Compression Article (Medium, Feb 2026)](https://medium.com/@jakenesler/context-compression-to-reduce-llm-costs-and-frequency-of-hitting-limits-e11d43a26589)
- [Code Intelligence Tools Comparison](https://rywalker.com/research/code-intelligence-tools)

---

## Recommended Tech Stack for TypeScript POC

```json
{
  "parser": "ts-morph@20.0+",
  "graph": "graphology@0.25+",
  "community": "graphology-communities-louvain@2.0+",
  "optional": [
    "graphology-shortest-path (for distance calculations)",
    "tree-sitter-typescript (for multi-lang future)"
  ],
  "devDeps": [
    "typescript@5.3+",
    "tsx (for dev running)"
  ]
}
```

---

## Key Findings Summary

1. **AST Parsing:** ts-morph > @typescript-eslint/parser for extracting call graphs; wraps TS Compiler for semantic data
2. **Graph Engine:** graphology is battle-tested, TypeScript-native, has BFS + optional Louvain clustering
3. **Community Detection:** Louvain identifies clusters; consider it for "god node" detection; fallback to connected-components if size constraints
4. **Token Reduction:** Real-world tools achieve 40-95% savings via selective subgraph querying + clustering; RepoGraph paper quantifies line-level precision
5. **Differentiation:** Build function/class-level query() with BFS; generate GRAPH_REPORT.md with centrality + clusters; benchmark token usage

---

## Unresolved Questions

- Does ts-morph have built-in support for extracting dynamic call chains (reflection, higher-order functions)?
- Should POC support JSX/TSX component trees as separate edge types?
- What's the optimal cluster resolution parameter for typical codebases (< 10K LOC)?
- How to handle circular dependencies in callgraph BFS traversal?
