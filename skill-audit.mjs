#!/usr/bin/env node
// claude-skill-audit — Which of your installed Claude Code skills actually fire?
//
// There's no built-in `claude skills --stats` (yet), so this reads your local
// session logs and tells you which installed skills you've NEVER invoked —
// the "dead weight" sitting in your agent's consideration surface every session.
//
// 100% local. Reads ~/.claude only. No network. Rough signal, not exact stats.
//
//   node skill-audit.mjs

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLAUDE = join(homedir(), '.claude');
const PROJECTS = join(CLAUDE, 'projects');

// ── 1. discover installed skills (every SKILL.md under ~/.claude) ──
function walk(dir, out = [], depth = 0) {
  if (depth > 12) return out;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (p === PROJECTS || e.name === 'node_modules' || e.name === '.git') continue;
      walk(p, out, depth + 1);
    } else if (e.name === 'SKILL.md') {
      out.push(p);
    }
  }
  return out;
}

function parseSkill(file) {
  let txt = '';
  try { txt = readFileSync(file, 'utf8'); } catch { return null; }
  const fm = txt.match(/^---\s*([\s\S]*?)\s*---/);
  let name = null, desc = '';
  if (fm) {
    const nm = fm[1].match(/^name:\s*(.+)$/m);
    const dm = fm[1].match(/^description:\s*([\s\S]*?)(?:\n[a-zA-Z_-]+:|\n*$)/m);
    if (nm) name = nm[1].trim();
    if (dm) desc = dm[1].replace(/\s+/g, ' ').trim();
  }
  if (!name) name = file.split('/').slice(-2, -1)[0]; // fallback: parent dir
  return { name, desc };
}

const byName = new Map();
for (const f of walk(CLAUDE)) {
  const s = parseSkill(f);
  if (s && !byName.has(s.name)) byName.set(s.name, s);
}

// ── 2. count invocations across session logs ──
const usage = new Map();
function tally(text) {
  let m;
  const re = /"skill":\s*"([^"]+)"/g;            // Skill tool_use input
  while ((m = re.exec(text))) usage.set(m[1], (usage.get(m[1]) || 0) + 1);
  const cre = /<command-name>\/?([^<]+)<\/command-name>/g;  // slash commands
  while ((m = cre.exec(text))) {
    const n = m[1].trim();
    usage.set(n, (usage.get(n) || 0) + 1);
  }
}

let sessions = 0;
function scan(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith('.jsonl')) {
      sessions++;
      try { tally(readFileSync(p, 'utf8')); } catch { /* skip */ }
    }
  }
}
if (existsSync(PROJECTS)) scan(PROJECTS);

// match a usage key to an installed skill (handles namespaced "plugin:skill")
function countFor(name) {
  let c = 0;
  for (const [k, v] of usage) {
    const bare = k.includes(':') ? k.split(':').pop() : k;
    if (k === name || bare === name) c += v;
  }
  return c;
}

// ── 3. report ──
const tok = s => Math.round((s || '').length / 4); // rough token estimate
const installed = [...byName.values()];
const used = [], dead = [];
let deadTok = 0;
for (const s of installed) {
  const c = countFor(s.name);
  if (c > 0) used.push({ ...s, c });
  else { dead.push(s); deadTok += tok(s.desc); }
}
used.sort((a, b) => b.c - a.c);
const pct = installed.length ? Math.round((dead.length / installed.length) * 100) : 0;

// invocations that didn't match an installed SKILL.md (command-style skills),
// excluding built-in slash commands — so nothing heavily-used is hidden.
const BUILTIN = new Set(['clear','exit','model','compact','effort','help','init',
  'login','logout','status','resume','cost','doctor','mcp','hooks','context','config',
  'memory','bug','vim','agents','add-dir','ide','pr-comments','terminal-setup','upgrade','feedback']);
const names = new Set(installed.map(s => s.name));
const isInstalled = k => names.has(k) || names.has(k.includes(':') ? k.split(':').pop() : k);
const other = [];
for (const [k, v] of usage) {
  const bare = k.includes(':') ? k.split(':').pop() : k;
  if (isInstalled(k) || BUILTIN.has(bare)) continue;
  other.push({ name: k, c: v });
}
other.sort((a, b) => b.c - a.c);

const P = (...a) => console.log(...a);
P(`\n  claude-skill-audit  ·  100% local (reads ~/.claude only)\n`);
P(`  Sessions scanned      : ${sessions}`);
P(`  Skills installed      : ${installed.length}`);
P(`  Skills actually used  : ${used.length}`);
P(`  Dead weight (0 fires) : ${dead.length}  (${pct}% never invoked)`);
P(`  Unused desc surface   : ~${deadTok} tokens of skills you never use\n`);
P(`  ── used (by invocations) ──`);
for (const u of used) P(`   ${String(u.c).padStart(5)}×  ${u.name}`);
P(`\n  ── dead weight (installed, never invoked) ──`);
for (const d of dead) P(`        ·  ${d.name}`);
if (other.length) {
  P(`\n  ── used but no SKILL.md found (command-style; built-ins excluded) ──`);
  for (const o of other) P(`   ${String(o.c).padStart(5)}×  ${o.name}`);
}
P(`\n  note: rough signal from log parsing, not exact stats.`);
P(`        "never fired" ≠ "must delete" — situational skills may be worth keeping.\n`);
