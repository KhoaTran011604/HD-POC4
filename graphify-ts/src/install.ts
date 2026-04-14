// install.ts — install/uninstall graphify-ts Claude Code skill + PreToolUse hook
// Supports --local (project .claude/) and global (~/.claude/) modes
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

const SKILL_MD_SRC = path.join(__dirname, '..', 'skill', 'SKILL.md');
const HOOK_SCRIPT_SRC = path.join(__dirname, 'hook-pre-tool.cjs');

function getInstallPaths(local: boolean): { skillDir: string; hookDest: string; settingsPath: string } {
  const base = local ? path.join(process.cwd(), '.claude') : path.join(os.homedir(), '.claude');
  return {
    skillDir:     path.join(base, 'skills', 'graphify-ts'),
    hookDest:     path.join(base, 'hooks', 'graphify-ts-pre-tool.cjs'),
    settingsPath: path.join(base, 'settings.json'),
  };
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

function readSettings(settingsPath: string): Record<string, unknown> {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settingsPath: string, settings: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
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

export async function install(local = false): Promise<void> {
  const { skillDir, hookDest, settingsPath } = getInstallPaths(local);
  const mode = local ? '[local → .claude/]' : '[global → ~/.claude/]';

  console.log(`graphify-ts install ${mode}\n`);
  console.log(`  Skill:    ${path.join(skillDir, 'SKILL.md')}`);
  console.log(`  Hook:     ${hookDest}`);
  console.log(`  Settings: ${settingsPath}\n`);

  const ok = await confirm('Proceed? (y/N) ');
  if (!ok) { console.log('Aborted.'); return; }

  // 1. Copy SKILL.md
  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(SKILL_MD_SRC, path.join(skillDir, 'SKILL.md'));
  console.log('✓ Skill installed:', path.join(skillDir, 'SKILL.md'));

  // 2. Copy hook script
  fs.mkdirSync(path.dirname(hookDest), { recursive: true });
  fs.copyFileSync(HOOK_SCRIPT_SRC, hookDest);
  console.log('✓ Hook script copied:', hookDest);

  // 3. Patch settings.json — merge hook entry (idempotent)
  const settings = readSettings(settingsPath);
  patchSettingsAdd(settings, `node "${hookDest}"`);
  writeSettings(settingsPath, settings);
  console.log('✓ PreToolUse hook registered in', settingsPath);

  console.log('\n✓ graphify-ts Claude Code integration ready.');
  console.log('  Hook fires before Glob/Grep when graphify-ts-out/GRAPH_REPORT.md exists.');
}

export async function uninstall(local = false): Promise<void> {
  const { skillDir, hookDest, settingsPath } = getInstallPaths(local);
  const mode = local ? '[local → .claude/]' : '[global → ~/.claude/]';

  console.log(`graphify-ts uninstall ${mode}\n`);
  console.log(`  Skill:    ${path.join(skillDir, 'SKILL.md')}`);
  console.log(`  Hook:     ${hookDest}`);
  console.log(`  Settings: ${settingsPath}\n`);

  const ok = await confirm('Remove all graphify-ts Claude Code artifacts? (y/N) ');
  if (!ok) { console.log('Aborted.'); return; }

  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
    console.log('✓ Skill removed:', skillDir);
  } else {
    console.log('- Skill not found (already removed)');
  }

  if (fs.existsSync(hookDest)) {
    fs.rmSync(hookDest, { force: true });
    console.log('✓ Hook script removed:', hookDest);
  } else {
    console.log('- Hook script not found (already removed)');
  }

  const settings = readSettings(settingsPath);
  patchSettingsRemove(settings, `node "${hookDest}"`);
  writeSettings(settingsPath, settings);
  console.log('✓ PreToolUse hook entry removed from', settingsPath);

  console.log('\n✓ graphify-ts uninstalled.');
}
