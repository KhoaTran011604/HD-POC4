// AST extraction helpers: ID generation, import/arrow-function extraction, call graph
import {
  SourceFile,
  Project,
  SyntaxKind,
  Node,
  ArrowFunction,
  FunctionExpression,
  FunctionDeclaration,
  MethodDeclaration,
} from 'ts-morph';
import { relative } from 'path';
import type { GraphEdge, GraphNode } from './types.js';

// ── ID helpers ──────────────────────────────────────────────────────────────

export function makeId(
  type: string,
  name: string,
  filePath: string,
  root: string,
): string {
  const rel = relative(root, filePath).replace(/\\/g, '/');
  return `${type}::${name}::${rel}`;
}

export function fileId(filePath: string, root: string): string {
  return `file::${relative(root, filePath).replace(/\\/g, '/')}`;
}

// ── Import extraction ────────────────────────────────────────────────────────

export function extractImports(
  sf: SourceFile,
  srcId: string,
  filePath: string,
  root: string,
): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const imp of sf.getImportDeclarations()) {
    const specifier = imp.getModuleSpecifierValue();
    // Only track relative imports (internal project files)
    if (!specifier.startsWith('.')) continue;

    const resolved = imp.getModuleSpecifierSourceFile();
    if (!resolved) continue;

    const targetId = fileId(resolved.getFilePath(), root);
    edges.push({
      source: srcId,
      target: targetId,
      relation: 'imports',
      confidence: 'EXTRACTED',
    });
  }

  return edges;
}

// ── Arrow function detection ─────────────────────────────────────────────────

interface ArrowFuncInfo {
  name: string;
  line: number;
}

/** Find arrow/function-expression variable declarations in a source file. */
export function extractArrowFunctions(sf: SourceFile): ArrowFuncInfo[] {
  const results: ArrowFuncInfo[] = [];

  for (const varDecl of sf.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (!init) continue;
    const kind = init.getKind();
    if (
      kind !== SyntaxKind.ArrowFunction &&
      kind !== SyntaxKind.FunctionExpression
    ) {
      continue;
    }
    const name = varDecl.getName();
    const line = varDecl.getStartLineNumber();
    results.push({ name, line });
  }

  return results;
}

// ── Call graph extraction ────────────────────────────────────────────────────

/** Returns closest enclosing named callable ancestor id, or null. */
function getCallerNodeId(
  node: Node,
  filePath: string,
  root: string,
): string | null {
  let cur: Node | undefined = node.getParent();
  while (cur) {
    if (
      Node.isFunctionDeclaration(cur) ||
      Node.isMethodDeclaration(cur) ||
      Node.isConstructorDeclaration(cur)
    ) {
      const decl = cur as FunctionDeclaration | MethodDeclaration;
      const name = 'getName' in decl ? (decl as FunctionDeclaration | MethodDeclaration).getName?.() ?? '?' : '?';
      const kind = Node.isMethodDeclaration(cur) ? 'method' : 'function';
      return makeId(kind, name, filePath, root);
    }
    if (Node.isArrowFunction(cur) || Node.isFunctionExpression(cur)) {
      const af = cur as ArrowFunction | FunctionExpression;
      const parent = af.getParent();
      if (Node.isVariableDeclaration(parent)) {
        return makeId('function', parent.getName(), filePath, root);
      }
    }
    cur = cur.getParent();
  }
  return null;
}

/** Extract 'calls' edges from all CallExpressions in the source file. */
export function extractCallGraph(
  sf: SourceFile,
  _project: Project,
  knownNodeIds: Set<string>,
  filePath: string,
  root: string,
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const callExpr of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callerNodeId = getCallerNodeId(callExpr, filePath, root);
    if (!callerNodeId) continue;

    const sym = callExpr.getExpression().getSymbol();
    if (!sym) continue;

    for (const decl of sym.getDeclarations()) {
      const declFile = decl.getSourceFile().getFilePath();
      const declLine = decl.getStartLineNumber();

      // Only track internal calls (declarations we extracted)
      let calleeId: string | null = null;
      if (Node.isFunctionDeclaration(decl) || Node.isArrowFunction(decl) || Node.isFunctionExpression(decl)) {
        const fd = decl as FunctionDeclaration;
        const name = fd.getName?.() ?? null;
        if (!name) continue;
        calleeId = makeId('function', name, declFile, root);
      } else if (Node.isMethodDeclaration(decl)) {
        const md = decl as MethodDeclaration;
        const name = md.getName();
        calleeId = makeId('method', name, declFile, root);
      }

      if (!calleeId || !knownNodeIds.has(calleeId)) continue;

      const edgeKey = `${callerNodeId}->${calleeId}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);

      edges.push({
        source: callerNodeId,
        target: calleeId,
        relation: 'calls',
        confidence: 'EXTRACTED',
      });
    }
  }

  return edges;
}

// ── Type reference extraction ────────────────────────────────────────────────

/** Extract type_reference edges from a source file to known nodes. */
export function extractTypeRefs(
  sf: SourceFile,
  knownNodeIds: Set<string>,
  filePath: string,
  root: string,
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const srcId = fileId(filePath, root);
  const seen = new Set<string>();

  for (const typeRef of sf.getDescendantsOfKind(SyntaxKind.TypeReference)) {
    const sym = typeRef.getType().getSymbol();
    if (!sym) continue;
    for (const decl of sym.getDeclarations()) {
      const declFile = decl.getSourceFile().getFilePath();
      let targetId: string | null = null;
      if (Node.isClassDeclaration(decl)) {
        targetId = makeId('class', decl.getName() ?? '?', declFile, root);
      } else if (Node.isInterfaceDeclaration(decl)) {
        targetId = makeId('interface', decl.getName(), declFile, root);
      }
      if (!targetId || !knownNodeIds.has(targetId)) continue;
      const key = `${srcId}->${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: srcId, target: targetId, relation: 'type_reference', confidence: 'EXTRACTED' });
    }
  }

  return edges;
}
