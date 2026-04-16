---
title: "graphify-ts Knowledge Graph & Query Optimization"
description: "Eliminate 88% graph noise, fix import resolution, add JSX edges, improve query engine"
status: pending
priority: P1
effort: 4h
branch: main
tags: [graphify-ts, optimization, graph-quality, query-engine]
created: 2026-04-16
---

# graphify-ts Knowledge Graph & Query Optimization

## Context
- Research: [research-260416-1006-graphify-ts-optimization.md](../reports/research-260416-1006-graphify-ts-optimization.md)
- Codebase: `graphify-ts/src/` (15 TS files)

## Problem
Graph is 88% noise: 76% edges are trivial `contains`, 67% files isolated (broken path-alias imports), no JSX awareness, bloated extraction.json, naive query engine.

## Expected Outcomes
| Metric | Before | After |
|--------|--------|-------|
| Useful edges | 24% | ~86% |
| Connected files | 33% | ~92% |
| Query noise | 88% | ~17% |
| extraction.json | 38KB | ~18KB |
| graph.json | 19KB | ~12KB |

## Phases

| # | Phase | Status | Effort | Files |
|---|-------|--------|--------|-------|
| 1 | [Remove contains edges](phase-01-remove-contains-edges.md) | pending | 20min | extract.ts, types.ts |
| 2 | [Drop per_file bloat](phase-02-drop-per-file-bloat.md) | pending | 10min | cli.ts |
| 3 | [Resolve path-alias imports](phase-03-resolve-path-alias-imports.md) | pending | 1h | collect.ts, cli.ts, extract-helpers.ts |
| 4 | [JSX component usage edges](phase-04-jsx-component-usage-edges.md) | pending | 1h | extract-helpers.ts, extract.ts, types.ts |
| 5 | [Query engine improvements](phase-05-query-engine-improvements.md) | pending | 1.5h | query.ts |
| 6 | [Graph compaction](phase-06-graph-compaction.md) | pending | 30min | extract-helpers.ts, cli.ts |

## Validation
Run `npx tsx graphify-ts/src/cli.ts .` and compare before/after metrics on HD-POC4 project.

## Unresolved Questions
1. Keep `method` edges (class->method)? They encode class membership — **decision: keep, only remove `contains`**
2. Store `exports` edges? — **decision: defer to future iteration**
3. Exclude `*.test.ts`/`*.spec.ts`? — **decision: defer, keep for now**
