// install.ts — install/uninstall graphify-ts Claude Code skill + PreToolUse hook
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

// Paths relative to this compiled file: dist/install.js → src/hook-pre-tool.cjs
const SKILL_MD_SRC = path.join(__dirname, '..', 'skill', 'SKILL.md');
const HOOK_SCRIPT_SRC = path.join(__dirname, 'hook-pre-tool.cjs');

const SKILL_DIR = path.join(os.homedir(), '.claude', 'skills', 'graphify-ts');
const HOOK_DEST = path.join(os.homedir(), '.claude', 'hooks', 'graphify-ts-pre-tool.cjs');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

function readSettings(): Record<string, unknown> {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
}

function patchSettingsAdd(settings: Record<string, unknown>, hookCommand: string): void {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const preToolUse = (hooks.PreToolUse ?? []) as Array<Record<string, unknown>>;

  // Idempotent: check if already registered by command value
  const entry = preToolUse.find((e) => {
    const innerHooks = (e.hooks ?? []) as Array<Record<string, unknown>>;
    return innerHooks.some((h) => h.command === hookCommand);
  });

  if (!entry) {
    preToolUse.push({
      matcher: 'Glob|Grep',
      hooks: [{ type: 'command', command: hookCommand }],
    });
    hooks.PreToolUse = preToolUse;
    settings.hooks = hooks;
  }
}

function patchSettingsRemove(settings: Record<string, unknown>, hookCommand: string): void {
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  if (!hooks) return;
  const preToolUse = (hooks.PreToolUse ?? []) as Array<Record<string, unknown>>;
  hooks.PreToolUse = preToolUse.filter((e) => {
    const innerHooks = (e.hooks ?? []) as Array<Record<string, unknown>>;
    return !innerHooks.some((h) => h.command === hookCommand);
  });
  settings.hooks = hooks;
}

export async function install(): Promise<void> {
  console.log('graphify-ts install\n');
  console.log(`  Skill:    ${path.join(SKILL_DIR, 'SKILL.md')}`);
  console.log(`  Hook:     ${HOOK_DEST}`);
  console.log(`  Settings: ${SETTINGS_PATH}\n`);

  const ok = await confirm('Proceed? (y/N) ');
  if (!ok) {
    console.log('Aborted.');
    return;
  }

  // 1. Copy SKILL.md
  fs.mkdirSync(SKILL_DIR, { recursive: true });
  fs.copyFileSync(SKILL_MD_SRC, path.join(SKILL_DIR, 'SKILL.md'));
  console.log('✓ Skill installed:', path.join(SKILL_DIR, 'SKILL.md'));

  // 2. Copy hook script
  fs.mkdirSync(path.dirname(HOOK_DEST), { recursive: true });
  fs.copyFileSync(HOOK_SCRIPT_SRC, HOOK_DEST);
  console.log('✓ Hook script copied:', HOOK_DEST);

  // 3. Patch settings.json — merge hook entry (idempotent)
  const settings = readSettings();
  patchSettingsAdd(settings, `node "${HOOK_DEST}"`);
  writeSettings(settings);
  console.log('✓ PreToolUse hook registered in', SETTINGS_PATH);

  console.log('\n✓ graphify-ts Claude Code integration ready.');
  console.log('  Hook fires before Glob/Grep when graphify-ts-out/GRAPH_REPORT.md exists.');
}

export async function uninstall(): Promise<void> {
  console.log('graphify-ts uninstall\n');
  console.log(`  Skill:    ${path.join(SKILL_DIR, 'SKILL.md')}`);
  console.log(`  Hook:     ${HOOK_DEST}`);
  console.log(`  Settings: ${SETTINGS_PATH}\n`);

  const ok = await confirm('Remove all graphify-ts Claude Code artifacts? (y/N) ');
  if (!ok) {
    console.log('Aborted.');
    return;
  }

  // 1. Remove skill dir
  if (fs.existsSync(SKILL_DIR)) {
    fs.rmSync(SKILL_DIR, { recursive: true, force: true });
    console.log('✓ Skill removed:', SKILL_DIR);
  } else {
    console.log('- Skill not found (already removed)');
  }

  // 2. Remove hook script
  if (fs.existsSync(HOOK_DEST)) {
    fs.rmSync(HOOK_DEST, { force: true });
    console.log('✓ Hook script removed:', HOOK_DEST);
  } else {
    console.log('- Hook script not found (already removed)');
  }

  // 3. Remove hook entry from settings.json
  const settings = readSettings();
  patchSettingsRemove(settings, `node "${HOOK_DEST}"`);
  writeSettings(settings);
  console.log('✓ PreToolUse hook entry removed from', SETTINGS_PATH);

  console.log('\n✓ graphify-ts uninstalled.');
}
