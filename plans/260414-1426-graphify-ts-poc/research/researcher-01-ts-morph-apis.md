# ts-morph API Research: Code Knowledge Graph Extraction

**Research Date:** 2026-04-14 | **Focus:** Knowledge graph building with ts-morph

---

## 1. Class & Method Extraction

### API: `SourceFile.getClasses()` + `ClassDeclaration.getMethods()`

**What they return:**
- `getClasses()` → `ClassDeclaration[]` (all classes in file, in order)
- `getMethods()` → `MethodDeclaration[]` (instance + static methods)
- Methods include name, modifiers, parameters, return type

**Getting metadata (line numbers, locations):**

```typescript
const sourceFile = project.addSourceFileAtPath('example.ts');
const classes = sourceFile.getClasses();

classes.forEach(cls => {
  console.log(`Class: ${cls.getName()}`);
  console.log(`Line: ${sourceFile.getLineAndColumnAtPos(cls.getStart())[0]}`);
  
  cls.getMethods().forEach(method => {
    console.log(`  Method: ${method.getName()}`);
    console.log(`  Line: ${sourceFile.getLineAndColumnAtPos(method.getStart())[0]}`);
    console.log(`  Params: ${method.getParameters().map(p => p.getName()).join(', ')}`);
  });
});
```

**Properties extraction:**
```typescript
cls.getProperties().forEach(prop => {
  console.log(`Property: ${prop.getName()}`);
});
```

---

## 2. Function Declaration & Arrow Functions

### API: `SourceFile.getFunctions()`

**Limitation:** `getFunctions()` returns **only** traditional function declarations. Arrow functions assigned to const are **NOT** included.

**To find arrow functions:**
```typescript
const sourceFile = project.addSourceFileAtPath('example.ts');

// Traditional functions
const declaredFuncs = sourceFile.getFunctions();

// Arrow functions: must search VariableDeclarations
const varDecls = sourceFile.getVariableDeclarations();
const arrowFuncs = varDecls.filter(v => 
  v.getInitializer()?.getKind() === SyntaxKind.ArrowFunction
);

const allFuncs = [
  ...declaredFuncs,
  ...arrowFuncs.map(v => ({
    name: v.getName(),
    node: v.getInitializerIfKind(SyntaxKind.ArrowFunction),
    line: sourceFile.getLineAndColumnAtPos(v.getStart())[0]
  }))
];
```

**Key Issue:** `getFunctions()` doesn't auto-discover arrow functions; must iterate VariableDeclarations manually.

---

## 3. Import Resolution

### API Pattern

**Three import styles:**
```typescript
// 1. Named imports
import { A, B } from 'module';
// Get with: sourceFile.getImportDeclaration(d => 
//   d.getModuleSpecifierValue() === 'module'
// ).getNamedImports()

// 2. Namespace import
import * as X from 'module';
// Get with: .getNamespaceImport()?.getName()

// 3. Default import
import X from 'module';
// Get with: .getDefaultImport()?.getText()
```

**Extraction code:**
```typescript
sourceFile.getImportDeclarations().forEach(imp => {
  const moduleName = imp.getModuleSpecifierValue();
  
  const named = imp.getNamedImports().map(n => n.getName());
  const namespace = imp.getNamespaceImport()?.getName();
  const defaultImp = imp.getDefaultImport()?.getText();
  
  console.log(`Import from ${moduleName}:`, { named, namespace, defaultImp });
});
```

---

## 4. Call-Graph: Resolving Function Calls

### API: `CallExpression` → `getSymbol()` → `getDeclarations()`

**Process:**
1. Find all CallExpression nodes
2. Get expression being called
3. Resolve symbol → get declarations

```typescript
sourceFile.forEachDescendant(node => {
  if (Node.isCallExpression(node)) {
    const exprNode = node.getExpression();
    const symbol = exprNode.getSymbol();
    
    if (symbol) {
      const decls = symbol.getDeclarations();
      decls.forEach(decl => {
        const sourceFile = decl.getSourceFile().getFilePath();
        const line = decl.getSourceFile()
          .getLineAndColumnAtPos(decl.getStart())[0];
        console.log(`Calls: ${symbol.getName()} @ ${sourceFile}:${line}`);
      });
    }
  }
});
```

**Cross-file limitation:** `getDeclarations()` is reliable but **requires the target file to be loaded in Project**. Won't resolve external npm modules.

---

## 5. Project Setup & Circular Import Prevention

### Memory & Performance

**For 50 files:** Load all into one Project if < 50K LOC (feasible).

```typescript
const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
  skipAddingFilesFromTsConfig: false // Load all from tsconfig
});

// Get all source files
const sourceFiles = project.getSourceFiles();
console.log(`Loaded ${sourceFiles.length} files`);
```

**Memory impact:** ~50-100MB for typical 50-file project. Risk: `findReferences()` on large graphs can cause OOM.

### Circular Import Prevention

**Strategy: Use visited Set + DFS**

```typescript
const visited = new Set<string>();
const graph = new Map<string, string[]>();

function buildCallGraph(sourceFile: SourceFile) {
  const filePath = sourceFile.getFilePath();
  if (visited.has(filePath)) return;
  visited.add(filePath);
  
  const calls: string[] = [];
  sourceFile.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const sym = node.getExpression().getSymbol();
      if (sym) {
        calls.push(sym.getName());
      }
    }
  });
  
  graph.set(filePath, calls);
}

project.getSourceFiles().forEach(sf => buildCallGraph(sf));
```

**Key:** Track visited files by path, not by object identity.

---

## 6. Critical Gotchas

| Gotcha | Impact | Mitigation |
|--------|--------|-----------|
| `getFunctions()` skips arrow functions | Incomplete call graph | Manually search VariableDeclarations |
| Cross-file resolution requires file in Project | Unresolved external deps | Only analyze internal code |
| `findReferences()` causes OOM on large graphs | Crash at scale | Use `getDeclarations()` instead; avoid global analysis |
| Symbol resolution order matters | Type aliases may change resolution | Call `getSymbol()` once, cache result |
| Circular imports cause infinite loops | Stack overflow | Use visited Set; track by file path |

---

## Sources

- [ts-morph Navigation Guide](https://ts-morph.com/navigation/)
- [ts-morph GitHub: Getting Method from CallExpression](https://github.com/dsherret/ts-morph/issues/802)
- [ts-morph Functions Documentation](https://ts-morph.com/details/functions)
- [ts-morph Project Setup & Instantiation](https://ts-morph.com/setup/)
- [ts-morph Import Resolution Discussion](https://github.com/dsherret/ts-morph/issues/927)
- [Getting Started with ts-morph ASTs](https://www.jameslmilner.com/posts/ts-ast-and-ts-morph-intro/)
