---
title: "graphify-ts POC"
description: "TypeScript code knowledge graph for LLM context reduction — casestudy/POC"
status: pending
priority: P1
effort: ~15h
branch: main
tags: [typescript, graph, llm, poc, code-analysis]
created: 2026-04-14
---

# graphify-ts POC

## Objective
Build a TS/JS code knowledge graph pipeline that extracts AST relationships, clusters the graph, generates `GRAPH_REPORT.md`, serves focused query context, and proves token reduction with measurable benchmark output.

## Scope
- In: TS/JS AST extraction via `ts-morph`, graph assembly via `graphology`, Louvain clustering, Markdown report, BFS query, benchmark, Claude Code skill + PreToolUse integration.
- Out: multi-language parsing, remote ingestion, watch mode, production-grade HTML UI, LLM-dependent extraction.

## Inputs
- Research: `../reports/research-260414-1426-graphify-ts-poc.md`
- Research: `./research/researcher-01-ts-morph-apis.md`
- Research: `./research/researcher-02-graphology-skill.md`

## Deliverables
1. `phase-01-project-setup-ast-extraction.md`
2. `phase-02-graph-build-report.md`
3. `phase-03-clustering-analysis.md`
4. `phase-04-query-benchmark.md`
5. `phase-05-claude-code-integration.md`

## Phases
| Phase | Goal | Effort | Depends on | Status |
|---|---|---:|---|---|
| [01](./phase-01-project-setup-ast-extraction.md) | CLI skeleton, file collection, AST extraction, cache | 4h | none | complete |
| [02](./phase-02-graph-build-report.md) | Build directed graph, basic analysis, Markdown report | 3h | 01 | complete |
| [03](./phase-03-clustering-analysis.md) | Louvain communities, surprising connections, richer report | 3h | 02 | complete |
| [04](./phase-04-query-benchmark.md) | BFS query with token budget, benchmark, CLI query UX | 3h | 03 | complete |
| [05](./phase-05-claude-code-integration.md) | Claude Code skill, install command, hook, demo validation | 2h | 04 | complete |

## Architecture Backbone
`collect -> cache -> extract -> build -> cluster -> analyze -> report -> query -> benchmark -> cli`

## Key Decisions
- Keep extractor AST-only. No LLM in core path.
- Analyze internal project code only; external npm symbols ignored.
- Use stable node IDs derived from symbol kind + qualified name + file path when needed.
- Write all outputs to `graphify-ts-out/`.
- Prefer deterministic output for reports and benchmarks.

## Global Constraints
- Keep code files under ~200 lines by splitting helpers early.
- Respect `.gitignore`; avoid scanning generated dirs.
- Benchmark by char/4 token heuristic first; exact tokenizer optional later.
- Hook integration must be opt-in via install command; no silent global mutation.

## Milestones
- End Week 1: `npx graphify-ts .` emits valid extraction/graph/report artifacts.
- End Week 2: query + benchmark show reduction numbers.
- End Week 3: Claude Code slash command and hook validated on a real TS project.

## Acceptance
- Valid `graph.json` and `GRAPH_REPORT.md`
- Query returns smaller context than raw corpus on sample questions
- Benchmark prints reduction ratio with reproducible inputs
- `/graphify-ts` workflow documented and installable

## Risks
- `ts-morph` misses non-declaration patterns unless explicitly handled.
- Call resolution incomplete for dynamic dispatch.
- Louvain output may vary if graph assembly is noisy.

## Unresolved Questions
- ~~Is optional `graph.html` required for demo?~~ → Resolved: skip HTML viz
- Should benchmark keep char/4 heuristic only, or add pluggable tokenizer? → Keep char/4 for POC
- Is MCP stdio server required? → Out of scope for POC

---

## Validation Log

### Session 1 — 2026-04-14
**Trigger:** Initial plan creation
**Questions asked:** 5

#### Questions & Answers

1. **[Scope]** Phase 5 includes interactive graph.html (vis-network). Is this required for the demo or just nice-to-have?
   - Options: Required | Nice-to-have — skip | Replace with ASCII/table
   - **Answer:** Nice-to-have — skip for now
   - **Rationale:** Saves ~2h in Phase 5. GRAPH_REPORT.md + benchmark numbers sufficient to prove the POC. HTML viz is a Phase 6 stretch.

2. **[Extraction Scope]** Phase 1 extraction: how many relation types to capture in v1?
   - Options: Core only (imports/calls/contains/method) | Rich (+ inherits/implements/decorators/type_ref) | Minimal (imports+calls)
   - **Answer:** Rich — add inherits, implements, decorators, type_reference
   - **Rationale:** Richer graph → more surprising connections → stronger benchmark numbers. ts-morph APIs for these are straightforward. Worth the extra ~1h in Phase 1.

3. **[Scope]** Demo corpus: what real TS/JS project for the final benchmark?
   - Options: graphify-ts itself | Well-known small TS lib | User's own project
   - **Answer:** User's own existing TS project (to be provided during Week 3)
   - **Rationale:** Most relevant casestudy context. Phase 5 demo script should be parametrized to accept any path.

4. **[Architecture]** Claude proxy — should LLM-based extraction be in scope?
   - Options: No (AST-only) | Yes — add optional LLM pass | Separate --llm flag
   - **Answer:** Yes — add optional LLM pass in Phase 4 or 5
   - **Rationale:** jsdoc/comment extraction via Claude proxy adds INFERRED semantic edges, improving surprising connections. Add as `--llm` flag in Phase 5; AST-only remains the default.

5. **[Distribution]** Package distribution: how should graphify-ts be usable?
   - Options: npx graphify-ts (npm publish) | Local script only | Importable library + CLI
   - **Answer:** Local script only — no npm publish
   - **Rationale:** POC scope. Run via `tsx src/index.ts` or `node dist/index.ts`. Remove bin + publish steps from Phase 5.

#### Confirmed Decisions
- graph.html: **skipped** — out of scope for POC
- Extraction richness: **rich** (inherits, implements, decorators, type_reference added to Phase 1)
- Demo project: **user's own TS project** — script accepts any path
- LLM pass: **optional `--llm` flag** in Phase 5 using Claude proxy
- Distribution: **local script only** — no npm publish

#### Action Items
- [ ] Phase 1: add inherits, implements, decorators, type_reference to extract.ts plan
- [ ] Phase 5: remove graph.html / vis-network; add `--llm` flag with Claude proxy integration
- [ ] Phase 5: remove npm publish steps; keep local `tsx`/`node dist` usage
- [ ] Phase 5 demo: parameterize demo script to accept any TS project path

#### Impact on Phases
- Phase 1: Add 4 extra relation types to extraction scope
- Phase 5: Remove HTML viz; add optional LLM pass; remove npm publish