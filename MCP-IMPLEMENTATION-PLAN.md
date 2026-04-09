# MCP Onboarding System — Implementation Plan

> **Goal:** Build a repo-aware MCP harness that onboards engineers from any Mekari repo by resolving or generating docs first, then running an adaptive onboarding session.

---

## System Overview

```
/onboarding trigger (any repo)
       │
       ▼
PreToolUse Hook — pre-onboarding.js
  ├── Read cwd + git remote
  ├── Scan ALL doc levels, score completeness
  │     ├── Sufficient → inject into session context
  │     └── Gaps found → generate only missing docs → inject merged context
  └── Enrich with MCP Confluence if available (optional, no token = skip)
       │
       ▼
Onboarding Session — SKILL.md (docs-driven)
  └── 4 parallel sub-agents reading from resolved docs
       │
       ├── [after each topic quiz]
       │   SKILL.md writes .onboarding/signals/{topic}.json
       │   PostToolUse Hook (matcher: Write → .onboarding/signals/)
       │   └── post-topic-quiz.js appends to session-{date}.json
       │
       ▼
Graduation milestone
  SKILL.md writes .onboarding/signals/graduation.json
  PostToolUse Hook (matcher: Write → .onboarding/signals/graduation.json)
  └── post-graduation.js
        ├── Write to Confluence if MCP available, else skip silently
        └── Write .onboarding/your-onboarding-letter.md
```

### Architecture Notes

- **Deployment model:** Global Claude Code skill installed by the user. Not an MCP server — runs as hooks + SKILL.md in the engineer's Claude Code session. Confluence MCP is an optional enrichment layer; the system runs fully without it.
- **Confluence:** Optional. All Confluence writes are no-ops if MCP is unavailable or token not configured. No hard dependency.
- **Engineer identity:** Captured from Q0 in the session; fallback to `git config user.name` if session answer not yet available when a hook fires early.

---

## Phase 1: MCP Server Setup

**Goal:** Establish the two MCP servers the harness depends on.

### 1.1 MCP Confluence Server

```
Access: Read + Write
Scope: Engineering spaces only (JURNAL, TALENTA, FLEX, ENG-PLATFORM)
Operations needed:
  - fetch_page(page_id)
  - search_space(space_key, query)
  - write_page(page_id, content)
  - create_page(space_key, parent_id, title, content)
```

**Setup steps:**
1. Provision Confluence API token (read+write, scoped to Engineering)
2. Install MCP Confluence server: `npx @modelcontextprotocol/server-confluence`
3. Configure in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "confluence": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-confluence"],
      "env": {
        "CONFLUENCE_URL": "https://mekari.atlassian.net/wiki",
        "CONFLUENCE_TOKEN": "${CONFLUENCE_API_TOKEN}"
      }
    }
  }
}
```

### 1.2 MCP GitHub Server

```
Access: Read only
Scope: Mekari org repos
Operations needed:
  - get_file_contents(repo, path)
  - list_directory(repo, path)
  - search_code(repo, query)
  - list_pull_requests(repo, state=merged, limit=10)
```

**Setup steps:**
1. Provision GitHub token (read-only, Mekari org)
2. Install MCP GitHub server: `npx @modelcontextprotocol/server-github`
3. Configure in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### 1.3 Repo Context Resolver

No static division map. The resolver scans **all levels simultaneously**, scores completeness, merges what exists, and only generates what is missing.

**Completeness scoring:**

```javascript
// .claude/hooks/docs-resolver.js

const REQUIRED_TOPICS = ['codebase', 'workflow', 'domain', 'system-design'];

// Maps each source file to which topics it covers
const TOPIC_COVERAGE = {
  'docs/codebase.md':             ['codebase'],
  'docs/workflow.md':             ['workflow'],
  'docs/domain.md':               ['domain'],
  'docs/system-design.md':        ['system-design'],
  '.claude/skills/onboarding/SKILL.md': ['codebase', 'workflow', 'domain'], // legacy covers 3
  'CLAUDE.md':                    ['workflow', 'codebase'],  // often covers setup + structure
  'README.md':                    ['codebase'],              // minimal codebase signal
};

async function resolveRepoContext() {
  const repoCwd    = process.cwd();
  const repoName   = path.basename(repoCwd);
  const repoRemote = await exec('git remote get-url origin').catch(() => null);

  // Step 1: Scan ALL levels — never skip a level
  const allSources = Object.keys(TOPIC_COVERAGE);
  const found = {};

  for (const source of allSources) {
    const fullPath = path.join(repoCwd, source);
    if (await fileExists(fullPath)) {
      const content = await readFile(fullPath);
      if (content.trim().length > 500) { // ignore near-empty files
        found[source] = { content, coveredTopics: TOPIC_COVERAGE[source] };
      }
    }
  }

  // Step 2: Score what topics are covered
  const coveredTopics = new Set(
    Object.values(found).flatMap(f => f.coveredTopics)
  );
  const missingTopics = REQUIRED_TOPICS.filter(t => !coveredTopics.has(t));

  // Step 3: Check freshness on /docs/ files (warn if >90 days old)
  for (const source of Object.keys(found)) {
    if (source.startsWith('docs/')) checkFreshness(source);
  }

  return {
    repo_name:      repoName,
    repo_remote:    repoRemote,
    sources:        found,          // all usable files found, with content
    covered_topics: [...coveredTopics],
    missing_topics: missingTopics,  // what needs to be generated
    is_sufficient:  missingTopics.length === 0,
  };
}
```

**Key behavior:**
- README.md is **always** scanned — never ignored, even if `/docs/` exists
- A repo with only `README.md` and `CLAUDE.md` is `covered: ['codebase', 'workflow']`, `missing: ['domain', 'system-design']` — only those two get generated
- A repo with a partial `/docs/` (e.g. just `codebase.md`) gets the other three generated
- All found sources are merged into session context — richer the repo, richer the session

**Deliverables:**
- [ ] MCP Confluence server configured (token optional — skip gracefully if absent)
- [ ] MCP GitHub server configured (token optional — skip gracefully if absent)
- [ ] `docs-resolver.js` implemented with completeness scoring
- [ ] Tested against 4 repo states: full `/docs/`, partial `/docs/`, legacy SKILL.md only, bare repo

---

## Phase 2: Doc Generation Agent

**Goal:** Build the agent that auto-generates `/docs/` when a repo has no onboarding documentation.

### 2.1 Agent Architecture

The Doc Generation Agent runs four sub-tasks in parallel, each writing one file:

```
DocGenerationAgent
├── [parallel] CodabaseAnalyzer    → /docs/codebase.md
├── [parallel] WorkflowAnalyzer   → /docs/workflow.md
├── [parallel] DomainInferencer   → /docs/domain.md
└── [parallel] ArchSynthesizer    → /docs/system-design.md
```

### 2.2 Codebase Analyzer

**Input:** Live repo file tree via MCP GitHub  
**Output:** `/docs/codebase.md`

Analyzes:
- Top-level folder structure and purpose of each directory
- Entry points (main files, route files, application bootstraps)
- Key files engineers will touch frequently
- Naming conventions (file naming, class naming, test naming)
- Danger zones — files/areas that require senior review before touching
- Common patterns (service objects, concerns, decorators, workers, etc.)

Template structure for `codebase.md`:
```markdown
# Codebase Guide — {repo_name}

> AUTO-GENERATED on {date} — review and commit to keep accurate

## Folder Structure
## Entry Points
## Key Files
## Naming Conventions
## Common Patterns
## Danger Zones
## Test Structure
```

### 2.3 Workflow Analyzer

**Input:** CLAUDE.md, README, CI config files, PR templates, last 10 merged PRs  
**Output:** `/docs/workflow.md`

Analyzes:
- How to set up local development
- Branch naming conventions (inferred from PR history)
- PR lifecycle: open → review → merge → deploy
- CI/CD pipeline steps
- Staging and production deploy process
- How to run tests locally
- Common CI failure patterns

Template structure for `workflow.md`:
```markdown
# Engineering Workflow — {repo_name}

> AUTO-GENERATED on {date} — review and commit to keep accurate

## Local Setup
## Branch Naming
## PR Lifecycle
## CI/CD Pipeline
## Testing
## Deployment
## Common Issues
```

### 2.4 Domain Inferencer

**Input:** Model files, route files, service objects, DB schema  
**Output:** `/docs/domain.md`

Analyzes:
- Core domain entities and their relationships (inferred from models)
- Key business concepts appearing in the codebase
- Glossary of domain-specific terms (Invoice, Journal Entry, Payslip, etc.)
- Why the code is shaped the way it is (business rules driving architecture)

Template structure for `domain.md`:
```markdown
# Domain Context — {repo_name}

> AUTO-GENERATED on {date} — review and commit to keep accurate

## Core Domain Entities
## Key Business Concepts
## Glossary
## Domain Rules (inferred from code)
## Key Relationships
```

### 2.5 Architecture Synthesizer

**Input:** Services, configs, external dependencies, infrastructure files  
**Output:** `/docs/system-design.md`

Analyzes:
- Tech stack (language, framework, database, cache, queue)
- Service boundaries and dependencies
- External integrations (third-party APIs, internal Mekari services)
- Data flow for key operations
- Infrastructure overview

Template structure for `system-design.md`:
```markdown
# System Design — {repo_name}

> AUTO-GENERATED on {date} — review and commit to keep accurate

## Tech Stack
## Architecture Overview
## Service Boundaries
## External Dependencies
## Data Flow
## Infrastructure
## Key Design Decisions
```

### 2.6 Agent Prompt

The Doc Generation Agent is invoked as a sub-agent with this system prompt:

```
You are a technical documentation agent. Your job is to analyze a software repository
and generate accurate, developer-friendly documentation for four topics:
1. Codebase structure (folder layout, patterns, danger zones)
2. Engineering workflow (local setup, PR process, CI/CD, deploy)
3. Domain context (business entities, glossary, domain rules)
4. System design (tech stack, architecture, external dependencies)

Rules:
- Be accurate. Only write what you can verify from the code.
- Be honest about uncertainty. Mark inferences with "likely" or "inferred from".
- Always add the header: "AUTO-GENERATED on {date} — please review and commit"
- Write for a new engineer on day 1. No assumed knowledge.
- Keep each file under 300 lines. Prioritize the most important information.
```

**Deliverables:**
- [ ] `CodabaseAnalyzer` sub-agent implemented and tested on Quickbook repo
- [ ] `WorkflowAnalyzer` sub-agent implemented
- [ ] `DomainInferencer` sub-agent implemented
- [ ] `ArchSynthesizer` sub-agent implemented
- [ ] Parallel execution wired with `run_in_background: true`
- [ ] Output writer creates `/docs/` with correct file names
- [ ] Tested on one undocumented internal repo

---

## Phase 3: Harness & PreToolUse Hook

**Goal:** Build the docs resolution hook that fires before every `/onboarding` invocation.

### 3.1 Docs Resolution + Generation Logic

```javascript
// hooks/pre-onboarding.js
import { resolveRepoContext } from './docs-resolver.js';

async function preOnboardingHook() {
  const ctx = await resolveRepoContext();

  // Generate only the missing topics — not a full regeneration
  if (ctx.missing_topics.length > 0) {
    console.log(`⚙️  Missing docs for: ${ctx.missing_topics.join(', ')}. Generating...`);
    await runDocGenerationAgent({
      repoName:      ctx.repo_name,
      repoRemote:    ctx.repo_remote,
      topicsToWrite: ctx.missing_topics,   // only generate what's missing
    });
    // Re-resolve to pick up newly generated files
    const refreshed = await resolveRepoContext();
    Object.assign(ctx, refreshed);
  }

  // Merge all found sources into a single context object
  const mergedDocs = mergeDocSources(ctx.sources);  // README + CLAUDE.md + /docs/ all included

  // Enrich with Confluence MCP — silently skip if unavailable or no token
  const confluenceCtx = await tryConfluence(ctx.repo_name);

  return injectContext({ docs: mergedDocs, confluenceCtx, repoName: ctx.repo_name });
}

async function tryConfluence(repoName) {
  try {
    return await mcp.confluence.fetchOnboardingContext(repoName);
  } catch {
    return null; // no token, server not running, or space not found — all treated the same
  }
}
```

### 3.2 Hook Signal Mechanism

Claude Code `PostToolUse` hooks match on tool names, not custom event names. To avoid custom infrastructure, SKILL.md signals events by **writing sentinel files** to `.onboarding/signals/` using the `Write` tool. Hooks match on `Write` calls targeting that path.

**Signal files written by SKILL.md:**

```
.onboarding/signals/topic-codebase.json      ← after Codebase quiz
.onboarding/signals/topic-workflow.json      ← after Workflow quiz
.onboarding/signals/topic-domain.json        ← after Domain quiz
.onboarding/signals/topic-culture.json       ← after Culture quiz
.onboarding/signals/graduation.json          ← on graduation
```

Each signal file carries the quiz result payload:

```json
// .onboarding/signals/topic-codebase.json (written by SKILL.md)
{
  "topic": "codebase",
  "engineer_name": "Budi",
  "xp_earned": 45,
  "xp_max": 50,
  "correct_concepts": ["service objects", "folder structure", "naming conventions"],
  "missed_concepts": ["STI models", "karafka consumers"],
  "questions_asked": ["When should I use a concern vs a service object?"]
}
```

The `PostToolUse` hook matches on `Write` + path pattern — no custom events needed:

```json
// settings.json hook matcher
{
  "matcher": "Write",
  "conditions": { "path": ".onboarding/signals/topic-*.json" },
  "hooks": [{ "type": "command", "command": "node .claude/hooks/post-topic-quiz.js" }]
}
```

The hook script reads `$CLAUDE_TOOL_INPUT` (the Write tool's file path and content) to know which topic just completed.

### 3.3 Engineer Name Resolution

```javascript
// utils/engineer-name.js
async function resolveEngineerName() {
  // Priority 1: already captured in session state from Q0 answer
  const sessionState = await readSessionState();
  if (sessionState?.engineer_name) return sessionState.engineer_name;

  // Priority 2: git config user.name
  const gitName = await exec('git config user.name').catch(() => null);
  if (gitName?.trim()) return gitName.trim().split(' ')[0]; // first name only

  // Priority 3: git config user.email prefix
  const gitEmail = await exec('git config user.email').catch(() => null);
  if (gitEmail?.trim()) return gitEmail.split('@')[0];

  return 'there'; // graceful fallback → "Hey there — you made it"
}
```

SKILL.md writes `{ engineer_name }` to `.onboarding/session-state.json` immediately after Q0 is answered, so hooks that fire later in the session always have it available.

### 3.4 Per-Topic Quiz Hook

```javascript
// hooks/post-topic-quiz.js
import { resolveEngineerName } from '../utils/engineer-name.js';

async function postTopicQuizHook() {
  // Claude Code passes the Write tool's input via env
  const signal = JSON.parse(process.env.CLAUDE_TOOL_INPUT);
  const payload = JSON.parse(signal.content); // the signal file content

  const engineerName = await resolveEngineerName();
  const repoName     = path.basename(process.cwd());
  const reportPath   = `.onboarding/session-${today()}.json`;

  let session = { engineer: engineerName, repo: repoName, session_date: today(), topics: [] };
  if (await fileExists(reportPath)) {
    session = JSON.parse(await readFile(reportPath));
  }

  session.topics.push({
    topic:           payload.topic,
    completed_at:    now(),
    xp:              { earned: payload.xp_earned, max: payload.xp_max },
    understood:      payload.correct_concepts,
    struggled_with:  payload.missed_concepts,
    open_questions:  payload.questions_asked,
  });

  await fs.mkdir('.onboarding', { recursive: true });
  await writeFile(reportPath, JSON.stringify(session, null, 2));
}
```

**Output:** `.onboarding/session-{date}.json` — gitignored, builds up one entry per topic.

### 3.5 Graduation Letter Hook

```javascript
// hooks/post-graduation.js
import { resolveEngineerName } from '../utils/engineer-name.js';

async function postGraduationHook() {
  const engineerName  = await resolveEngineerName();
  const repoName      = path.basename(process.cwd());
  const topicReports  = JSON.parse(await readFile(`.onboarding/session-${today()}.json`));

  // 1. Confluence summary — silent no-op if MCP unavailable or no token
  try {
    const summary = buildSessionSummary({ engineerName, repoName, topicReports });
    await mcp.confluence.writeSummary(summary);
  } catch {
    // No Confluence token or server — skip, don't warn the engineer
  }

  // 2. Personal graduation letter → always written, no dependencies
  const letter = await generateGraduationLetter({ engineerName, repoName, topicReports });

  await fs.mkdir('.onboarding', { recursive: true });
  await writeFile('.onboarding/your-onboarding-letter.md', letter);

  console.log("✉️  A personal note has been saved to .onboarding/your-onboarding-letter.md — give it a read.");
}
```

**`generateGraduationLetter` prompt rules:**
- Address the engineer by first name (from `engineerName`)
- Reference ≥2 specific things from `topicReports` (high-XP topics, notable questions asked)
- Name one area from `struggled_with` — framed as "worth a ping to a senior, not a blocker"
- Close with a concrete first-PR nudge
- Tone: warm, direct, senior-engineer-to-new-teammate. Not corporate, not generic.

**Output:** `.onboarding/your-onboarding-letter.md` — local only, never sent anywhere.

### 3.6 Hook Registration

```json
// .claude/settings.json
{
  "mcpServers": {
    "confluence": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-confluence"],
      "env": {
        "CONFLUENCE_URL": "https://mekari.atlassian.net/wiki",
        "CONFLUENCE_TOKEN": "${CONFLUENCE_API_TOKEN}"
      }
    }
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "conditions": { "command_contains": "/onboarding" },
        "hooks": [{ "type": "command", "command": "node ~/.claude/hooks/pre-onboarding.js" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "conditions": { "path_matches": "\\.onboarding/signals/topic-.+\\.json$" },
        "hooks": [{ "type": "command", "command": "node ~/.claude/hooks/post-topic-quiz.js" }]
      },
      {
        "matcher": "Write",
        "conditions": { "path_matches": "\\.onboarding/signals/graduation\\.json$" },
        "hooks": [{ "type": "command", "command": "node ~/.claude/hooks/post-graduation.js" }]
      }
    ]
  }
}
```

Note: hooks are installed globally in `~/.claude/` since this is a global skill, not per-repo.

### 3.7 Skill Migration

Update `.claude/skills/onboarding/SKILL.md`:

- Remove all hardcoded Jurnal/Quickbook knowledge — replaced by injected `{merged_docs_context}`
- After each topic quiz: write `.onboarding/signals/topic-{name}.json` with quiz payload (via Write tool)
- After graduation: write `.onboarding/signals/graduation.json`
- Write `.onboarding/session-state.json` immediately after Q0 to capture `engineer_name`
- Challenges generated from injected docs content, not hardcoded examples

**Deliverables:**
- [ ] `docs-resolver.js` with completeness scoring (scans all levels, README always included)
- [ ] `pre-onboarding.js` — resolves + generates only missing topics
- [ ] `utils/engineer-name.js` — Q0 answer → git config → graceful fallback
- [ ] `post-topic-quiz.js` — reads signal file, appends to session JSON
- [ ] `post-graduation.js` — Confluence silent fallback + personal letter always written
- [ ] All hooks registered globally in `~/.claude/settings.json`
- [ ] SKILL.md refactored: docs-driven, writes signal files, captures engineer name at Q0
- [ ] `.onboarding/` added to global `~/.claude/.gitignore` or per-repo `.gitignore`

---

## Phase 4: Sub-Agent Architecture

**Goal:** Four sub-agents that read from `/docs/` and run in parallel during the onboarding session.

### 4.1 Codebase Explorer Agent

```
Trigger:    Phase 2 of onboarding session
Input:      /docs/codebase.md + live repo scan
Output:     Guided tour of the codebase structure
Tone:       Map-style — "here's where things live and where NOT to go alone"
```

### 4.2 Workflow Agent

```
Trigger:    Phase 3 of onboarding session
Input:      /docs/workflow.md + last 10 merged PRs (MCP GitHub)
Output:     Ticket-to-production walkthrough
Tone:       Step-by-step process guide with real PR examples
```

### 4.3 Domain Agent

```
Trigger:    Phase 4 of onboarding session
Input:      /docs/domain.md + Confluence glossary pages (MCP Confluence)
Output:     Business domain explainer with code tie-ins
Tone:       "Here's what the business words mean and why the code looks like this"
```

### 4.4 Culture Agent

```
Trigger:    Phase 5 of onboarding session
Input:      Confluence team pages (MCP Confluence)
Output:     Team norms, review culture, incident response, communication expectations
Tone:       Honest and human — not a policy doc
```

### 4.5 Parallel Execution Pattern

```javascript
// In onboarding session orchestrator
const [codebaseResult, workflowResult, domainResult, cultureResult] = await Promise.all([
  runAgent('codebase-explorer', { docs: context.docs.codebase }),
  runAgent('workflow',          { docs: context.docs.workflow, prs: context.github.recentPRs }),
  runAgent('domain',            { docs: context.docs.domain,  glossary: context.confluence.glossary }),
  runAgent('culture',           { confluencePages: context.confluence.teamPages })
]);
```

**Deliverables:**
- [ ] All four sub-agents implemented
- [ ] Each reads from `/docs/` (not hardcoded knowledge)
- [ ] Parallel execution with `run_in_background: true`
- [ ] Results stream into session as they land

---

## Phase 5: Testing & Rollout

### 5.1 Test Matrix

| Test Case | Repo State | Expected Behavior |
|-----------|-----------|-------------------|
| Quickbook (has SKILL.md) | Legacy skill exists | Loads legacy skill, runs onboarding |
| New Jurnal service (no docs) | Empty repo | Generates /docs/, runs onboarding |
| Repo with /docs/ already | Full /docs/ present | Loads docs directly, skips generation |
| /docs/ outdated >90 days | Stale docs | Warns engineer, continues session |
| Unknown repo | No division match | Falls back to README, manual division prompt |

### 5.2 Rollout Phases

**Week 1–2:** Internal DX team testing
- Run on 3 internal repos with different states (documented, undocumented, legacy skill)
- Validate doc generation quality on Quickbook repo

**Week 3–4:** Jurnal pilot
- 5 new joiners use the MCP instead of existing SKILL.md
- Collect NPS + time-to-first-PR data

**Month 2:** Talenta + Flex expansion
- Enable division detection for Talenta and Flex
- Test doc generation on Talenta and Flex repos

**Month 3:** Full rollout
- All Mekari repos can use `/onboarding`
- Monitor Confluence session summaries for quality

---

## File Structure

```
.claude/
├── settings.json                    # MCP server config + hook registration (3 hooks)
├── hooks/
│   ├── docs-resolver.js             # Repo-agnostic docs scanner (no static mapping)
│   ├── pre-onboarding.js            # PreToolUse: resolve docs, inject context
│   ├── post-topic-quiz.js           # PostToolUse: append topic report to session JSON
│   └── post-graduation.js          # PostToolUse: Confluence summary + personal letter
└── skills/
    └── onboarding/
        └── SKILL.md                 # Docs-driven onboarding mentor (refactored, emits signals)

docs/ (per repo — generated or hand-written, committed by team)
├── system-design.md
├── codebase.md
├── domain.md
└── workflow.md

.onboarding/  (gitignored — local to each engineer's machine)
├── session-{date}.json              # Per-topic quiz reports, built up incrementally
└── your-onboarding-letter.md        # Personal graduation letter, written on session complete
```

---

## Resolved Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | How do PostToolUse hooks know a topic quiz finished? | SKILL.md writes `.onboarding/signals/topic-{name}.json` via Write tool; hooks match on `Write` + path pattern |
| 2 | Is this an MCP server or a skill + hooks? | Global Claude Code skill + hooks. Not an MCP server. Confluence MCP is optional enrichment. |
| 3 | Confluence dependency? | Silent no-op if MCP unavailable or no token. Personal letter always written regardless. |
| 4 | Where does engineer name come from? | Q0 session answer → git config user.name → email prefix → "there" |
| 5 | Does docs resolver stop at first match? | No — scans all levels, scores completeness per topic, generates only missing topics, README always included |

## Open Questions

1. **Docs ownership:** Should generated `/docs/` be committed to the repo? Recommendation: yes — teams own and maintain them as living docs.

2. **Doc generation cost on large repos:** First run on Quickbook may take 3–5 minutes. Acceptable — runs once, shows progress, result is cached in `/docs/`.

3. **Multi-repo engineers:** Sessions are per-repo. If Confluence is available, all session summaries link under one engineer page.
