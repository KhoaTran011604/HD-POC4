# Phase 4: JSX Component Usage Edges

## Context
- Plan: [plan.md](plan.md)
- Research: [research report](../reports/research-260416-1006-graphify-ts-optimization.md) — P3
- Depends on: Phase 3 (import resolution needed to resolve JSX component origins)

## Overview
- **Priority:** P3 (high impact for React/Next.js codebases, medium effort)
- **Status:** pending
- **Effort:** 1h
- **Description:** Add `uses_component` edges for JSX element usage. `<Header />` in layout.tsx means layout uses Header — a critical relationship currently invisible in the graph.

## Key Insights
- React/Next.js codebases communicate primarily via JSX composition
- Current extractor has zero JSX awareness
- ts-morph provides `SyntaxKind.JsxOpeningElement` and `SyntaxKind.JsxSelfClosingElement`
- Symbol resolution on JSX tags links back to imported components

## Requirements
- Extract JSX opening elements and self-closing elements
- Resolve tag name to imported symbol
- Create `uses_component` edge from current file to component's source file
- Add `uses_component` to `EdgeRelation` type
- Handle HTML intrinsic elements (div, span) — skip them (no symbol or intrinsic symbol)

## Architecture
New function `extractJsxUsage()` in `extract-helpers.ts`:
```
File A (layout.tsx) contains <Header />
  → resolve Header symbol → imported from components/header.tsx
  → edge: file::layout.tsx --uses_component--> file::components/header.tsx
```

Edge source = current file node, target = component's source file node.

## Related Code Files
- **Modify:** `graphify-ts/src/extract-helpers.ts` — add `extractJsxUsage()` function
- **Modify:** `graphify-ts/src/extract.ts` — call `extractJsxUsage()` and push edges
- **Modify:** `graphify-ts/src/types.ts` — add `'uses_component'` to `EdgeRelation`

## Implementation Steps
1. In `types.ts`, add `| 'uses_component'` to `EdgeRelation` union
2. In `extract-helpers.ts`, add new function:
   ```ts
   export function extractJsxUsage(
     sf: SourceFile,
     srcId: string,
     filePath: string,
     root: string,
   ): GraphEdge[] {
     const edges: GraphEdge[] = [];
     const seen = new Set<string>();
     const jsxKinds = [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement];

     for (const kind of jsxKinds) {
       for (const jsx of sf.getDescendantsOfKind(kind)) {
         const tagName = jsx.getTagNameNode();
         const sym = tagName.getSymbol();
         if (!sym) continue; // intrinsic HTML element

         for (const decl of sym.getDeclarations()) {
           const declFile = decl.getSourceFile().getFilePath();
           const targetId = fileId(declFile, root);
           const key = `${srcId}->${targetId}`;
           if (seen.has(key) || targetId === srcId) continue;
           seen.add(key);
           edges.push({
             source: srcId,
             target: targetId,
             relation: 'uses_component',
             confidence: 'EXTRACTED',
           });
         }
       }
     }
     return edges;
   }
   ```
3. In `extract.ts`, import `extractJsxUsage` and add after import edges:
   ```ts
   edges.push(...extractJsxUsage(sf, srcId, filePath, root));
   ```
4. Clear cache and run CLI
5. Verify `uses_component` edges appear for JSX files

## Todo
- [ ] Add 'uses_component' to EdgeRelation type
- [ ] Implement extractJsxUsage() in extract-helpers.ts
- [ ] Call extractJsxUsage() in extract.ts
- [ ] Clear cache
- [ ] Validate: run CLI on a React/Next.js project, confirm uses_component edges

## Success Criteria
- `uses_component` edges appear for files with JSX usage
- HTML intrinsic elements (div, p, span) do NOT generate edges
- No duplicate edges per file pair
- Self-references excluded

## Risk Assessment
- **Medium risk:** some JSX tags may not resolve (dynamic components, forwardRef wrappers)
  - Mitigation: gracefully skip when `sym` is null
- **Low risk:** `.tsx` files not parsed as JSX
  - Mitigation: ts-morph handles JSX when file extension is `.tsx` and `jsx` compiler option is set

## Security Considerations
None.

## Next Steps
Phase 5: Query engine improvements
