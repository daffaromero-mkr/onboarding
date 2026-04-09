# Project Report: Mekari Engineering Onboarding MCP

**Submitted by:** Maulana  
**Date:** April 9, 2026  
**Division:** Engineering Platform / Developer Experience  

---

## Executive Summary

This report proposes the **Mekari Engineering Onboarding MCP** — an AI-powered onboarding system that replaces manual, fragmented onboarding across Mekari divisions with a single, repo-aware, self-service experience.

The core problem: new engineers across Jurnal, Talenta, and Flex spend 3–5 days getting oriented before making their first meaningful contribution. Senior engineers lose 2–4 hours per week to repetitive onboarding questions. This is a recurring cost that scales linearly with headcount growth.

The proposed solution reduces time-to-first-PR from ~5 days to ≤3 days, reclaims senior engineer time, and scales onboarding investment once across all divisions.

---

## 1. Problem

### What Is Happening Today

| Pain Point                                                                                                       | Impact                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Onboarding docs are scattered across Confluence, README, CLAUDE.md, and tribal knowledge                         | New engineers don't know where to start                                         |
| Onboarding quality depends on which team you join — large teams have wikis, small teams rely on senior engineers | Inconsistent experience and knowledge gaps                                      |
| New engineers ask the same foundational questions repeatedly via Slack DMs                                       | Senior engineers interrupted 3–5x/day in first 2 weeks of a new joiner's tenure |
| No feedback loop — no one knows which topics cause the most confusion                                            | Engineering managers can't improve onboarding systematically                    |
| The existing onboarding skill only works in the Quickbook repo                                                   | All other repos and divisions have no automated onboarding support              |

### The Cost (Estimated)

Assuming 2 new engineers per month across divisions, each requiring ~4 hours of senior engineer support:

- **8 senior engineer hours/month** consumed by onboarding Q&A
- **~2 additional days** to first meaningful PR vs. a well-onboarded engineer
- **Churn risk** — poor onboarding is a documented contributor to early-tenure attrition

---

## 2. Proposed Solution

### Mekari Engineering Onboarding MCP

A **repo-aware MCP harness** that any engineer can invoke from any Mekari repo:

```
/onboarding
```

The system runs in three steps:

**Step 1 — Docs Resolution**  
Checks if the repo has onboarding documentation in `/docs/`. If yes, loads it. If not, automatically generates comprehensive documentation covering system design, codebase structure, domain context, and engineering workflow — then begins onboarding.

**Step 2 — Adaptive Onboarding Session**  
Asks the engineer 3 questions (language preference, background, squad) and adapts accordingly. A Java developer joining Jurnal gets Rails concepts explained as Spring analogues. A fresh grad gets gentler pacing. Four parallel sub-agents cover Codebase, Workflow, Domain, and Culture simultaneously — results stream in as they finish.

**Step 3 — Session Summary to Confluence**  
When the session ends, a structured summary is written to Confluence under the engineer's onboarding page. Engineering managers get visibility into what was covered, what questions were raised, and what next steps remain — without being in the room.

### What Makes This Different From the Existing Skill

|                    | Existing SKILL.md        | Proposed MCP                                |
| ------------------ | ------------------------ | ------------------------------------------- |
| Scope              | Quickbook repo only      | Any Mekari repo                             |
| Knowledge source   | Hardcoded in SKILL.md    | Live from `/docs/` or auto-generated        |
| Division awareness | Jurnal only              | Jurnal, Talenta, Flex, and future divisions |
| Undocumented repos | Not supported            | Generates docs automatically                |
| Session tracking   | None                     | Confluence summaries per engineer           |
| Maintenance        | Manual edits to SKILL.md | Teams own `/docs/` files                    |

---

## 3. Expected Impact

### For New Engineers
- Onboarding starts in under 1 minute — no waiting for senior availability
- Session adapts to their background — a Java developer isn't forced through a generic Rails intro
- Can resume across multiple sessions — no need to absorb everything on day one
- Self-paced and repeatable — engineer can return to any topic

### For Senior Engineers
- Estimated **3–4 hours/week reclaimed** from repetitive onboarding Q&A
- Code review quality improves — new engineers understand conventions before touching code
- Less context-switching during deep work periods

### For Engineering Managers
- Session summaries give data on common confusion points across new joiners
- Can identify systemic knowledge gaps (e.g., if 8 out of 10 new engineers ask the same question, that's a docs gap to fix)
- Onboarding progress is visible without requiring a 1:1 to check in

### For the Organization
- Onboarding investment built once, scales across all divisions
- Reduces risk of early-tenure attrition caused by poor onboarding experience
- Any undocumented internal repo gets a documented baseline automatically

---

## 4. Success Metrics

| Metric                                       | Current Baseline | 3-Month Target              |
| -------------------------------------------- | ---------------- | --------------------------- |
| Time to first meaningful PR                  | ~5 days          | ≤ 3 days                    |
| Senior engineer hours/week on onboarding Q&A | ~4 hours         | ≤ 1 hour                    |
| New joiner satisfaction score                | Not tracked      | ≥ 4.0 / 5.0                 |
| Session completion rate                      | N/A              | ≥ 80% complete Phase 1–3    |
| Divisions covered                            | 1 (Jurnal)       | ≥ 3 (Jurnal, Talenta, Flex) |
| Internal repos with onboarding docs          | ~1 (Quickbook)   | ≥ 10                        |

---

## 5. Implementation Phases

### Timeline Overview

| Phase       | Scope                                                                 | Duration |
| ----------- | --------------------------------------------------------------------- | -------- |
| **Phase 1** | MCP server setup (Confluence + GitHub), repo-division mapping         | 1 week   |
| **Phase 2** | Doc Generation Agent — auto-generates `/docs/` for undocumented repos | 2 weeks  |
| **Phase 3** | Harness + hooks — docs resolution, session injection, summary writing | 2 weeks  |
| **Phase 4** | Sub-agent architecture — 4 parallel agents reading from `/docs/`      | 1 week   |
| **Phase 5** | Jurnal pilot (5 new joiners), feedback collection                     | 2 weeks  |
| **Phase 6** | Talenta + Flex expansion, full rollout                                | 2 weeks  |

**Total estimated timeline: 10 weeks from kickoff**

### Milestones

- **Week 2:** MCP servers live, doc generation working on Quickbook
- **Week 5:** Full harness running, Jurnal pilot begins
- **Week 7:** Pilot complete, feedback incorporated
- **Week 10:** All three divisions live

---

## 6. Resource Requirements

### Engineering
- **1 engineer (lead):** Full MCP harness, doc generation agent, hooks — ~6 weeks
- **0.5 engineer:** Sub-agent architecture, session orchestration — ~3 weeks
- **0.5 engineer (per division team):** Review and commit generated `/docs/` — ~4 hours per repo, one-time

### Infrastructure
- Confluence API token (read + write, scoped to Engineering spaces)
- GitHub token (read-only, Mekari org)
- MCP server hosting (can run as local servers on engineer machines initially, then move to shared infra)

### Maintenance (ongoing)
- Docs freshness check warns teams if `/docs/` files are >90 days old
- Division map updates when new repos are created — low effort (add one entry to `division-map.json`)
- No ongoing maintenance of onboarding logic — session adapts from docs, not hardcoded prompts

---

## 7. Risks

| Risk                                              | Likelihood | Mitigation                                                                             |
| ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| Doc generation is inaccurate for complex repos    | Medium     | Agent marks output as `AUTO-GENERATED — please review`; team reviews before committing |
| Teams don't maintain `/docs/` after generation    | Medium     | MCP warns if docs are >90 days old; session summaries create visible accountability    |
| Confluence dependency failure                     | Low        | Graceful fallback to README + CLAUDE.md; session continues                             |
| First-run doc generation takes too long (3–5 min) | Low        | Runs once per repo; shows progress indicator; caches result                            |
| Low adoption if engineers don't know it exists    | Medium     | Include in Mekari engineering onboarding email + Slack announcement                    |

---

## 8. Deliverables

Upon completion, the following will be in place:

- [ ] MCP harness running from any Mekari repo
- [ ] Doc Generation Agent tested on ≥5 internal repos
- [ ] `/docs/` committed and reviewed for Jurnal, Talenta, Flex flagship repos
- [ ] Onboarding session summaries flowing into Confluence
- [ ] `GUIDE.md` distributed to all engineering teams
- [ ] Metrics dashboard (Confluence or Slack) showing adoption and session completion rates

---

## 9. Recommendation

This project addresses a recurring, measurable cost — senior engineer time and slow new-joiner ramp — with a one-time engineering investment that scales across the organization.

The existing SKILL.md proves the approach works for Jurnal. This project makes it work everywhere, removes the dependency on pre-written documentation, and adds the visibility layer (Confluence summaries) that engineering managers currently lack.

**Recommended approval for Phase 1–3 kickoff.** Phases 4–6 can be reviewed after the Jurnal pilot results are available.

---

## Appendix

- [Workshop Idea Doc](./workshop-mcp-onboarding.md) — full architecture and technical spec
- [Implementation Plan](./MCP-IMPLEMENTATION-PLAN.md) — detailed build plan with pseudocode
- [User Guide](./GUIDE.md) — how engineers will use the system
- [Existing Skill](./.claude/skills/onboarding/SKILL.md) — current implementation (Jurnal/Quickbook only)
