// Main AST extractor: per-file ExtractionResult using ts-morph Project
import { Project, Node } from 'ts-morph';
import { relative } from 'path';
import type { ExtractionResult, GraphNode, GraphEdge } from './types.js';
import {
  makeId,
  fileId,
  extractImports,
  extractArrowFunctions,
  extractCallGraph,
  extractTypeRefs,
} from './extract-helpers.js';

/**
 * Extract nodes + edges from a single source file.
 * Caller must pre-load the file into the Project.
 */
export function extractFile(
  filePath: string,
  project: Project,
  root: string,
): ExtractionResult {
  const sf = project.getSourceFile(filePath);
  if (!sf) return { file: filePath, nodes: [], edges: [] };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const knownNodeIds = new Set<string>();

  // ── File node ──────────────────────────────────────────────────────────────
  const srcId = fileId(filePath, root);
  const relPath = relative(root, filePath).replace(/\\/g, '/');
  nodes.push({ id: srcId, label: relPath, type: 'file', source_file: relPath, source_location: 'L1' });
  knownNodeIds.add(srcId);

  // ── Interfaces ─────────────────────────────────────────────────────────────
  for (const iface of sf.getInterfaces()) {
    const name = iface.getName();
    const id = makeId('interface', name, filePath, root);
    nodes.push({ id, label: name, type: 'interface', source_file: relPath, source_location: `L${iface.getStartLineNumber()}` });
    knownNodeIds.add(id);
  }

  // ── Classes ────────────────────────────────────────────────────────────────
  for (const cls of sf.getClasses()) {
    const clsName = cls.getName();
    if (!clsName) continue;
    const clsId = makeId('class', clsName, filePath, root);
    nodes.push({ id: clsId, label: clsName, type: 'class', source_file: relPath, source_location: `L${cls.getStartLineNumber()}` });
    knownNodeIds.add(clsId);

    // Methods
    for (const method of cls.getMethods()) {
      const mName = method.getName();
      const mId = makeId('method', `${clsName}.${mName}`, filePath, root);
      nodes.push({ id: mId, label: mName, type: 'method', source_file: relPath, source_location: `L${method.getStartLineNumber()}` });
      knownNodeIds.add(mId);
      edges.push({ source: clsId, target: mId, relation: 'method', confidence: 'EXTRACTED' });
    }

    // Decorators on class
    for (const dec of cls.getDecorators()) {
      const decSym = dec.getExpression().getSymbol();
      if (!decSym) continue;
      for (const decDecl of decSym.getDeclarations()) {
        const decFile = decDecl.getSourceFile().getFilePath();
        const decId = makeId('function', dec.getName(), decFile, root);
        if (!knownNodeIds.has(decId)) continue;
        edges.push({ source: clsId, target: decId, relation: 'decorator', confidence: 'EXTRACTED' });
      }
    }
  }

  // ── Named functions ────────────────────────────────────────────────────────
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    const id = makeId('function', name, filePath, root);
    nodes.push({ id, label: name, type: 'function', source_file: relPath, source_location: `L${fn.getStartLineNumber()}` });
    knownNodeIds.add(id);
  }

  // ── Arrow / function-expression variables ──────────────────────────────────
  for (const { name, line } of extractArrowFunctions(sf)) {
    const id = makeId('function', name, filePath, root);
    if (knownNodeIds.has(id)) continue; // already extracted as named fn
    nodes.push({ id, label: name, type: 'function', source_file: relPath, source_location: `L${line}` });
    knownNodeIds.add(id);
  }

  // ── Import edges ───────────────────────────────────────────────────────────
  edges.push(...extractImports(sf, srcId, filePath, root));

  // ── Inherits / implements (resolved after nodes are built) ─────────────────
  for (const cls of sf.getClasses()) {
    const clsName = cls.getName();
    if (!clsName) continue;
    const clsId = makeId('class', clsName, filePath, root);

    const baseExpr = cls.getExtends();
    if (baseExpr) {
      const sym = baseExpr.getExpression().getSymbol();
      if (sym) {
        for (const decl of sym.getDeclarations()) {
          if (!Node.isClassDeclaration(decl)) continue;
          const baseId = makeId('class', decl.getName() ?? '?', decl.getSourceFile().getFilePath(), root);
          if (knownNodeIds.has(baseId)) {
            edges.push({ source: clsId, target: baseId, relation: 'inherits', confidence: 'EXTRACTED' });
          }
        }
      }
    }

    for (const impl of cls.getImplements()) {
      const sym = impl.getExpression().getSymbol();
      if (!sym) continue;
      for (const decl of sym.getDeclarations()) {
        if (!Node.isInterfaceDeclaration(decl)) continue;
        const ifaceId = makeId('interface', decl.getName(), decl.getSourceFile().getFilePath(), root);
        if (knownNodeIds.has(ifaceId)) {
          edges.push({ source: clsId, target: ifaceId, relation: 'implements', confidence: 'EXTRACTED' });
        }
      }
    }
  }

  // ── Call graph ─────────────────────────────────────────────────────────────
  edges.push(...extractCallGraph(sf, project, knownNodeIds, filePath, root));

  // ── Type references ────────────────────────────────────────────────────────
  edges.push(...extractTypeRefs(sf, knownNodeIds, filePath, root));

  return { file: filePath, nodes, edges };
}
