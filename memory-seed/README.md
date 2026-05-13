# Memory Seed

This folder contains Claude Code project memory that should be installed on any new machine
where you clone and work on this repo. It captures architectural decisions, anti-patterns, and
project context that Claude would otherwise have to rediscover from scratch each session.

---

## What's included

| File | Type | Content |
|------|------|---------|
| `memory/MEMORY.md` | Index | Table of contents for all memory entries |
| `memory/project-h1-h4-fixes.md` | Project | H1–H4 fixes from the 2026-05-11 review — what changed and why |
| `memory/feedback-k6-patterns.md` | Feedback | k6 anti-patterns Claude must avoid in this codebase |

> The `.claude/` folder (skills, commands, settings) is already part of the repo and
> is loaded automatically — you don't need to do anything for those.

---

## How to install on a new PC

### Step 1 — Find your project's encoded path

Claude Code stores per-project memory under:

```
~/.claude/projects/<encoded-path>/memory/
```

The encoded path is derived from the **absolute path** of the project on your machine,
with each `:`, `\`, and `.` character replaced by `-`.

**Examples:**

| Absolute project path | Encoded folder name |
|-----------------------|---------------------|
| `C:\Users\alice\Documents\k6-ecommerce-framework` | `C--Users-alice-Documents-k6-ecommerce-framework` |
| `C:\Dev\LoadTest\k6-ecommerce-framework` | `C--Dev-LoadTest-k6-ecommerce-framework` |
| `/home/alice/projects/k6-ecommerce-framework` | `-home-alice-projects-k6-ecommerce-framework` |

**Quickest way to find it:** Open Claude Code from inside the project directory, then check
what folder appeared under `~/.claude/projects/`.

On Windows:
```powershell
ls "$env:USERPROFILE\.claude\projects"
```

On macOS / Linux:
```bash
ls ~/.claude/projects
```

### Step 2 — Copy the memory files

Once you know your encoded path, run (adjust the path to match your machine):

**Windows (PowerShell):**
```powershell
$dest = "$env:USERPROFILE\.claude\projects\<encoded-path>\memory"
New-Item -ItemType Directory -Force $dest
Copy-Item "memory-seed\memory\*" $dest
```

**macOS / Linux:**
```bash
dest="$HOME/.claude/projects/<encoded-path>/memory"
mkdir -p "$dest"
cp memory-seed/memory/* "$dest/"
```

### Step 3 — Verify

Open a new Claude Code session in this project directory. In the first message, ask:

> "What k6 patterns should I avoid in this project?"

Claude should answer from memory without you having to re-explain the review findings.

---

## Keeping memory-seed up to date

Whenever Claude saves new memory entries for this project, copy them back here so other
machines stay in sync:

```powershell
# Windows
Copy-Item "$env:USERPROFILE\.claude\projects\<encoded-path>\memory\*" "memory-seed\memory\"
```

```bash
# macOS / Linux
cp ~/.claude/projects/<encoded-path>/memory/* memory-seed/memory/
```
