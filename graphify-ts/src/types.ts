// Shared types for graphify-ts knowledge graph pipeline

export type NodeType = 'file' | 'class' | 'function' | 'method' | 'interface';

export type EdgeRelation =
  | 'imports'        // file imports another file/module
  | 'contains'       // file/class contains a function/method/class
  | 'method'         // class owns a method
  | 'calls'          // function calls another function
  | 'inherits'       // class extends another class
  | 'implements'     // class implements an interface
  | 'type_reference' // type/generic reference
  | 'decorator'      // decorator applied to class/method
  | 'semantic_ref';  // INFERRED: semantic relationship from jsdoc/comments (LLM pass)

export type Confidence = 'EXTRACTED' | 'INFERRED';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  source_file: string;
  source_location: string; // "L{line}"
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
  confidence: Confidence;
}

export interface ExtractionResult {
  file: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
