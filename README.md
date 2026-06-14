# claude-skill-audit

> Which of your installed Claude Code skills actually fire? Find your **dead weight** — skills that sit in your agent's consideration surface every session but you never invoke.

There's no built-in `claude skills --stats` (yet). So this reads your **local session logs** and shows which installed skills you've actually used vs. which have never fired once.

```bash
node skill-audit.mjs
```

```
  Sessions scanned      : 537
  Skills installed      : 83
  Skills actually used  : 11
  Dead weight (0 fires) : 72  (87% never invoked)
  Unused desc surface   : ~2876 tokens of skills you never use

  ── used (by invocations) ──
     112×  wiki-capture
      31×  autopilot
      ...
  ── dead weight (installed, never invoked) ──
        ·  math-olympiad
        ·  example-skill
        ...
```

## Why

Installed-but-unused skills aren't free: their names + descriptions sit in the model's
consideration surface every session — tokens + attention you spend on tools you never use.
The fix isn't "delete everything" — it's **knowing** what's dead so you can decide.

## How it works

- Discovers installed skills (`SKILL.md` files under `~/.claude`).
- Parses session logs (`~/.claude/projects/**/*.jsonl`) for skill invocations + slash commands.
- Reports used vs. never-invoked, plus a rough token estimate of unused skill descriptions.

## Honest caveats

- **100% local.** Reads `~/.claude` only. No network, no telemetry.
- It's a **rough signal** from log parsing, not exact stats.
- `"never fired"` ≠ `"must delete"` — situational skills (setup, upgrade, etc.) may be worth keeping.
- Command-style skills without a `SKILL.md` are listed separately so nothing heavy is hidden.

## Requirements

Node.js 18+. Zero dependencies.

## License

MIT
