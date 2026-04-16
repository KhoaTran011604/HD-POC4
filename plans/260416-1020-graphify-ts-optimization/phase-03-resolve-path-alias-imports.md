# Phase 3: Resolve Path-Alias Imports

## Context
- Plan: [plan.md](plan.md)
- Research: [research report](../reports/research-260416-1006-graphify-ts-optimization.md) — P2
- Depends on: Phase 1 (contains removal reduces noise before adding new edges)

## Overview
- **Priority:** P2 (high impact, medium effort)
- **Status:** pending
- **Effort:** 1h
- **Description:** Fix broken import resolution that leaves 67% of files isolated. Current code skips all non-relative imports (`@/...` path aliases), losing most inter-file connections in Next.js/TS projects.

## Key Insights
- `extract-helpers.ts:44`: `if (!specifier.startsWith('.')) continue;` — kills ALL path-alias imports
- In Next.js projects, most imports use `@/` alias from tsconfig.json `paths`
- ts-morph's `getModuleSpecifierSourceFile()` already resolves aliases IF the Project loads tsconfig
- Current `cli.ts:58-61` creates Project WITHOUT tsconfig → ts-morph can't resolve aliases

## Requirements
- Load target project's `tsconfig.json` into ts-morph Project
- Remove the relative-only guard in `extractImports()`
- Instead, filter by: skip imports with no resolved source file (= external/node_modules)
- Handle missing tsconfig gracefully (fallback to current behavior)

## Architecture
Two changes needed:
1. **cli.ts** — pass `tsConfigFilePath` to ts-morph `Project` constructor
2. **extract-helpers.ts** — replace `startsWith('.')` guard with resolved-file check

```
Before: specifier.startsWith('.') → skip @/... → 67% files isolated
After:  imp.getModuleSpecifierSourceFile() → null = external, skip; non-null = internal, keep
```

## Related Code Files
- **Modify:** `graphify-ts/src/cli.ts` — add tsconfig loading to Project constructor (L58-61)
- **Modify:** `graphify-ts/src/extract-helpers.ts` — replace relative-import guard (L44)
- **Read:** `graphify-ts/src/collect.ts` — understand file collection for context

## Implementation Steps
1. In `cli.ts`, find tsconfig.json in root:
   ```ts
   const tsConfigPath = join(root, 'tsconfig.json');
   const projectOpts: any = {
     compilerOptions: { allowJs: true, skipLibCheck: true },
     skipAddingFilesFromTsConfig: true,
   };
   if (existsSync(tsConfigPath)) {
     projectOpts.tsConfigFilePath = tsConfigPath;
   }
   const project = new Project(projectOpts);
   ```
2. In `extract-helpers.ts:extractImports()`, replace the guard:
   ```ts
   // OLD:
   if (!specifier.startsWith('.')) continue;
   const resolved = imp.getModuleSpecifierSourceFile();
   if (!resolved) continue;

   // NEW:
   const resolved = imp.getModuleSpecifierSourceFile();
   if (!resolved) continue; // external (node_modules) or unresolvable
   ```
   Just remove the `startsWith('.')` check — `getModuleSpecifierSourceFile()` returns null for external modules anyway.
3. Clear cache and run CLI
4. Verify import edges now include `@/...` resolved paths

## Todo
- [ ] Add tsconfig.json loading to cli.ts Project constructor
- [ ] Remove `startsWith('.')` guard in extract-helpers.ts
- [ ] Clear cache
- [ ] Validate: run CLI, count import edges (should increase significantly)
- [ ] Verify no external/node_modules imports leak through

## Success Criteria
- Import edges increase from ~6 to ~20+ (for HD-POC4 project)
- Connected files increase from 33% to 80%+
- No node_modules imports appear in graph
- CLI runs without errors on projects with and without tsconfig.json

## Risk Assessment
- **Medium risk:** ts-morph might resolve some node_modules imports if package has types
  - Mitigation: `getModuleSpecifierSourceFile()` returns the `.d.ts` file, which won't be in our collected files → `fileId()` will create orphan targets that `build.ts:18` already skips (`if (!graph.hasNode(...)) continue`)
- **Low risk:** projects without tsconfig.json
  - Mitigation: conditional tsconfig loading with fallback

## Security Considerations
None — reads only tsconfig.json (public config).

## Next Steps
Phase 4: JSX component usage edges
