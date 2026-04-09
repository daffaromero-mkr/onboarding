# Onboarding MCP — User Guide

> How to install, use, and get the most out of the onboarding skills as a new engineer or team lead.

---

## What This Is

A set of Claude Code skills and hooks that turn any repo into a guided onboarding experience. It works in two parts:

- **`/onboarding`** — an interactive mentor session adapted to your background and your repo
- **`/doc-generator`** — an agent that reads your repo and writes `/docs/` if none exist

Both skills work in any repo — they don't need pre-configured division maps or tokens to start.

---

## Installation

### 1. Install Claude Code

If you don't have it yet:

```bash
npm install -g @anthropic-ai/claude-code
```

Then authenticate:

```bash
claude login
```

### 2. Copy the skills into your Claude config

Copy the `.claude/` folder from this repo into your home directory's Claude config:

```bash
# From this repo
cp -r .claude/skills/onboarding ~/.claude/skills/onboarding
cp -r .claude/skills/doc-generator ~/.claude/skills/doc-generator
cp -r .claude/hooks ~/.claude/hooks
```

Or if you're setting this up for a specific project repo, copy into the project:

```bash
cp -r .claude/ /path/to/your-repo/.claude/
```

### 3. Register the hooks

Add this to `~/.claude/settings.json` (global) or `.claude/settings.local.json` (per-repo):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/hooks/pre-onboarding.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const p=process.env.CLAUDE_TOOL_INPUT?JSON.parse(process.env.CLAUDE_TOOL_INPUT):{};const path=p.file_path||p.path||'';if(path.match(/\\.onboarding\\/signals\\/topic-.+\\.json$/)){require('child_process').execFileSync('node',['~/.claude/hooks/post-topic-quiz.js'],{stdio:'inherit'})}\""
          }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const p=process.env.CLAUDE_TOOL_INPUT?JSON.parse(process.env.CLAUDE_TOOL_INPUT):{};const path=p.file_path||p.path||'';if(path.match(/\\.onboarding\\/signals\\/graduation\\.json$/)){require('child_process').execFileSync('node',['~/.claude/hooks/post-graduation.js'],{stdio:'inherit'})}\""
          }
        ]
      }
    ]
  }
}
```

### 4. (Optional) Confluence integration

If your team has a Confluence API token, add it to your environment to enable session summaries:

```bash
export CONFLUENCE_URL="https://your-org.atlassian.net/wiki"
export CONFLUENCE_API_TOKEN="your_token_here"
```

The system works without this. Confluence summaries are written if available, silently skipped if not.

---

## Quick Start

Open Claude Code in any repo and type:

```
/onboarding
```

That's it. Everything else is automatic.

---

## What Happens Step by Step

### Step 1 — Docs Resolution (before the session opens)

The `pre-onboarding.js` hook fires first and scans the repo for existing documentation:

```
✓ Context ready — 4/4 topics covered (quickbook)
```

It checks, in order:
1. `/docs/codebase.md`, `/docs/workflow.md`, `/docs/domain.md`, `/docs/system-design.md`
2. `.claude/skills/onboarding/SKILL.md` (legacy skill)
3. `CLAUDE.md`
4. `README.md`

**It reads all of them** — it doesn't stop at the first match. README is always included. The more docs you have, the richer the session.

It also scores completeness:

```
⚙️  Missing docs for: domain, system-design. Generating...
```

If any of the four topics are missing, the doc-generator agent runs automatically before the session opens. This only happens once — after that, `/docs/` is committed to the repo.

### Step 2 — Doc Generation (only if docs are missing)

The `/doc-generator` agent reads your repo using Claude's tools — not shell scripts — so it actually understands the code:

```
⚙️  Generating docs for: domain, system-design
   Repo: quickbook
   This only runs once and saves to /docs/
```

It runs four analyzers in parallel, each targeting one file:

| Analyzer | Reads | Writes |
|----------|-------|--------|
| Codebase Analyzer | File tree, largest models, service layer, routes | `docs/codebase.md` |
| Workflow Analyzer | CI config, PR templates, Makefile, deploy scripts | `docs/workflow.md` |
| Domain Inferencer | Model files, DB schema, service namespaces | `docs/domain.md` |
| Architecture Synthesizer | External calls, queue config, env vars, DB config | `docs/system-design.md` |

Takes 2–5 minutes on a large repo. **Runs once, then never again** unless you ask.

Generated files include this header:

```
> AUTO-GENERATED on 2026-04-09 — review and commit to keep accurate.
> Inaccuracies? Edit this file and open a PR.
```

Review them, fix anything wrong, and commit. They're owned by the team now.

### Step 3 — Session Opens

You'll be asked two things immediately:

1. **Language** — Bahasa Indonesia or English. The full session follows your choice.
2. **Your name** — used throughout the session and in your personal graduation letter.

Your name is resolved this way if you skip:
1. From your session answer
2. From `git config user.name`
3. From your git email prefix
4. Falls back to "there"

### Step 4 — Background Questions (Phase 1)

The mentor builds a picture of who you are before any technical content:

- Experience level (fresh grad → senior)
- Tech background (Java / Python / Go / JS / PHP / Ruby)
- Confidence level on a 1–5 scale
- Which domain/squad you're joining
- What success looks like for you in 3 months

These answers change everything. A Java engineer gets Rails explained as Spring analogues. A fresh grad gets slower pacing. A senior engineer goes straight to the Mekari-specific landmines.

### Step 5 — Codebase Tour (Phases 2–4)

Content is driven entirely by your repo's `/docs/` files — not hardcoded knowledge. The session covers:

- How the repo is organized (from `docs/codebase.md`)
- Danger zones — large, callback-heavy, or highly-connected files
- Callbacks and what fires when you call `.save!`
- Feature flags (if your repo uses them)
- Soft deletes (if your repo uses `acts_as_paranoid` or equivalent)
- Service objects and background jobs
- Rails console (or equivalent) — how to explore safely

The mentor also reads the live repo if docs are incomplete — it won't make things up.

### Step 6 — Knowledge Challenges (Phase 4.5, optional)

After the tour, you're offered optional mini-challenges. Each is a short scenario based on your actual repo:

```
Challenge: If a bug report says "Invoice total is wrong"
           which directory do you start in?

  → app/services/   (business logic layer)
  → app/models/     (data and validations)
  → app/controllers/ (request handling)
```

XP is awarded for correct answers. No answer is shamed — wrong answers get an explanation.

**After you complete each topic's challenges, a topic report is saved automatically:**

```
.onboarding/
└── session-2026-04-09.json   ← built up as you go
```

This is a local file, never shared. It's what the graduation letter is built from.

### Step 7 — Real Work Simulation (Phase 6)

A full ticket walkthrough — from reading the ticket to verifying in staging. Eight steps, each with a question. Covers:

1. What to do before touching code
2. How to trace from route → controller → service → model
3. How to reproduce safely in the console (scoped by company/tenant)
4. Root cause hypotheses (data vs. callbacks vs. async jobs)
5. Making the change safely (feature flags)
6. Writing the right test
7. Writing a PR description that earns trust
8. Staging verification protocol

### Step 8 — Graduation

When you complete all phases (or use a cheat code), the graduation banner appears.

**Two things happen automatically:**

1. **Confluence summary** (if MCP is configured) — written to your onboarding page, tagged to your manager. Structured: topics covered, XP, open questions, next steps.

2. **Personal graduation letter** — written to `.onboarding/your-onboarding-letter.md` on your machine. Not sent anywhere. Just for you.

The letter is written in the voice of a senior engineer who watched your session. It references specific things you did — topics you aced, questions you asked, one area to watch out for. It's not a report. It reads like a note from a human.

```
Hey Budi — you made it.

You moved through the workflow section with real confidence...
Your question about "concern vs service object" was exactly
the right question to ask before your first ticket...

One thing to keep in mind: STI models tripped you up a bit.
Before you touch those areas, just ping a senior first...
```

---

## The `/doc-generator` Skill

You can run the doc generator manually at any time:

```
/doc-generator
```

Use this when:

- Your repo has no `/docs/` at all and you want to generate them before onboarding
- Docs exist but are stale and need a full refresh
- You're the team lead setting up a new repo for your team

### What it detects automatically

The agent detects your tech stack from config files, then adapts its analysis accordingly:

| Stack | Detected from |
|-------|--------------|
| Ruby / Rails | `Gemfile`, `config/routes.rb` |
| Node / TypeScript | `package.json`, `tsconfig.json` |
| Python | `pyproject.toml`, `requirements.txt` |
| Go | `go.mod` |
| Java / Spring | `pom.xml`, `build.gradle` |
| PHP / Laravel | `composer.json` |

It also detects:
- CI/CD system (GitHub Actions, GitLab CI, CircleCI, Jenkins)
- Test framework (RSpec, Jest, pytest, JUnit)
- Queue system (Sidekiq, Celery, BullMQ, Kafka, RabbitMQ)
- Database (PostgreSQL, MySQL, MongoDB — from config files)

### Forcing specific topics

If you only need to regenerate one doc:

Write or delete the file you want regenerated, then create a manual request:

```bash
# Create a request to regenerate only domain.md
mkdir -p .onboarding
cat > .onboarding/doc-generation-request.json << 'EOF'
{
  "topics_to_generate": ["domain"],
  "repo_name": "your-repo-name",
  "repo_remote": "git@github.com:org/repo.git"
}
EOF

# Then run
/doc-generator
```

---

## Output Files Reference

### `/docs/` (committed to repo, owned by team)

```
docs/
├── system-design.md   ← Tech stack, architecture, external deps, data flow
├── codebase.md        ← Folder structure, key files, patterns, danger zones
├── domain.md          ← Business entities, glossary, domain rules
└── workflow.md        ← Local setup, branch naming, PR lifecycle, CI/CD, deploy
```

Every file has an auto-generated header with the date. Files are under 300 lines by design.

### `.onboarding/` (gitignored, local to your machine)

```
.onboarding/
├── session-context.json          ← Injected by pre-hook (docs + repo info)
├── session-state.json            ← Your name + language, written at Q0
├── session-YYYY-MM-DD.json       ← Topic reports, built up during session
├── your-onboarding-letter.md     ← Personal graduation letter
└── signals/
    ├── topic-codebase.json       ← Written by SKILL.md after codebase quiz
    ├── topic-workflow.json       ← Written after workflow quiz
    ├── topic-domain.json         ← Written after domain quiz
    ├── topic-culture.json        ← Written after culture section
    └── graduation.json           ← Triggers graduation hooks
```

The `signals/` files are ephemeral — they trigger the hooks and are read immediately. The session JSON and graduation letter persist.

---

## For Team Leads and Senior Engineers

### First time setup for a new repo

Run the doc generator once before your new joiner arrives:

```
/doc-generator
```

Review the four output files (`/docs/*.md`). They'll be mostly accurate but may miss things only humans know — institutional decisions, why certain things are named the way they are, team-specific norms.

Spend 15–20 minutes editing them. Commit. Every future new joiner benefits.

### Reading session reports

After an engineer's graduation, check Confluence (if configured) for their session summary. It shows:

- Which topics they completed and their XP per topic
- Concepts they demonstrated understanding of
- Concepts they struggled with
- Every question they asked during the session

This is more useful than a 1:1 check-in because it's specific. You know exactly what to follow up on.

### Keeping docs fresh

The pre-hook warns if `/docs/` files are older than 90 days:

```
⚠️  Some docs are over 90 days old — consider refreshing:
   • docs/workflow.md (94 days old)
```

When that happens, either re-run `/doc-generator` for those topics or update manually. Stale docs make the onboarding session less accurate.

### What the graduation letter looks like

After a session graduates, `.onboarding/your-onboarding-letter.md` is written to the engineer's machine. You won't see it — it's personal and local. But it references specific things from their session, so it's not generic. Engineers tend to keep it.

---

## Hook Architecture (for platform engineers)

If you're maintaining this system:

```
.claude/hooks/
├── package.json              ← { "type": "module" } — all scripts are ES modules
├── docs-resolver.js          ← Scans all doc levels, scores completeness per topic
├── pre-onboarding.js         ← PreToolUse: resolve docs → generate missing → inject context
├── run-doc-generator.js      ← Orchestrator: invokes doc-generator skill via claude --print
├── post-topic-quiz.js        ← PostToolUse: reads signal file, appends to session JSON
├── post-graduation.js        ← PostToolUse: writes Confluence summary + personal letter
└── utils/
    ├── engineer-name.js      ← Name resolution: session-state → git config → email → "there"
    └── today.js              ← Date/time helpers
```

### Hook trigger chain

```
/onboarding typed
       │
PreToolUse (Bash matcher)
  └── pre-onboarding.js
        ├── docs-resolver.js  → scores completeness
        ├── run-doc-generator.js  → only if topics missing
        └── writes session-context.json

Session runs
  │
  │  [after codebase quiz]  SKILL.md writes .onboarding/signals/topic-codebase.json
  │  PostToolUse (Write matcher, path: topic-*.json)
  │  └── post-topic-quiz.js → appends to session-{date}.json
  │
  │  [same for workflow, domain, culture]
  │
  │  [graduation]  SKILL.md writes .onboarding/signals/graduation.json
  │  PostToolUse (Write matcher, path: graduation.json)
  └── post-graduation.js
        ├── Confluence summary (silent no-op if no token)
        └── .onboarding/your-onboarding-letter.md
```

### Adding Confluence support

1. Get an API token from your Atlassian account settings (scoped to Engineering spaces)
2. Set environment variables:
   ```bash
   export CONFLUENCE_URL="https://mekari.atlassian.net/wiki"
   export CONFLUENCE_API_TOKEN="your_token"
   ```
3. In `settings.local.json`, change `"disabled": true` to `"disabled": false` on the confluence MCP server entry

The system checks for `CONFLUENCE_API_TOKEN` before making any calls. No token = no calls, no errors.

---

## Troubleshooting

### "No docs found — generating..." takes too long

Doc generation can take 3–5 minutes on large repos. This is expected and only happens once. If it times out, placeholder files are written to `/docs/` automatically and the session continues. Run `/doc-generator` manually afterward to get the real content.

### "The generated docs have wrong information"

Expected. The doc generator infers from code and marks inferences with `(inferred)`. Edit the file directly, correct what's wrong, submit a PR. The next new joiner gets accurate docs.

### "Graduation letter wasn't written"

Check `.onboarding/your-onboarding-letter.md`. If it doesn't exist:
1. Confirm the session reached graduation (the banner appeared)
2. Check if `post-graduation.js` hook is registered in `settings.local.json`
3. Run the hook manually: `node .claude/hooks/post-graduation.js`

### "Confluence summary not appearing"

Confluence is optional. Check that `CONFLUENCE_API_TOKEN` is set in your environment and that `"disabled": false` in the MCP server config. If the token is wrong or the space doesn't exist, the hook fails silently — check the hook output for errors.

### Hook not firing at all

Verify the hook is registered:

```bash
cat ~/.claude/settings.json | grep -A5 "PostToolUse"
```

Also confirm the `hooks/package.json` has `"type": "module"` — without this, the ES module imports fail silently.

### "I want to redo my onboarding from scratch"

Delete the session files and start fresh:

```bash
rm -rf .onboarding/
```

Then run `/onboarding` again. The `/docs/` files are preserved — only the personal session data is cleared.

---

## Requirements

| Requirement | Notes |
|-------------|-------|
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` |
| Node.js ≥ 18 | Required for hook scripts (ES modules) |
| Git repo with a remote | Used to identify the repo |
| `/docs/` or README | Minimum viable context (docs generated if absent) |
| Confluence API token | Optional — session summaries only |

---

## Questions and Feedback

Post in `#dx-feedback` on Slack or open an issue in the eng-platform repo.

If the onboarding session gave you wrong information, update `/docs/` in your repo — that's the fastest fix for everyone who comes after you.
