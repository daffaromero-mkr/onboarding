# MCP Onboarding System — Implementation Plan

> **Goal:** Build a repo-aware MCP harness that onboards engineers from any Mekari repo by resolving or generating docs first, then running an adaptive onboarding session.

---

## System Overview

```
/onboarding trigger
       │
       ▼
PreToolUse Hook
  ├── Detect repo (git remote)
  ├── Check /docs/ or .claude/skills/onboarding/
  │     ├── Found → inject into session context
  │     └── Missing → run Doc Generation Agent → write /docs/ → inject
  └── Fetch supplementary context (MCP Confluence, MCP GitHub)
       │
       ▼
Onboarding Session (docs-driven)
  └── 4 parallel sub-agents reading from /docs/
       │
       ▼
PostToolUse Hook
  └── Write session summary to Confluence
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

### 1.3 Repo → Division Mapping Table

File: `.claude/division-map.json`

```json
{
  "mappings": [
    {
      "division": "jurnal",
      "product_name": "Mekari Jurnal",
      "repo_patterns": ["quickbook", "jurnal-", "mekari-jurnal"],
      "confluence_space": "JURNAL",
      "onboarding_root_page_id": "12345678"
    },
    {
      "division": "talenta",
      "product_name": "Mekari Talenta",
      "repo_patterns": ["talenta-", "mekari-talenta", "hris-"],
      "confluence_space": "TALENTA",
      "onboarding_root_page_id": "23456789"
    },
    {
      "division": "flex",
      "product_name": "Mekari Flex",
      "repo_patterns": ["flex-", "mekari-flex"],
      "confluence_space": "FLEX",
      "onboarding_root_page_id": "34567890"
    },
    {
      "division": "platform",
      "product_name": "Mekari Engineering Platform",
      "repo_patterns": ["platform-", "eng-platform", "dx-"],
      "confluence_space": "ENG-PLATFORM",
      "onboarding_root_page_id": "45678901"
    }
  ],
  "fallback_division": "unknown",
  "fallback_confluence_space": "ENG"
}
```

**Deliverables:**
- [ ] MCP Confluence server running and authenticated
- [ ] MCP GitHub server running and authenticated
- [ ] `division-map.json` created with all known Mekari repo patterns

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

### 3.1 Docs Resolution Logic

```javascript
// hooks/pre-onboarding.js
async function preOnboardingHook() {
  const repoRemote = await exec('git remote get-url origin');
  const division = resolveDivision(repoRemote, divisionMap);

  // Priority 1: /docs/ folder
  const docsFolder = await checkPath('/docs/');
  const hasGeneratedDocs = docsFolder.includes('codebase.md')
    && docsFolder.includes('workflow.md')
    && docsFolder.includes('domain.md')
    && docsFolder.includes('system-design.md');

  // Priority 2: .claude/skills/onboarding/ (legacy)
  const hasLegacySkill = await checkPath('.claude/skills/onboarding/SKILL.md');

  // Priority 3: Minimal fallback
  const hasMinimalFallback = await checkPath('README.md');

  let docs;
  if (hasGeneratedDocs) {
    docs = await loadDocs('/docs/');
    checkDocsFreshness(docs); // warn if >90 days old
  } else if (hasLegacySkill) {
    docs = await loadLegacySkill('.claude/skills/onboarding/SKILL.md');
  } else if (hasMinimalFallback) {
    // Trigger doc generation
    showMessage('⚙️  No onboarding docs found. Generating docs for this repo...');
    await runDocGenerationAgent(repoRemote);
    docs = await loadDocs('/docs/');
  }

  // Fetch supplementary context
  const confluenceCtx = await mcp.confluence.fetchOnboardingContext(division);
  const githubCtx = await mcp.github.fetchRepoContext(repoRemote);

  return injectContext({ docs, confluenceCtx, githubCtx, division });
}
```

### 3.2 Hook Registration

In `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "skill:onboarding",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/pre-onboarding.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/post-onboarding.js"
          }
        ]
      }
    ]
  }
}
```

### 3.3 Skill Migration

Update `.claude/skills/onboarding/SKILL.md` to be docs-driven:

- Remove hardcoded Jurnal/Quickbook knowledge
- Replace with doc injection placeholders: `{codebase_context}`, `{domain_context}`, `{workflow_context}`, `{system_design_context}`
- Adaptive branching uses injected docs, not static content
- Challenges are generated from actual repo structure (not hardcoded examples)

**Deliverables:**
- [ ] `pre-onboarding.js` hook implemented and tested
- [ ] `post-onboarding.js` hook implemented
- [ ] Hook registered in `settings.json`
- [ ] SKILL.md refactored to be docs-driven (hardcoded knowledge removed)
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
├── settings.json                    # MCP server config + hook registration
├── division-map.json                # Repo → division mapping
├── hooks/
│   ├── pre-onboarding.js            # Docs resolution hook
│   └── post-onboarding.js          # Session summary writer
└── skills/
    └── onboarding/
        └── SKILL.md                 # Docs-driven onboarding mentor (refactored)

docs/ (per repo, generated or hand-written)
├── system-design.md
├── codebase.md
├── domain.md
└── workflow.md
```

---

## Open Questions

1. **Docs ownership:** Should generated `/docs/` be committed to the repo or stored externally? Recommendation: commit to repo — teams own and maintain them.

2. **Doc generation cost:** First run on a large repo (Quickbook) may take 3–5 minutes. Is this acceptable UX? Mitigation: run async, show progress, cache result.

3. **Confluence dependency:** Some repos may not have a corresponding Confluence space. How should the MCP handle this? Mitigation: graceful degradation to README + GitHub only.

4. **Multi-repo services:** Engineers working across multiple repos — should sessions be per-repo or per-engineer? Recommendation: per-repo sessions, linked under one Confluence engineer page.

5. **Docs staleness policy:** Who triggers re-generation? Recommendation: auto-warn if >90 days, provide `/onboarding refresh-docs` command.
