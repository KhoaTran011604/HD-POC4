# Graphology + Claude Code Skill Research

## Topic 1: Graphology BFS Query & Louvain Community Detection

### BFS Traversal API (`graphology-traversal`)

**Import & Usage:**
```typescript
import { bfsFromNode } from 'graphology-traversal';
// or: import { bfsFromNode } from 'graphology-traversal/bfs';

bfsFromNode(graph, 'node1', (node, attr, depth) => {
  console.log(node, attr, depth);
  // Return true to stop traversal at this point
  return depth >= 3; // Stop at depth 3
});
```

**Signature:**
- `graph`: Graphology instance
- `startNode`: string|number (node ID)
- `callback(node, attr, depth)`: Invoked per node
  - `node`: current node ID
  - `attr`: node attributes object
  - `depth`: distance from start (0 at root)
- Returns `true` → stops traversal; `false/void` → continue

**Collecting Results:**
BFS doesn't return visited nodes directly. Collect in callback:
```typescript
const visited = new Set<string>();
const edges = [];
bfsFromNode(graph, 'nodeA', (node, attr, depth) => {
  if (depth > 3) return true; // Stop at depth 3
  visited.add(node);
  graph.neighbors(node).forEach(neighbor => {
    edges.push({ source: node, target: neighbor });
  });
});
```

### Louvain Community Detection (`graphology-communities-louvain`)

**API:**
```typescript
import louvain from 'graphology-communities-louvain';

// Returns Map<nodeId, communityId>
const communities = louvain(graph);

// Or directly assign to node attributes
louvain.assign(graph, { resolution: 0.8 });
// Then access via: graph.getNodeAttribute(nodeId, 'community')
```

**Return Type:**
- `Map<string|number, number>` where values = community integer IDs (0 to n)

**Options:**
- `resolution`: Higher = more communities (default ~1.0)
- `fastLocalMoves`: Optimization with queue
- `randomWalk`: Enable random traversal

**Finding "God Nodes" (Highest Degree):**
```typescript
const communityNodes = new Map<number, string[]>();
const communityDegrees = new Map<number, number[]>();

graph.nodes().forEach(nodeId => {
  const community = communities.get(nodeId);
  if (!communityNodes.has(community)) {
    communityNodes.set(community, []);
    communityDegrees.set(community, []);
  }
  communityNodes.get(community)!.push(nodeId);
  communityDegrees.get(community)!.push(graph.degree(nodeId));
});

// Get highest-degree node per community
const godNodes = Array.from(communityNodes.entries()).map(([cid, nodes]) => {
  const maxDegreeIdx = communityDegrees.get(cid)!.indexOf(
    Math.max(...communityDegrees.get(cid)!)
  );
  return nodes[maxDegreeIdx];
});
```

### JSON Serialization (`graphology`)

Built-in methods (no extra package needed):
```typescript
// Export as JSON
const json = graph.toJSON(); // Or: graph.export()
// Format: { attributes, nodes: [{key, attributes}], edges: [{key, source, target, attributes}] }

// Import from JSON
const newGraph = new Graph();
newGraph.import(json);
```

**No external package required** — `graphology` has native `toJSON()` and `import()` methods.

---

## Topic 2: Claude Code Skill + PreToolUse Hook

### SKILL.md Format

**Location:** `~/.claude/skills/{skillName}/SKILL.md`

**Structure:**
```yaml
---
name: my-skill
# name becomes the /slash-command (e.g., /my-skill)
description: Brief description for Claude's auto-activation
category: development
---

# Detailed markdown instructions here.
Claude reads this when the skill activates.
Include examples, step-by-step guides, API references.
```

**Key Fields:**
- `name` (required): Command name (e.g., `graphify` → `/graphify`)
- `description` (required): When Claude should auto-load this
- `category` (optional): For organization

### PreToolUse Hook in settings.json

**Location:** `~/.claude/settings.json`

**Structure:**
```json
{
  "PreToolUse": [
    {
      "matcher": "Bash|Write|Edit|Glob|Grep",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Your validation logic here"
        }
      ]
    }
  ]
}
```

**Hook Response Format:**
```json
{
  "hookSpecificOutput": {
    "permissionDecision": "allow|deny|ask",
    "updatedInput": {
      "command": "modified_command"
    }
  },
  "systemMessage": "Explanation for Claude"
}
```

**Available Matchers:** Bash, Write, Edit, Glob, Grep, Read, Bash+Git

### Injecting Context (like graphify GRAPH_REPORT.md)

**Mechanism:** PreToolUse hook fires **before every tool call**. To inject GRAPH_REPORT.md reminder:

1. **Hook watches Grep/Glob calls**
2. **Checks if GRAPH_REPORT.md exists**
3. **Injects system reminder** with file path before tool executes
4. **Claude receives context** from system message

**Example Hook (pseudocode):**
```json
{
  "PreToolUse": [
    {
      "matcher": "Glob|Grep",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Check for GRAPH_REPORT.md in cwd. If exists, inject reminder: 'Active graph context: {path_to_GRAPH_REPORT.md}'"
        }
      ]
    }
  ]
}
```

**Env Vars Available in Hook:** Standard shell env + `CLAUDE_CWD`, `CLAUDE_TOOL_NAME`, `CLAUDE_SESSION_ID`

---

## Key Findings

**Topic 1:**
- BFS callback returns visited nodes within depth limit; collect manually
- Louvain returns `Map<id, communityId>`; highest-degree nodes identifiable via `graph.degree()`
- JSON serialize/deserialize built-in; no external package

**Topic 2:**
- SKILL.md = YAML frontmatter + markdown instructions
- PreToolUse = JSON config in `settings.json` with matcher + hook type
- System reminder injection via hook response `systemMessage` field

---

## Sources
- [Graphology Traversal API](https://graphology.github.io/standard-library/traversal.html)
- [graphology-communities-louvain](https://graphology.github.io/standard-library/communities-louvain.html)
- [Graphology Serialization](https://graphology.github.io/serialization.html)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Claude Code Hook Development](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md)
