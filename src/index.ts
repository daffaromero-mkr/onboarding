#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "path";

import { scanRepoDocs } from "./tools/scan-docs.js";
import { analyzeRepoStructure } from "./tools/analyze-repo.js";
import { generateOnboardingDocs, checkDocsFreshness } from "./tools/generate-docs.js";
import { resolveDivision } from "./tools/resolve-division.js";
import { saveSessionNotes, listPastSessions } from "./tools/save-notes.js";

const server = new McpServer({
  name: "mcp-onboarding",
  version: "1.0.0",
});

// ─── Tool: scan_repo_docs ────────────────────────────────────────────────────
server.tool(
  "scan_repo_docs",
  `Scan a repository for existing onboarding documentation.
Checks: CLAUDE.md, README.md, docs/, .claude/skills/onboarding/SKILL.md.
Returns found content and whether dedicated onboarding docs exist.
Call this FIRST before any other tool to determine what context is available.`,
  {
    repo_path: z
      .string()
      .optional()
      .describe("Absolute path to the repository root. Defaults to current working directory."),
  },
  async ({ repo_path }) => {
    const repoPath = resolve(repo_path ?? process.cwd());
    const result = await scanRepoDocs(repoPath);

    const output = [
      result.summary,
      "",
      ...result.sources.map((s) => [
        `### ${s.path} (${s.type})`,
        `Onboarding-focused: ${s.isOnboardingFocused}`,
        "```",
        s.content.slice(0, 3000),
        s.content.length > 3000 ? "[...truncated — full content available via analyze_repo_structure]" : "",
        "```",
      ].join("\n")),
    ].join("\n\n");

    return {
      content: [{ type: "text", text: output }],
    };
  }
);

// ─── Tool: analyze_repo_structure ───────────────────────────────────────────
server.tool(
  "analyze_repo_structure",
  `Detect the tech stack, framework, key directories, test setup, and complexity of a repository.
Use this when scan_repo_docs finds no dedicated onboarding docs, or to supplement existing docs with live structural context.
Returns: language, framework, package manager, test framework, Docker/CI status, key directories.`,
  {
    repo_path: z
      .string()
      .optional()
      .describe("Absolute path to the repository root. Defaults to current working directory."),
  },
  async ({ repo_path }) => {
    const repoPath = resolve(repo_path ?? process.cwd());
    const result = await analyzeRepoStructure(repoPath);

    const output = [
      `## Repository Structure Analysis`,
      result.summary,
      "",
      `### Tech Stack Details`,
      `- Language: ${result.techStack.language}`,
      `- Framework: ${result.techStack.framework ?? "not detected"}`,
      `- Package manager: ${result.techStack.packageManager ?? "not detected"}`,
      `- Test framework: ${result.techStack.testFramework ?? "not detected"}`,
      `- Docker: ${result.techStack.hasDocker ? "yes" : "no"}`,
      `- CI/CD: ${result.techStack.hasCICD ? result.techStack.cicdPlatform : "not detected"}`,
      result.techStack.extraTech.length ? `- Extra tech: ${result.techStack.extraTech.join(", ")}` : "",
      "",
      `### Directory Map`,
      `Key dirs: ${result.keyDirs.join(", ") || "none"}`,
      `Test dirs: ${result.testDirs.join(", ") || "none"}`,
      `Entry points: ${result.entryPoints.join(", ") || "none detected"}`,
      `Top-level: ${result.topLevelFiles.join(", ")}`,
    ]
      .filter((l) => l !== "")
      .join("\n");

    return {
      content: [{ type: "text", text: output }],
    };
  }
);

// ─── Tool: generate_onboarding_docs ─────────────────────────────────────────
server.tool(
  "generate_onboarding_docs",
  `Generate four persistent onboarding documentation files and write them to /docs/ in the repo:
  - codebase.md     — folder structure, key files, patterns, danger zones
  - workflow.md     — local setup, PR lifecycle, CI/CD, deploy
  - domain.md       — business entities, glossary, domain rules
  - system-design.md — tech stack, architecture, external dependencies

Use this when scan_repo_docs finds NO onboarding docs (hasOnboardingDocs: false).
Files are written to disk — they belong to the team, should be reviewed and committed.
Subsequent /onboarding sessions will load from /docs/ without regenerating.`,
  {
    repo_path: z
      .string()
      .optional()
      .describe("Absolute path to the repository root. Defaults to current working directory."),
  },
  async ({ repo_path }) => {
    const repoPath = resolve(repo_path ?? process.cwd());
    const analysis = await analyzeRepoStructure(repoPath);
    const result = await generateOnboardingDocs(repoPath, analysis);

    const docPreviews = result.docs
      .filter((d) => d.wasWritten)
      .map((d) => [`### ${d.fileName}`, d.content.slice(0, 800), d.content.length > 800 ? "\n[...full file written to disk]" : ""].join("\n"))
      .join("\n\n");

    const output = [result.summary, "", docPreviews].join("\n");

    return {
      content: [{ type: "text", text: output }],
    };
  }
);

// ─── Tool: check_docs_freshness ──────────────────────────────────────────────
server.tool(
  "check_docs_freshness",
  `Check whether the /docs/ onboarding files are fresh or stale (older than 90 days by default).
Call this at the start of a session after scan_repo_docs confirms docs exist.
Returns a warning if any docs are stale, with a suggestion to run /onboarding refresh-docs.`,
  {
    repo_path: z
      .string()
      .optional()
      .describe("Absolute path to the repository root. Defaults to current working directory."),
    stale_days_threshold: z
      .number()
      .int()
      .default(90)
      .describe("Number of days after which a doc is considered stale. Default: 90."),
  },
  async ({ repo_path, stale_days_threshold }) => {
    const repoPath = resolve(repo_path ?? process.cwd());
    const result = await checkDocsFreshness(repoPath, stale_days_threshold);
    return {
      content: [{ type: "text", text: result.summary }],
    };
  }
);

// ─── Tool: resolve_division ──────────────────────────────────────────────────
server.tool(
  "resolve_division",
  `Detect which product/division a repository belongs to by reading its git remote URL.
Returns division slug, product name, and confidence level.
Supports: Mekari Jurnal, Talenta, Flex, Klikpajak, Sign, and falls back to repo name for unknown repos.`,
  {
    repo_path: z
      .string()
      .optional()
      .describe("Absolute path to the repository root. Defaults to current working directory."),
    override_division: z
      .string()
      .optional()
      .describe("Manually specify a division slug to override auto-detection (e.g. 'talenta')."),
  },
  async ({ repo_path, override_division }) => {
    const repoPath = resolve(repo_path ?? process.cwd());

    if (override_division) {
      return {
        content: [
          {
            type: "text",
            text: [
              `## Division (manual override)`,
              `Division: ${override_division}`,
              `Product name: ${override_division} (manually specified)`,
              `Confidence: high (manual)`,
              `Note: Division was overridden by user.`,
            ].join("\n"),
          },
        ],
      };
    }

    const result = resolveDivision(repoPath);

    const output = [
      `## Division Resolution`,
      `Division: ${result.division}`,
      `Product name: ${result.productName}`,
      `Repo name: ${result.repoName}`,
      `Remote URL: ${result.remoteUrl ?? "not found"}`,
      `Confidence: ${result.confidence}`,
      `Note: ${result.note}`,
      result.confidence === "low"
        ? `\nTo override: call resolve_division with override_division="<your-division-slug>"`
        : "",
    ].join("\n");

    return {
      content: [{ type: "text", text: output }],
    };
  }
);

// ─── Tool: save_session_notes ────────────────────────────────────────────────
server.tool(
  "save_session_notes",
  `Persist a structured onboarding session summary to .onboarding-sessions/ in the repo.
Call this at the END of the onboarding session to save progress, open questions, and next steps.
Creates .onboarding-sessions/<date>-<engineer-name>.md in the repository root.`,
  {
    repo_path: z
      .string()
      .optional()
      .describe("Absolute path to the repository root. Defaults to current working directory."),
    engineer_name: z.string().optional().describe("Name of the engineer being onboarded."),
    language: z
      .enum(["en", "id"])
      .default("en")
      .describe("Session language: 'en' (English) or 'id' (Bahasa Indonesia)."),
    division: z.string().describe("Division or product slug (e.g. 'jurnal', 'talenta')."),
    product_name: z.string().describe("Human-readable product name (e.g. 'Mekari Jurnal')."),
    topics_covered: z
      .array(z.string())
      .default([])
      .describe("List of topics covered during the session."),
    open_questions: z
      .array(z.string())
      .default([])
      .describe("Questions the engineer raised that weren't fully answered."),
    xp_earned: z.number().int().default(0).describe("XP earned during gamified challenges."),
    next_steps: z
      .array(z.string())
      .default([])
      .describe("Action items for the engineer after the session."),
    freeform_notes: z
      .string()
      .optional()
      .describe("Any additional freeform notes from the session."),
  },
  async ({
    repo_path,
    engineer_name,
    language,
    division,
    product_name,
    topics_covered,
    open_questions,
    xp_earned,
    next_steps,
    freeform_notes,
  }) => {
    const repoPath = resolve(repo_path ?? process.cwd());
    const result = await saveSessionNotes({
      repoPath,
      engineerName: engineer_name,
      language,
      division,
      productName: product_name,
      topicsCovered: topics_covered,
      openQuestions: open_questions,
      xpEarned: xp_earned,
      nextSteps: next_steps,
      freeformNotes: freeform_notes,
    });

    const output = result.success
      ? `✅ Session notes saved to: ${result.savedPath}`
      : `❌ Failed to save session notes: ${result.error}`;

    return { content: [{ type: "text", text: output }] };
  }
);

// ─── Tool: list_past_sessions ────────────────────────────────────────────────
server.tool(
  "list_past_sessions",
  `List previous onboarding session notes saved in .onboarding-sessions/ for this repo.
Use this at the start of a new session to check if the engineer has been partially onboarded before.`,
  {
    repo_path: z
      .string()
      .optional()
      .describe("Absolute path to the repository root. Defaults to current working directory."),
  },
  async ({ repo_path }) => {
    const repoPath = resolve(repo_path ?? process.cwd());
    const sessions = await listPastSessions(repoPath);

    const output =
      sessions.length > 0
        ? [`## Past Onboarding Sessions (${sessions.length})`, ...sessions.map((s) => `- ${s}`)].join("\n")
        : "No past sessions found in .onboarding-sessions/";

    return { content: [{ type: "text", text: output }] };
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
