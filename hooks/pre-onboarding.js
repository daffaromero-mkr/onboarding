#!/usr/bin/env node
/**
 * pre-onboarding.js
 *
 * PreToolUse hook — fires before the /onboarding skill loads.
 * Resolves the repo context and injects it as an environment variable
 * that the skill can read via Bash.
 *
 * Claude Code hook registration (.claude/settings.json):
 *
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": "mcp__mcp-onboarding__scan_repo_docs",
 *       "hooks": [{ "type": "command", "command": "node /path/to/hooks/pre-onboarding.js" }]
 *     }]
 *   }
 *
 * Output written to stdout is shown to Claude as context before the tool runs.
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const repoPath = process.cwd();

function getGitRemote() {
  try {
    return execSync("git remote get-url origin", { cwd: repoPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function getGitBranch() {
  try {
    return execSync("git branch --show-current", { cwd: repoPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "unknown";
  }
}

function hasOnboardingDocs() {
  const docsDir = join(repoPath, "docs");
  if (!existsSync(docsDir)) return false;
  const required = ["codebase.md", "workflow.md", "domain.md", "system-design.md"];
  return required.some((f) => existsSync(join(docsDir, f)));
}

function hasLegacySkill() {
  return existsSync(join(repoPath, ".claude", "skills", "onboarding", "SKILL.md"));
}

function hasCLAUDEMd() {
  return existsSync(join(repoPath, "CLAUDE.md")) || existsSync(join(repoPath, ".claude", "CLAUDE.md"));
}

function countPastSessions() {
  const dir = join(repoPath, ".onboarding-sessions");
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

// ─── Collect and emit context ────────────────────────────────────────────────

const remote = getGitRemote();
const branch = getGitBranch();
const docs = hasOnboardingDocs();
const legacy = hasLegacySkill();
const claude = hasCLAUDEMd();
const sessions = countPastSessions();

const docState = docs
  ? "✅ /docs/ onboarding files found"
  : legacy
  ? "⚠️  Legacy .claude/skills/onboarding/SKILL.md found (no /docs/ yet)"
  : claude
  ? "⚠️  CLAUDE.md found but no /docs/ or skill — will use CLAUDE.md as context"
  : "❌ No onboarding docs found — doc generation will run before session starts";

const lines = [
  "# Pre-Onboarding Context (auto-injected by hook)",
  `Repo path:    ${repoPath}`,
  `Git remote:   ${remote ?? "not found"}`,
  `Branch:       ${branch}`,
  `Doc state:    ${docState}`,
  `Past sessions: ${sessions === 0 ? "none" : sessions + " session(s) found in .onboarding-sessions/"}`,
  "",
  "This context was gathered before the skill loaded. Use it to skip re-running git commands.",
];

process.stdout.write(lines.join("\n") + "\n");
process.exit(0);
