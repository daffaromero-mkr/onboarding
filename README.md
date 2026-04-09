# mcp-onboarding

Universal engineer onboarding MCP server. Repo-aware, doc-adaptive, works with any codebase.

When a new engineer opens a repo and types `/onboarding`, this MCP:
1. Reads existing docs (`docs/`, `CLAUDE.md`, `.claude/skills/`) if they exist
2. If no docs are found — reads the repo structure and synthesizes an onboarding session from the code itself
3. Runs an interactive, adaptive conversational session guided by the universal `SKILL.md`
4. Saves session notes to `.onboarding-sessions/` at the end

---

## Quick Start

### 1. Install and build

```bash
git clone https://github.com/daffaromero-mkr/onboarding.git mcp-onboarding
cd mcp-onboarding
npm install
npm run build
```

### 2. Connect to Claude Code

Add to your Claude Code MCP config (`~/.claude/claude_desktop_config.json` or `.claude/mcp.json` in your project):

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

Or use `claude mcp add` from the CLI:

```bash
claude mcp add mcp-onboarding node /absolute/path/to/mcp-onboarding/dist/index.js
```

### 3. Install the skill

Copy the universal skill into your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/onboarding
cp skill/SKILL.md ~/.claude/skills/onboarding/SKILL.md
```

Or copy it into a specific repo:

```bash
mkdir -p /path/to/your-repo/.claude/skills/onboarding
cp skill/SKILL.md /path/to/your-repo/.claude/skills/onboarding/SKILL.md
```

### 4. Use it

Open Claude Code in any repo and type:

```
/onboarding
```

Or it auto-triggers when an engineer says: "I'm new here", "where do I start", "help me understand this codebase".

---

## How It Works

### With existing docs

If the repo has `docs/`, `CLAUDE.md`, or `.claude/skills/onboarding/SKILL.md`, the MCP reads them and uses that content to drive the session. The mentor becomes a guide through the team's own documentation.

### Without docs

If the repo has no onboarding docs, the MCP:
1. Detects the tech stack (Rails, Node, Go, Java, Python, etc.)
2. Reads key files: entry points, routes, models, configs, Dockerfile
3. Builds a directory tree
4. Returns all of this to Claude, which synthesizes a live onboarding session

The engineer gets a useful session regardless of whether the team has invested in documentation.

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `scan_repo_docs` | Scan for CLAUDE.md, README, docs/, existing skills |
| `analyze_repo_structure` | Detect framework, language, key dirs, CI/CD |
| `generate_repo_snapshot` | Read key files for Claude to synthesize from |
| `resolve_division` | Map git remote URL → product/division |
| `save_session_notes` | Persist session summary to `.onboarding-sessions/` |
| `list_past_sessions` | Check for prior sessions (resume support) |

---

## Repo Detection

The MCP auto-detects which product/division a repo belongs to from its git remote URL:

| Remote pattern | Division |
|---------------|----------|
| `quickbook`, `jurnal` | Mekari Jurnal |
| `talenta` | Mekari Talenta |
| `flex` | Mekari Flex |
| `klikpajak` | Klikpajak |
| `mekari-sign` | Mekari Sign |
| anything else | Derived from repo name |

To override: `/onboarding division=talenta`

---

## Session Notes

After every session, notes are saved to `.onboarding-sessions/<date>-<name>.md` in the repo:

```
.onboarding-sessions/
  2026-04-09-daffa-romero.md
  2026-04-10-another-engineer.md
```

Each note contains: topics covered, open questions, XP earned, next steps.

Add `.onboarding-sessions/` to `.gitignore` if you don't want them committed, or commit them if you want manager visibility into onboarding progress.

---

## Supported Tech Stacks

Auto-detected from project files:

- **Ruby on Rails** (Gemfile)
- **Node.js / TypeScript** (package.json) — Next.js, Vue, React, NestJS, Express
- **Python** (requirements.txt, pyproject.toml) — Django, FastAPI, Flask
- **Java / Spring Boot** (pom.xml, build.gradle)
- **Go** (go.mod) — Gin, Echo, Fiber

---

## Development

```bash
npm install       # install deps
npm run build     # compile TypeScript → dist/
npm run dev       # watch mode
```

To test a tool locally:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"scan_repo_docs","arguments":{"repo_path":"/path/to/repo"}}}' \
  | node dist/index.js
```

---

## Roadmap

- [ ] **Phase 2:** Confluence MCP integration — pull live team wikis, glossaries, onboarding checklists
- [ ] **Phase 2:** GitHub MCP integration — fetch recent PRs as real workflow examples
- [ ] **Phase 3:** Sub-agent architecture — parallel Codebase, Workflow, Domain, Culture agents
- [ ] **Phase 3:** PostToolUse hook — write session summary back to Confluence automatically
- [ ] **Phase 4:** Division-aware domain agents — accounting challenges for Jurnal, HR/payroll for Talenta
