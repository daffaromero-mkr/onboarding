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
Engineer opens ANY repo → types /onboarding
         │
         ▼
┌──────────────────────────────────────┐
│          MCP Harness                 │
│   (repo-agnostic entry point)        │
│                                      │
│  1. Read current working directory   │
│  2. Read git remote (if available)   │
│  3. Scan for ANY valid docs:         │
│     • /docs/*.md          (best)     │
│     • .claude/skills/onboarding/     │
│     • CLAUDE.md           (ok)       │
│     • README.md           (minimal)  │
└────────────┬─────────────────────────┘
             │
     ┌───────┴────────┐
     │                │
  Docs found?     No docs found
  (any level)         │
     │                ▼
     ▼          ┌──────────────────┐
  Load docs     │ Doc Generation   │
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

Before the session starts, the MCP harness runs docs resolution against **whatever repo is currently open** — no division mapping required. The harness is repo-agnostic: it reads signals from the repo itself to understand context.

Resolution order:

1. Reads the current working directory and `git remote get-url origin` to identify the repo
2. Scans for **any valid docs** in this priority order:
   - `/docs/` folder — looks for any `.md` files covering codebase, workflow, domain, or architecture
   - `.claude/skills/onboarding/` — existing onboarding skill
   - `CLAUDE.md` — repo-level Claude instructions (often contains onboarding notes)
   - `README.md` — minimum viable context
3. **If usable docs found at any level** → loads them, notes which level was used, injects into session
4. **If nothing usable found** → triggers Doc Generation Agent (see Step 2b)
5. Optionally enriches with MCP Confluence and MCP GitHub if available — but the session can run without them

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

### Step 5 — Progressive Challenges + Per-Topic Report Hook

After each dimension, the skill issues a mini challenge scoped to the actual repo:

```
Challenge: Find the service object responsible for creating a Sales Invoice.
Hint: look in app/services/ (per codebase.md)
XP reward: 50 XP on first correct answer
```

After the engineer completes the quiz for each topic, a **PostToolUse hook fires immediately** and appends a topic report to a local session file. This happens per-topic, not at the end — so the report builds up incrementally as the session progresses.

**What gets written per topic:**
- Topic name and completion timestamp
- Score (XP earned vs. max possible)
- Questions answered correctly vs. incorrectly
- Key concepts the engineer demonstrated understanding of
- Any concepts they struggled with (based on wrong answers or follow-up questions)
- Open questions the engineer asked during that topic

The report is written to `.onboarding/session-{date}.json` in the repo (gitignored). Each topic appends a new entry — the file grows as the session progresses.

```json
// .onboarding/session-2026-04-09.json (built up incrementally)
{
  "engineer": "budi.santoso",
  "repo": "quickbook",
  "session_date": "2026-04-09",
  "topics": [
    {
      "topic": "codebase",
      "completed_at": "10:24",
      "xp": { "earned": 45, "max": 50 },
      "understood": ["service objects", "folder structure", "naming conventions"],
      "struggled_with": ["STI models", "karafka consumers"],
      "open_questions": ["When should I use a concern vs a service object?"]
    },
    {
      "topic": "workflow",
      "completed_at": "10:51",
      "xp": { "earned": 50, "max": 50 },
      "understood": ["PR lifecycle", "branch naming", "CI pipeline"],
      "struggled_with": [],
      "open_questions": []
    }
    // ... appended as each topic completes
  ]
}
```

### Step 6 — Graduation + Personal Letter Hook

When the engineer completes all topics and the session reaches the graduation milestone:

1. **Confluence summary** is written (structured, for managers): topics covered, XP earned, open questions, next steps checklist
2. **Personal graduation letter** is written to `.onboarding/your-onboarding-letter.md` — a warm, personal note addressed to the engineer by name

The personal letter is **not a report** — it's written in a supportive, human tone like a message from a senior engineer who just watched you finish onboarding. It references specific things from the session: what they understood quickly, where they asked good questions, what to focus on next.

```markdown
<!-- .onboarding/your-onboarding-letter.md — example output -->

# Hey Budi — you made it 🎉

Seriously, congrats. Getting through onboarding isn't just about checking boxes —
it takes patience and curiosity, and you brought both today.

## What stood out

You picked up the PR workflow really fast. Like, faster than most people do.
The way you asked about CI failures before I even brought it up tells me you're
thinking about this the right way — you're thinking about *why*, not just *what*.

Your question about "concern vs service object" was exactly the right question
to ask. Most people don't notice that distinction until they've written
the wrong thing three times.

## The one thing to keep in mind

STI models and karafka consumers — those two things tripped you up a bit,
and honestly that's fair, they trip everyone up. Before you touch anything
in those areas, just ping a senior first. Not because you can't figure it out,
but because there's context there that's not in any doc.

## What's next

Your first PR is the real onboarding. Pick something small — a bug fix,
an improvement to a test, a missing edge case. The point isn't the code,
it's learning the review cycle with real stakes.

You've got this. The team is lucky to have you.

— Your onboarding mentor
  (and every senior engineer who wrote these docs)
```

**Tone rules for the graduation letter:**
- Address the engineer by first name, always
- Reference at least 2 specific things from their session (strong topics, open questions)
- Name the one area to watch out for — honest but not discouraging
- End with a concrete "what's next" nudge
- Never generic. Never corporate. Never a policy summary dressed up as a letter.

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
MCP deps:       mcp-confluence, mcp-github (optional — degrades gracefully without them)
Hook — Pre:     PreToolUse → repo-agnostic docs resolution, context injection
Hook — Mid:     PostToolUse per topic quiz → append topic report to .onboarding/session-{date}.json
Hook — Post:    On graduation → write Confluence summary + .onboarding/your-onboarding-letter.md
Sub-agents:     4 parallel (Codebase, Workflow, Domain, Culture)
Doc gen:        Triggered when no valid docs found at any resolution level
```

### Docs Resolution Schema

```
Priority 1: /docs/*.md          — any .md files covering codebase/workflow/domain/architecture
Priority 2: .claude/skills/onboarding/SKILL.md  — legacy skill fallback
Priority 3: CLAUDE.md           — repo-level instructions (often has onboarding notes)
Priority 4: README.md           — minimal context
Fallback:   Trigger Doc Generation Agent → creates /docs/ → reload Priority 1
```

No static division map required. The harness resolves context from whatever docs exist in the repo.

### Repo Context Schema (dynamic, resolved at runtime)

```json
{
  "repo_name": "quickbook",
  "repo_remote": "git@github.com:mekari/quickbook.git",
  "docs_level": "full | partial | legacy | minimal | generated",
  "docs_found": ["/docs/codebase.md", "/docs/workflow.md", "CLAUDE.md"],
  "docs_missing": ["/docs/domain.md", "/docs/system-design.md"],
  "confluence_space": null,
  "confluence_available": false
}
```

Division and product context are inferred from docs content — not from a hardcoded mapping table.

### Hook Pseudocode

```ruby
# PreToolUse — fires before /onboarding skill loads
def pre_onboarding_hook
  repo_remote = `git remote get-url origin`.strip rescue nil
  repo_name   = File.basename(Dir.pwd)

  # Repo-agnostic docs resolution — scan whatever exists
  docs = DocsResolver.scan_any(
    search_paths: ["/docs/", ".claude/skills/onboarding/", "./"],
    accepted_files: ["*.md"],
    min_useful_size_kb: 1
  )

  if docs.empty?
    show_message("⚙️  No onboarding docs found. Generating docs for this repo...")
    DocGenerationAgent.run(repo_name, repo_remote, async: false)
    docs = DocsResolver.scan_any(search_paths: ["/docs/"])
  end

  # Enrich with MCP if available — but don't block if not
  confluence_ctx = MCPConfluence.fetch_if_available(repo_name)
  github_ctx     = MCPGitHub.fetch_if_available(repo_remote)

  Session.inject_context({ docs:, confluence_ctx:, github_ctx:, repo_name: })
end

# PostToolUse (mid-session) — fires after each topic quiz completes
def post_topic_quiz_hook(topic:, quiz_result:)
  report_path = ".onboarding/session-#{Date.today}.json"
  session     = JSON.parse(File.read(report_path)) rescue { engineer: Session.engineer_name, repo: repo_name, topics: [] }

  session[:topics] << {
    topic:           topic,
    completed_at:    Time.now.strftime("%H:%M"),
    xp:              { earned: quiz_result.xp_earned, max: quiz_result.xp_max },
    understood:      quiz_result.correct_concepts,
    struggled_with:  quiz_result.missed_concepts,
    open_questions:  quiz_result.questions_asked
  }

  File.write(report_path, JSON.pretty_generate(session))
end

# PostToolUse — fires on graduation
def post_graduation_hook(session_output)
  # 1. Structured summary → Confluence (for managers)
  summary = SessionSummarizer.build(session_output)
  MCPConfluence.write_summary_if_available(summary)

  # 2. Personal letter → local file (for the engineer)
  letter = GraduationLetterWriter.write(
    engineer_name:   Session.engineer_name,
    session_data:    session_output,
    topic_reports:   load_topic_reports(".onboarding/session-#{Date.today}.json"),
    tone:            :warm_senior_engineer
  )
  File.write(".onboarding/your-onboarding-letter.md", letter)
  show_message("✉️  A personal note has been saved to .onboarding/your-onboarding-letter.md")
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
