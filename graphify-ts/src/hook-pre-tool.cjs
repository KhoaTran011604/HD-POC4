#!/usr/bin/env node
// PreToolUse hook — fires before Glob/Grep tool calls
// Injects GRAPH_REPORT.md reminder if knowledge graph exists in cwd
// CommonJS (.cjs) for Node compat without ESM flags

'use strict';

const fs = require('fs');
const path = require('path');

const input = JSON.parse(process.argv[2] ?? '{}');
const toolName = input.tool_name ?? '';

// Only act on file-search tools
if (!['Glob', 'Grep'].includes(toolName)) process.exit(0);

const reportPath = path.join(process.cwd(), 'graphify-ts-out', 'GRAPH_REPORT.md');
if (!fs.existsSync(reportPath)) process.exit(0);

const output = {
  permissionDecision: 'allow',
  systemMessage:
    'graphify-ts: Knowledge graph exists. ' +
    'Read graphify-ts-out/GRAPH_REPORT.md for god nodes and community structure ' +
    'before searching raw files. ' +
    'Use `node dist/cli.js --query "..."` for focused context.'
};

process.stdout.write(JSON.stringify(output));
