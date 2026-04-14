// llm-extract.ts — optional LLM pass: extract jsdoc/comments → INFERRED edges via Claude proxy
// Called when --llm flag is passed; augments graph with semantic edges not visible to AST
import Anthropic from '@anthropic-ai/sdk';
import type { ExtractionResult, GraphEdge } from './types.js';

const MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap for extraction

const SYSTEM_PROMPT = `You are a code analyst. Given TypeScript source text, extract semantic relationships
between named symbols that are implied by JSDoc comments, inline comments, or doc-strings but NOT
captured by the AST (imports, calls, class hierarchy).

Return ONLY a JSON array of objects with shape:
{ "source": "<qualified name>", "target": "<qualified name>", "relation": "semantic_ref" }

Rules:
- Only return pairs where both source and target are real symbols in the provided code.
- Relation must be "semantic_ref".
- Return [] if nothing found.
- No explanation, only JSON.`;

interface LlmEdgeRaw {
  source: string;
  target: string;
  relation: string;
}

async function extractFromFile(
  client: Anthropic,
  result: ExtractionResult,
  fileSource: string,
): Promise<GraphEdge[]> {
  const knownIds = new Set(result.nodes.map((n) => n.label));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `File: ${result.file}\n\n\`\`\`typescript\n${fileSource}\n\`\`\`` }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '[]';

  let raw: LlmEdgeRaw[] = [];
  try {
    // Extract JSON array from response (may have extra whitespace/markdown fences)
    const match = text.match(/\[[\s\S]*\]/);
    raw = match ? (JSON.parse(match[0]) as LlmEdgeRaw[]) : [];
  } catch {
    return [];
  }

  return raw
    .filter((e) => knownIds.has(e.source) && knownIds.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      relation: 'semantic_ref' as const,
      confidence: 'INFERRED' as const,
    })) as GraphEdge[];
}

export async function llmExtract(
  results: ExtractionResult[],
  readFile: (p: string) => string,
): Promise<GraphEdge[]> {
  // Claude proxy: set ANTHROPIC_BASE_URL to route through your proxy.
  // The Anthropic SDK reads ANTHROPIC_BASE_URL automatically.
  // ANTHROPIC_API_KEY can be omitted when proxy handles auth (set to any non-empty string).
  const apiKey = process.env['ANTHROPIC_API_KEY'] ?? 'proxy';
  const baseURL = process.env['ANTHROPIC_BASE_URL']; // undefined = direct API

  if (!process.env['ANTHROPIC_API_KEY'] && !baseURL) {
    console.warn('[llm-extract] Neither ANTHROPIC_API_KEY nor ANTHROPIC_BASE_URL set — skipping LLM pass');
    return [];
  }

  const clientOpts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
  if (baseURL) {
    clientOpts.baseURL = baseURL;
    console.log(`[llm-extract] Using Claude proxy: ${baseURL}`);
  }

  const client = new Anthropic(clientOpts);
  const allEdges: GraphEdge[] = [];

  for (const result of results) {
    let source = '';
    try {
      source = readFile(result.file);
    } catch {
      continue;
    }
    // Skip files with no comments/jsdoc — quick heuristic
    if (!source.includes('/**') && !source.includes('//')) continue;

    try {
      const edges = await extractFromFile(client, result, source);
      allEdges.push(...edges);
    } catch (err) {
      console.warn(`[llm-extract] Failed on ${result.file}:`, (err as Error).message);
    }
  }

  console.log(`[llm-extract] Added ${allEdges.length} INFERRED edge(s) from LLM pass`);
  return allEdges;
}
