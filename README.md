# mcp-onboarding

Universal engineer onboarding MCP server — repo-aware, doc-adaptive, works with any codebase.

When a new engineer opens any repo and types `/onboarding`, this MCP server:
1. Scans for existing docs (`docs/`, `CLAUDE.md`, `.claude/skills/`, `README.md`)
2. Generates missing `/docs/` files if none exist — written once, owned by the team
3. Runs an interactive adaptive mentor session tailored to the engineer's background
4. Saves a session summary and writes a personal graduation letter at the end

---

## Quick Start

### 1. Clone and build

```bash
git clone https://github.com/daffaromero-mkr/onboarding.git mcp-onboarding
cd mcp-onboarding
npm install
npm run build
```

### 2. Connect to Claude Code

Add to `~/.claude/settings.json` (global) or `.claude/settings.local.json` (per-repo):

```json
{
  "mcpServers": {
    "mcp-onboarding": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-onboarding/dist/index.js"]
    }
  }
}
```

Or use the Claude Code CLI:

```bash
claude mcp add mcp-onboarding node /absolute/path/to/mcp-onboarding/dist/index.js
```

### 3. Install the skill

```bash
mkdir -p ~/.claude/skills/onboarding
cp skill/SKILL.md ~/.claude/skills/onboarding/SKILL.md
```

To install into a specific repo instead of globally:

```bash
mkdir -p /path/to/your-repo/.claude/skills/onboarding
cp skill/SKILL.md /path/to/your-repo/.claude/skills/onboarding/SKILL.md
```

### 4. Register the hooks

Add to `~/.claude/settings.json` (global) or `.claude/settings.local.json` (per-repo):

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

Copy the hook scripts:

```bash
cp -r .claude/hooks ~/.claude/hooks
```

> **Note:** `hooks/package.json` must contain `"type": "module"` for the ES module imports to work. This is already set in the repo.

### 5. Run

Open Claude Code in any repository and type:

```
/onboarding
```

---

## How It Works

### Session flow

```
/onboarding
      │
PreToolUse hook (pre-onboarding.js)
  ├── scan_repo_docs    → check existing docs across all levels
  ├── check_docs_freshness → warn if any file > 90 days old
  └── generate_onboarding_docs → only if docs are missing
            │
            ▼
      /docs/ written to disk (codebase, workflow, domain, system-design)
            │
            ▼
Onboarding session opens
  ├── Q0: language (Bahasa Indonesia / English)
  ├── Q1-5: background questions (experience, tech, confidence, squad, goals)
  ├── Phases 2-4: codebase tour driven by /docs/ content
  ├── Phase 4.5: optional knowledge challenges with XP
  ├── Phase 6: real work simulation (full ticket walkthrough)
  └── Graduation
            │
PostToolUse hooks
  ├── post-topic-quiz.js   → appends to session-{date}.json after each topic
  └── post-graduation.js   → Confluence summary (optional) + graduation letter
```

### With existing docs

The MCP reads `/docs/`, `CLAUDE.md`, and any existing skills — and uses that content to drive the session. The mentor becomes a guide through the team's own documentation.

### Without docs

If no onboarding docs are found, `generate_onboarding_docs` runs automatically:

| Analyzer | Reads | Writes |
|----------|-------|--------|
| Codebase Analyzer | File tree, models, service layer, routes | `docs/codebase.md` |
| Workflow Analyzer | CI config, PR templates, Makefile, deploy scripts | `docs/workflow.md` |
| Domain Inferencer | Model files, DB schema, service namespaces | `docs/domain.md` |
| Architecture Synthesizer | External calls, queue config, env vars, DB config | `docs/system-design.md` |

Takes 2–5 minutes on a large repo. Runs once — subsequent sessions load from `/docs/` directly.

Generated files include a header:
```
> AUTO-GENERATED on 2026-04-09 — review and commit to keep accurate.
> Inaccuracies? Edit this file and open a PR.
```

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `scan_repo_docs` | Scan for CLAUDE.md, README, docs/, existing skills. Call this first. |
| `analyze_repo_structure` | Detect language, framework, CI/CD, test setup, key directories. |
| `generate_onboarding_docs` | Write four `/docs/` files when none exist. |
| `check_docs_freshness` | Warn if any `/docs/` files are older than 90 days (configurable). |
| `resolve_division` | Map git remote URL → product/division slug. |
| `save_session_notes` | Persist session summary to `.onboarding-sessions/`. |
| `list_past_sessions` | List previous sessions saved in the repo. |
| `bootstrap_onboarding` | One-shot: scan + analyze + generate docs + return full session context. |

---

## Repo Detection

Division is auto-detected from the git remote URL:

| Remote pattern | Division |
|---------------|----------|
| `quickbook`, `jurnal` | Mekari Jurnal |
| `talenta` | Mekari Talenta |
| `flex` | Mekari Flex |
| `klikpajak` | Klikpajak |
| `mekari-sign` | Mekari Sign |
| anything else | Derived from repo name |

To override: `/onboarding division=talenta` or pass `override_division` to `resolve_division`.

---

## Supported Tech Stacks

Auto-detected from project files:

- **Ruby on Rails** (`Gemfile`, `config/routes.rb`)
- **Node.js / TypeScript** (`package.json`, `tsconfig.json`) — Next.js, NestJS, Express, Vue, React
- **Python** (`requirements.txt`, `pyproject.toml`) — Django, FastAPI, Flask
- **Java / Spring Boot** (`pom.xml`, `build.gradle`)
- **Go** (`go.mod`) — Gin, Echo, Fiber
- **PHP / Laravel** (`composer.json`)

Also detects: CI/CD system, test framework, queue system (Sidekiq, Celery, BullMQ, Kafka), database.

---

## Optional: Confluence integration

Add your API token to enable graduation summaries written to Confluence:

```bash
export CONFLUENCE_URL="https://your-org.atlassian.net/wiki"
export CONFLUENCE_API_TOKEN="your_token_here"
```

Without this, the system runs fully — Confluence writes are silently skipped.

---

## Session output files

```
.onboarding/                          ← gitignored, local to engineer's machine
├── session-context.json
├── session-state.json
├── session-YYYY-MM-DD.json
├── your-onboarding-letter.md         ← personal graduation letter
└── signals/
    ├── topic-codebase.json
    ├── topic-workflow.json
    ├── topic-domain.json
    ├── topic-culture.json
    └── graduation.json

.onboarding-sessions/                 ← commit these for manager visibility
└── YYYY-MM-DD-engineer-name.md
```

---

## For team leads

Run the doc generator once before your new joiner arrives:

```
/onboarding
```

Or regenerate a specific doc by deleting it and creating a request:

```bash
mkdir -p .onboarding
cat > .onboarding/doc-generation-request.json << 'EOF'
{
  "topics_to_generate": ["domain"],
  "repo_name": "your-repo-name"
}
EOF
```

Then type `/onboarding` — only the missing file is regenerated.

The pre-hook warns if docs are older than 90 days so freshness is visible before sessions start.

---

## Development

```bash
npm install        # install deps
npm run build      # compile TypeScript → dist/
npm run dev        # watch mode
npm start          # run compiled server
```

Test a tool directly:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"scan_repo_docs","arguments":{"repo_path":"/path/to/repo"}}}' \
  | node dist/index.js
```

---

## Requirements

| Requirement | Notes |
|-------------|-------|
| Node.js ≥ 18 | Required for ES module hook scripts |
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` |
| Git repo with a remote | Used for division/squad detection |
| Confluence API token | Optional — graduation summaries only |

---

## Troubleshooting

**Doc generation takes too long** — expected on large repos (2–5 min). Runs once only. If it times out, placeholder files are written and the session continues.

**Generated docs have wrong info** — expected. Edit the file, correct what's wrong, submit a PR. The `(inferred)` marker flags uncertain values.

**Hook not firing** — check `~/.claude/settings.json` has the hook registered, and that `hooks/package.json` has `"type": "module"`.

**Graduation letter not written** — check `.onboarding/your-onboarding-letter.md`. If missing, confirm `post-graduation.js` is registered and run `node .claude/hooks/post-graduation.js` manually.

**To restart from scratch:**

```bash
rm -rf .onboarding/
```

The `/docs/` files are preserved — only personal session data is cleared.

---

## Roadmap

- [ ] **Phase 2:** Confluence MCP — pull live team wikis, glossaries, onboarding checklists
- [ ] **Phase 2:** GitHub MCP — fetch recent PRs as real workflow examples
- [ ] **Phase 3:** Sub-agent architecture — parallel Codebase, Workflow, Domain, Culture agents
- [ ] **Phase 3:** PostToolUse hook — write session summary back to Confluence automatically
- [ ] **Phase 4:** Division-aware domain agents — accounting challenges for Jurnal, HR/payroll for Talenta

---

## Feedback

Post in `#dx-feedback` on Slack or open an issue in the eng-platform repo.

If the onboarding session gave wrong information about your repo, update `/docs/` directly — that's the fastest fix for every engineer who comes after you.
