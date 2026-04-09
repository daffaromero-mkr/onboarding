#!/usr/bin/env node
/**
 * post-onboarding.js
 *
 * PostToolUse hook — fires after the onboarding Agent tool completes.
 * Reads the session output from stdin (Claude Code passes tool result as JSON)
 * and writes a plain-text summary to .onboarding-sessions/ as a fallback
 * when the save_session_notes MCP tool wasn't explicitly called.
 *
 * Claude Code hook registration (.claude/settings.json):
 *
 *   "hooks": {
 *     "PostToolUse": [{
 *       "matcher": "Agent",
 *       "hooks": [{ "type": "command", "command": "node /path/to/hooks/post-onboarding.js" }]
 *     }]
 *   }
 *
 * Phase 2 extension point: when Confluence MCP is wired up, this hook
 * should also POST the summary to the engineer's Confluence onboarding page.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const repoPath = process.cwd();
const sessionsDir = join(repoPath, ".onboarding-sessions");

function formatDate() {
  return new Date().toISOString().split("T")[0];
}

function sessionAlreadyExists() {
  if (!existsSync(sessionsDir)) return false;
  const today = formatDate();
  try {
    return readdirSync(sessionsDir).some((f) => f.startsWith(today));
  } catch {
    return false;
  }
}

// Read tool result from stdin (Claude Code passes JSON)
let inputData = "";
process.stdin.on("data", (chunk) => { inputData += chunk; });
process.stdin.on("end", () => {
  // If save_session_notes was already called in the session, skip
  if (sessionAlreadyExists()) {
    process.stdout.write("Post-hook: session notes already saved by save_session_notes tool. Skipping.\n");
    process.exit(0);
  }

  // Write a minimal fallback summary
  try {
    mkdirSync(sessionsDir, { recursive: true });
  } catch { /* already exists */ }

  const date = formatDate();
  const fileName = `${date}-session.md`;
  const filePath = join(sessionsDir, fileName);

  const content = [
    `# Onboarding Session — ${date}`,
    "",
    `> Auto-saved by post-onboarding hook.`,
    `> For a full summary, call save_session_notes at the end of the session.`,
    "",
    `## Raw Tool Output`,
    "```",
    inputData.slice(0, 3000),
    inputData.length > 3000 ? "[...truncated]" : "",
    "```",
    "",
    `_Saved by post-onboarding.js hook at ${new Date().toISOString()}_`,
  ].join("\n");

  try {
    writeFileSync(filePath, content, "utf-8");
    process.stdout.write(`Post-hook: fallback session notes written to ${filePath}\n`);
  } catch (e) {
    process.stderr.write(`Post-hook error: could not write session notes — ${e}\n`);
  }

  process.exit(0);
});
