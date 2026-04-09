# Workshop: Mekari Engineering Onboarding MCP

> **Division:** Engineering Platform / DX (Developer Experience)
> **Scope:** Cross-division — Jurnal, Talenta, Flex, and future Mekari products
> **Format:** MCP Harness + Wrapper System (replaces static local skill)

---

## 1. Problem Statement

### Current State

Onboarding at Mekari is fragmented by design — each division runs its own variation:

- Docs live in different places: Confluence, README, CLAUDE.md, tribal knowledge, Slack pins
- Quality varies by team size: large teams have structured wikis; small teams rely on senior engineers
- New engineers ask the same foundational questions repeatedly across Slack DMs and standups
- Senior engineers are pulled from deep work to answer: *"Where do I push?"*, *"Why does this test fail locally?"*, *"What's the difference between Invoice and Sales Invoice?"*
- There is no feedback loop — no one knows what topics confuse new engineers most

### The Core Friction

> A new engineer joins Jurnal on Monday. They read 12 docs in random order, get overwhelmed, open Slack, and ask their buddy to get on a call. The buddy is in the middle of a bug. The call happens Wednesday.

This is a 2-day block on something that could be solved in 20 minutes with the right guide.

---

## 2. Proposed Solution

### Mekari Engineering Onboarding MCP — Harness & Wrapper

A **repo-aware MCP harness** that wraps every onboarding session with a docs bootstrap layer:

1. **Detects the current repo** the engineer is working in
2. **Checks for existing docs** — looks in `/docs` folder or `.claude/skills/` for onboarding material
3. **If docs are missing → triggers Doc Generation Agent** to auto-generate comprehensive docs first (system design, repo structure, domain context, workflow)
4. **Runs adaptive onboarding session** using the docs as ground truth, not hardcoded prompts
5. **Saves a session summary** back to Confluence so managers can track progress

The engineer gets the equivalent of a 1:1 with a senior engineer — available instantly, at any time, from **any repo**, even undocumented ones.

---

## 3. Core Refactor: Docs-First Architecture

### The Key Shift

The previous implementation hardcoded Jurnal/Quickbook knowledge into `SKILL.md`. This doesn't scale.

The new model is a **harness** — a wrapper that first resolves what docs exist, then drives onboarding from those docs:

```
Old Model (static skill)
────────────────────────
SKILL.md contains knowledge → onboard
One repo. No docs awareness. No generation.

New Model (MCP harness)
────────────────────────
Detect repo
  └── Docs exist? → load docs → onboard
  └── No docs?   → generate docs → onboard
```

### What "Docs" Means

The MCP looks for docs in two places, in order:

1. `/docs` folder in the repo root — `system-design.md`, `architecture.md`, `domain.md`, `workflow.md`, etc.
2. `.claude/skills/` — existing onboarding skills as fallback

If neither exists, the **Doc Generation Agent** runs before onboarding starts.

### Doc Generation Agent Output

When triggered, the agent generates a `/docs` folder with four files:

| File | Contents |
|------|----------|
| `system-design.md` | Architecture overview, tech stack, service boundaries, key design decisions |
| `codebase.md` | Folder structure, key files, naming conventions, danger zones, STI patterns |
| `domain.md` | Business domain glossary, product concepts, why code is shaped this way |
| `workflow.md` | PR lifecycle, CI/CD, branch naming, deploy process, review culture |

These docs become the source of truth for the onboarding session — the MCP injects them into the session context directly.

---

## 4. Desired State

| Before | After |
|--------|-------|
| New engineer reads docs alone, gets overwhelmed | Interactive session adapts to their background |
| Waits hours/days for senior engineer availability | Onboarding starts within 1 minute of `/onboarding` |
| Onboarding quality varies by division and team | Consistent baseline across all Mekari products |
| No visibility into what confused new joiners | Session summaries in Confluence give managers data |
| Local skill locked to one repo (Quickbook only) | MCP harness works from any repo, generates docs if missing |
| Undocumented repos block onboarding | Doc Generation Agent bootstraps any repo automatically |

---

## 5. Architecture

### High-Level Flow

```
Engineer opens repo → types /onboarding
         │
         ▼
┌─────────────────────────────────┐
│        MCP Harness              │
│   (repo-aware entry point)      │
│                                 │
│  1. Read git remote             │
│  2. Check /docs or .claude/     │
│     skills/ for existing docs   │
└────────────┬────────────────────┘
             │
     ┌───────┴────────┐
     │                │
  Docs exist?     No docs found
     │                │
     ▼                ▼
  Load docs    ┌──────────────────┐
               │ Doc Generation   │
               │ Agent            │
               │                  │
               │ • system-design  │
               │ • codebase       │
               │ • domain         │
               │ • workflow       │
               └──────┬───────────┘
                      │ writes /docs/
                      ▼
                  Load docs
                      │
             ─────────┘
             │
             ▼
┌────────────────────────────────────────┐
│          MCP Context Layer             │
│                                        │
│  MCP Confluence    MCP GitHub          │
│  • Team wiki       • CLAUDE.md         │
│  • Glossary        • README            │
│  • Checklist       • Recent PRs        │
│                    • Folder structure  │
└───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│         Onboarding Session             │
│                                        │
│  Q0: Language preference (EN/ID)       │
│  Q1: Background + experience level     │
│  Q2: Which squad are you joining?      │
│                                        │
│  ↓ spawns parallel sub-agents          │
│                                        │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │Codebase  │ │Workflow  │ │Domain  │ │
│  │Agent     │ │Agent     │ │Agent   │ │
│  └──────────┘ └──────────┘ └────────┘ │
│        ┌──────────┐                    │
│        │Culture   │                    │
│        │Agent     │                    │
│        └──────────┘                    │
│                                        │
│  ↓ synthesizes → progressive session   │
└────────────────────────────────────────┘
             │
             ▼ PostToolUse Hook
┌─────────────────────┐
│  Session Summary    │  ← written back to Confluence via MCP
│  • Topics covered   │
│  • XP earned        │
│  • Open questions   │
│  • Next steps       │
└─────────────────────┘
```

---

## 6. User Flow

### Step 1 — Entry Point

Engineer opens Claude Code in **any Mekari repo** and types:

```
/onboarding
```

Or the MCP auto-triggers when these phrases are detected:
- *"I'm new here"* / *"baru masuk nih"*
- *"where do I start"* / *"mulai dari mana ya"*
- *"help me understand the codebase"*
- *"first day"* / *"hari pertama"*

### Step 2 — Docs Resolution (PreToolUse Hook)

Before the session starts, the MCP harness runs docs resolution:

1. Reads `git remote get-url origin` to identify the repo
2. Checks `/docs/` folder for: `system-design.md`, `codebase.md`, `domain.md`, `workflow.md`
3. Checks `.claude/skills/` for any existing onboarding skill
4. **If docs exist** → loads them into session context
5. **If no docs** → triggers Doc Generation Agent (see Step 2b)
6. Fetches supplementary context from MCP Confluence and MCP GitHub

### Step 2b — Doc Generation Agent (When No Docs Found)

If the repo has no `/docs` folder and no `.claude/skills/onboarding/`:

```
⚙️  No onboarding docs found for this repo.
    Generating documentation before we begin...
    This takes ~2-3 minutes and only runs once.
```

The agent runs four parallel sub-tasks:
- Analyzes repo structure, reads key files, maps folder layout → `codebase.md`
- Reads CLAUDE.md, README, recent PRs, CI config → `workflow.md`
- Infers domain context from models, routes, service objects → `domain.md`
- Synthesizes architecture from services, DB schema, configs → `system-design.md`

Writes all four files to `/docs/` in the repo. **These files are owned by the team** — engineers should review, edit, and commit them as living documentation.

### Step 3 — Adaptive Onboarding Session

The skill opens with a welcome banner and asks:

- **Q0:** Language preference (Bahasa Indonesia / English)
- **Q1:** Background (Java dev? Fresh grad? Frontend switching to backend?)
- **Q2:** Which team/squad are you joining?

Based on answers + docs content, the session adapts per engineer background.

### Step 4 — Parallel Sub-Agents

Four agents run concurrently (`run_in_background: true`), reading from generated/existing docs:

| Agent | Reads From | Output |
|-------|-----------|--------|
| **Codebase Explorer** | `/docs/codebase.md` + live repo scan | Map of the repo, danger zones, key patterns |
| **Workflow Agent** | `/docs/workflow.md` + recent PRs | How a ticket goes from Jira to production |
| **Domain Agent** | `/docs/domain.md` + Confluence glossary | What the business words mean |
| **Culture Agent** | Confluence team pages | How this team operates day-to-day |

### Step 5 — Progressive Challenges

After each dimension, the skill issues a mini challenge scoped to the actual repo:

```
Challenge: Find the service object responsible for creating a Sales Invoice.
Hint: look in app/services/ (per codebase.md)
XP reward: 50 XP on first correct answer
```

### Step 6 — Session Summary (PostToolUse Hook)

When the session ends:

1. Compiles topics covered, XP earned, open questions
2. Writes summary to Confluence under the engineer's onboarding page
3. Tags the manager for visibility
4. Generates "next steps" checklist based on what was covered vs. what remains

---

## 7. Implementation Plan

### Phase 1 — MCP Server Setup

- [ ] Stand up MCP Confluence server (read + write access)
- [ ] Stand up MCP GitHub server (read access to Mekari org repos)
- [ ] Define repo → product/division mapping table
- [ ] Define docs resolution schema: `/docs/` first, `.claude/skills/` second

### Phase 2 — Doc Generation Agent

- [ ] Build repo structure analyzer (reads file tree, key files, naming patterns)
- [ ] Build workflow analyzer (CI config, PR templates, CLAUDE.md, README)
- [ ] Build domain inference agent (models, routes, service objects, DB schema)
- [ ] Build architecture synthesizer (services, configs, external dependencies)
- [ ] Implement parallel doc generation with `run_in_background: true`
- [ ] Output writer: creates `/docs/` folder with four standard files

### Phase 3 — Harness & Skill Migration

- [ ] Port existing `SKILL.md` onboarding logic to docs-driven format
- [ ] Replace hardcoded Jurnal knowledge with `/docs/` injection
- [ ] Implement Q0–Q2 adaptive branching using docs as context
- [ ] Build transfer learning guides for Java, Python, Go, JS backgrounds (doc-driven)

### Phase 4 — Sub-Agent Architecture

- [ ] Implement Codebase Explorer reading from `/docs/codebase.md`
- [ ] Implement Workflow agent reading from `/docs/workflow.md`
- [ ] Implement Domain agent reading from `/docs/domain.md` + Confluence
- [ ] Implement Culture agent reading from Confluence team pages
- [ ] Wire parallel execution with `run_in_background: true`

### Phase 5 — Hooks

- [ ] `PreToolUse` hook: docs resolution → trigger generation if missing
- [ ] `PostToolUse` hook: session summary write to Confluence
- [ ] Docs freshness check: warn if `/docs/` files are >90 days old

### Phase 6 — Rollout

- [ ] Pilot with Jurnal team (existing SKILL.md users as control group)
- [ ] Gather feedback from first 5 new joiners
- [ ] Test doc generation on an undocumented internal repo
- [ ] Expand to Talenta + Flex with division-aware domain agents
- [ ] Open to all divisions

---

## 8. Technical Spec

### Skill Entry Point

```
Name:           onboarding
Trigger:        /onboarding (manual) or keyword detection (auto)
MCP deps:       mcp-confluence, mcp-github
Hook — Pre:     PreToolUse → docs resolution, prefetch context
Hook — Post:    PostToolUse on Agent → write session summary to Confluence
Sub-agents:     4 parallel (Codebase, Workflow, Domain, Culture)
Doc gen:        Triggered if /docs/ and .claude/skills/onboarding/ both absent
```

### Docs Resolution Schema

```
Priority 1: /docs/system-design.md + /docs/codebase.md + /docs/domain.md + /docs/workflow.md
Priority 2: .claude/skills/onboarding/SKILL.md (legacy fallback)
Priority 3: README.md + CLAUDE.md (minimal fallback)
Fallback:   Trigger Doc Generation Agent
```

### Division Context Schema

```json
{
  "division": "jurnal",
  "product_name": "Mekari Jurnal",
  "repo_patterns": ["quickbook", "jurnal-"],
  "confluence_space": "JURNAL",
  "docs_path": "/docs/",
  "docs_status": "generated | existing | missing",
  "onboarding_page_id": "...",
  "glossary_page_id": "..."
}
```

### Hook Pseudocode

```ruby
# PreToolUse — fires before /onboarding skill loads
def pre_onboarding_hook
  repo_remote = `git remote get-url origin`.strip
  division = DivisionResolver.from_remote(repo_remote)

  # Docs-first resolution
  docs = DocsResolver.load(
    paths: ["/docs/", ".claude/skills/onboarding/"],
    fallback: ["README.md", "CLAUDE.md"]
  )

  if docs.missing?
    DocGenerationAgent.run(repo_remote, async: false) # blocks until docs ready
    docs = DocsResolver.load(paths: ["/docs/"])
  end

  context = docs.merge(MCPConfluence.fetch_onboarding_context(division))
  context.merge!(MCPGitHub.fetch_repo_context(repo_remote))
  Session.inject_context(context)
end

# PostToolUse — fires after Agent sub-agents complete
def post_onboarding_hook(session_output)
  summary = SessionSummarizer.build(session_output)
  MCPConfluence.write_summary(
    page_id: engineer_onboarding_page_id,
    content: summary
  )
end
```

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Doc generation takes too long | Show progress indicator; cache result; only runs once per repo |
| Generated docs are inaccurate | Agent marks them as `AUTO-GENERATED — please review`; team edits and commits |
| Confluence pages are stale or missing | Graceful fallback to README + CLAUDE.md; log missing pages for DX team |
| Sub-agents return conflicting info | Synthesis prompt explicitly resolves conflicts; flags contradictions to engineer |
| Division detection fails for new repos | Manual override: `/onboarding division=talenta` |
| Session too long, engineer loses focus | Checkpointing — each phase saves state; engineer can resume |
| Sensitive Confluence content exposed | MCP Confluence uses read-only token scoped to Engineering spaces only |
| /docs/ becomes stale over time | Docs freshness check warns if files >90 days old; nudges team to re-run |

---

## 10. Success Metrics

| Metric | Baseline | Target (3 months post-launch) |
|--------|----------|-------------------------------|
| Time to first PR (new joiner) | ~5 days | ≤ 3 days |
| Onboarding Q&A interruptions/week per senior engineer | ~4 hrs | ≤ 1 hr |
| New joiner satisfaction score (survey) | not tracked | ≥ 4.0 / 5.0 |
| Session completion rate | N/A | ≥ 80% complete Phase 1–3 |
| Divisions covered | 1 (Jurnal) | ≥ 3 (Jurnal, Talenta, Flex) |
| Repos with auto-generated docs | 0 | ≥ 10 internal repos |

---

## 11. References

- [Local Onboarding Skill](.claude/skills/onboarding/SKILL.md) — current implementation (Quickbook-only, will be superseded)
- [Onboarding Docs](.) — source content for the domain agent
- [Claude Code MCP Docs](https://docs.claude.com/en/docs/claude-code/mcp) — MCP server setup reference
- [Claude Code Sub-Agents](https://docs.claude.com/en/docs/claude-code/sub-agents) — parallel agent execution
- [Claude Code Hooks](https://docs.claude.com/en/docs/claude-code/hooks) — PreToolUse / PostToolUse hook reference

---

*Prepared for Mekari Engineering Workshop — AI-Assisted Developer Experience Track*
