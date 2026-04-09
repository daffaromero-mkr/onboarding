# MCP Onboarding System — Implementation Plan

> **Goal:** Build a repo-aware MCP harness that onboards engineers from any Mekari repo by resolving or generating docs first, then running an adaptive onboarding session.

---

## System Overview

```
/onboarding trigger (any repo)
       │
       ▼
PreToolUse Hook — docs-resolver.js
  ├── Read cwd + git remote
  ├── Scan for ANY valid docs (full_docs → legacy → CLAUDE.md → README)
  │     ├── Found → inject into session context
  │     └── None → run Doc Generation Agent → write /docs/ → inject
  └── Enrich with MCP Confluence + GitHub if available (optional)
       │
       ▼
Onboarding Session (docs-driven)
  └── 4 parallel sub-agents reading from resolved docs
       │
       ├── [after each topic quiz] PostToolUse Hook — post-topic-quiz.js
       │     └── Append topic report to .onboarding/session-{date}.json
       │
       ▼
Graduation milestone
  ├── PostToolUse Hook — post-graduation.js
  │     ├── Write structured summary → Confluence (for managers)
  │     └── Write personal letter → .onboarding/your-onboarding-letter.md
```

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

### 1.3 Repo Context Resolver (replaces static division map)

The harness does **not** use a static mapping table. Instead, it dynamically resolves context from whatever docs and signals exist in the currently open repo. This means it works on any repo — known, unknown, new, or undocumented — without needing the division map to be kept up to date.

**Resolution logic:**

```javascript
// .claude/hooks/docs-resolver.js
async function resolveRepoContext() {
  const repoCwd   = process.cwd();
  const repoName  = path.basename(repoCwd);
  const repoRemote = await exec('git remote get-url origin').catch(() => null);

  // Scan for any valid docs — accept whatever exists
  const candidates = [
    { path: 'docs/',                          type: 'full_docs' },
    { path: '.claude/skills/onboarding/',     type: 'legacy_skill' },
    { path: 'CLAUDE.md',                      type: 'claude_instructions' },
    { path: 'README.md',                      type: 'readme' },
  ];

  const found = [];
  for (const candidate of candidates) {
    const files = await glob(`${repoCwd}/${candidate.path}**/*.md`);
    if (files.length > 0) found.push({ ...candidate, files });
  }

  return {
    repo_name:   repoName,
    repo_remote: repoRemote,
    docs_found:  found,
    docs_level:  found[0]?.type ?? 'none',  // best level found
    // Division/product inferred later by the session from doc content — not resolved here
  };
}
```

No `division-map.json` file needed. Division and product identity are inferred from the content of the docs by the onboarding session itself.

**Deliverables:**
- [ ] MCP Confluence server running and authenticated
- [ ] MCP GitHub server running and authenticated
- [ ] `docs-resolver.js` implemented and tested against 3 repo states (full docs, legacy skill, empty)

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

### 3.1 Docs Resolution Logic (repo-agnostic)

```javascript
// hooks/pre-onboarding.js
async function preOnboardingHook() {
  const repoCwd    = process.cwd();
  const repoName   = path.basename(repoCwd);
  const repoRemote = await exec('git remote get-url origin').catch(() => null);

  // Scan for ANY valid docs — accept whatever level exists
  const scanOrder = [
    { glob: 'docs/**/*.md',                    level: 'full_docs' },
    { glob: '.claude/skills/onboarding/*.md',  level: 'legacy_skill' },
    { glob: 'CLAUDE.md',                       level: 'claude_instructions' },
    { glob: 'README.md',                       level: 'readme' },
  ];

  let docs = null;
  for (const { glob: pattern, level } of scanOrder) {
    const files = await glob(`${repoCwd}/${pattern}`);
    if (files.length > 0) {
      docs = await loadFiles(files);
      docs.level = level;
      checkDocsFreshness(docs); // warn if >90 days old
      break;
    }
  }

  if (!docs) {
    showMessage('⚙️  No onboarding docs found. Generating docs for this repo...');
    await runDocGenerationAgent(repoName, repoRemote);
    docs = await loadFiles(await glob(`${repoCwd}/docs/**/*.md`));
    docs.level = 'generated';
  }

  // Enrich with MCP — optional, session runs without them
  const confluenceCtx = await mcp.confluence.fetchIfAvailable(repoName);
  const githubCtx     = await mcp.github.fetchIfAvailable(repoRemote);

  return injectContext({ docs, confluenceCtx, githubCtx, repoName });
}
```

### 3.2 Per-Topic Quiz Hook

Fires after the engineer completes the quiz for each onboarding topic. Appends a structured entry to a local session file — does not write to Confluence.

```javascript
// hooks/post-topic-quiz.js
async function postTopicQuizHook({ topic, quizResult, engineerName, repoName }) {
  const reportPath = `.onboarding/session-${today()}.json`;

  // Read existing session file or start fresh
  let session = { engineer: engineerName, repo: repoName, session_date: today(), topics: [] };
  if (await fileExists(reportPath)) {
    session = JSON.parse(await readFile(reportPath));
  }

  // Append this topic's result
  session.topics.push({
    topic,
    completed_at:    now(),
    xp:              { earned: quizResult.xpEarned, max: quizResult.xpMax },
    understood:      quizResult.correctConcepts,    // array of concept names
    struggled_with:  quizResult.missedConcepts,     // array of concept names
    open_questions:  quizResult.questionsAsked,     // questions the engineer asked mid-topic
  });

  await fs.mkdir('.onboarding', { recursive: true });
  await writeFile(reportPath, JSON.stringify(session, null, 2));
}
```

**When it fires:** after the engineer submits their answer to the final quiz question in each topic (Codebase, Workflow, Domain, Culture). Four writes per session total, one per topic.

**Output:** `.onboarding/session-{date}.json` — gitignored, local to the engineer's machine.

### 3.3 Graduation Letter Hook

Fires once when the engineer reaches graduation (all topics completed or cheat code used). Writes two outputs:

```javascript
// hooks/post-graduation.js
async function postGraduationHook({ sessionOutput, engineerName, repoName }) {
  // 1. Structured summary → Confluence (for managers, if available)
  const summary = buildSessionSummary(sessionOutput);
  await mcp.confluence.writeSummaryIfAvailable(summary);

  // 2. Personal letter → local file (for the engineer only)
  const topicReports = JSON.parse(await readFile(`.onboarding/session-${today()}.json`));

  const letter = generateGraduationLetter({
    engineerName,
    repoName,
    topicReports,
    // Letter generator reads:
    // - Which topics the engineer aced (high XP, no struggled_with)
    // - Which topics they struggled with
    // - Open questions they asked (referenced by name in the letter)
    // - Their declared background (from Q1 at session start)
    tone: 'warm_senior_engineer',
  });

  await fs.mkdir('.onboarding', { recursive: true });
  await writeFile('.onboarding/your-onboarding-letter.md', letter);

  showMessage("✉️  A personal note has been saved to .onboarding/your-onboarding-letter.md — give it a read.");
}
```

**Graduation letter rules (enforced in prompt):**
- Addresses the engineer by first name
- References ≥2 specific things from their session (strong areas, good questions asked)
- Names one thing to watch out for — stated warmly, not as a warning
- Closes with a concrete next-step nudge toward their first PR
- Tone: senior engineer talking to a new teammate, not a system writing a report

**Output:** `.onboarding/your-onboarding-letter.md` — personal, local file. Not sent anywhere.

### 3.4 Hook Registration

In `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "skill:onboarding",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/pre-onboarding.js" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "onboarding:topic_quiz_complete",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/post-topic-quiz.js" }]
      },
      {
        "matcher": "onboarding:graduation",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/post-graduation.js" }]
      }
    ]
  }
}
```

### 3.5 Skill Migration

Update `.claude/skills/onboarding/SKILL.md` to be docs-driven:

- Remove hardcoded Jurnal/Quickbook knowledge
- Replace with doc injection placeholders: `{codebase_context}`, `{domain_context}`, `{workflow_context}`, `{system_design_context}`
- Emit `onboarding:topic_quiz_complete` signal after each topic quiz (with topic name + quiz results)
- Emit `onboarding:graduation` signal when all topics complete or cheat code used
- Challenges generated from actual repo structure, not hardcoded examples

**Deliverables:**
- [ ] `pre-onboarding.js` hook implemented (repo-agnostic docs resolution)
- [ ] `post-topic-quiz.js` hook implemented (per-topic, appends to session JSON)
- [ ] `post-graduation.js` hook implemented (Confluence summary + personal letter)
- [ ] All three hooks registered in `settings.json`
- [ ] SKILL.md refactored to emit topic and graduation signals
- [ ] `.onboarding/` added to `.gitignore`
- [ ] Docs freshness warning implemented

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

## Open Questions

1. **Docs ownership:** Should generated `/docs/` be committed to the repo or stored externally? Recommendation: commit to repo — teams own and maintain them.

2. **Doc generation cost:** First run on a large repo (Quickbook) may take 3–5 minutes. Is this acceptable UX? Mitigation: run async, show progress, cache result.

3. **Confluence dependency:** Some repos may not have a corresponding Confluence space. How should the MCP handle this? Mitigation: graceful degradation to README + GitHub only.

4. **Multi-repo services:** Engineers working across multiple repos — should sessions be per-repo or per-engineer? Recommendation: per-repo sessions, linked under one Confluence engineer page.

5. **Docs staleness policy:** Who triggers re-generation? Recommendation: auto-warn if >90 days, provide `/onboarding refresh-docs` command.
