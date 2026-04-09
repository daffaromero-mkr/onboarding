#!/usr/bin/env node
/**
 * PostToolUse hook — fires when SKILL.md writes a topic signal file.
 * Matches on: Write tool → .onboarding/signals/topic-*.json
 *
 * Appends the topic quiz result to the session report.
 * One append per topic; four total per session.
 *
 * Input: reads the signal file path + content from CLAUDE_TOOL_INPUT env var.
 * Output: .onboarding/session-{date}.json (created or appended)
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { resolveEngineerName } from './utils/engineer-name.js';
import { today, nowTime } from './utils/today.js';

const cwd = process.cwd();
const onboardingDir = join(cwd, '.onboarding');

async function main() {
  // Claude Code passes the Write tool's input as JSON on stdin or via env
  let toolInput;
  try {
    const raw = process.env.CLAUDE_TOOL_INPUT;
    if (raw) {
      toolInput = JSON.parse(raw);
    } else {
      // Read from stdin (alternate invocation)
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      toolInput = JSON.parse(Buffer.concat(chunks).toString());
    }
  } catch {
    process.exit(0); // can't parse input — bail silently
  }

  // Parse the signal payload from the written file content
  let payload;
  try {
    payload = JSON.parse(toolInput.content ?? toolInput.new_string ?? '{}');
  } catch {
    process.exit(0);
  }

  if (!payload.topic) process.exit(0); // not a valid topic signal

  const engineerName = resolveEngineerName(cwd);
  const repoName     = basename(cwd);
  const reportPath   = join(onboardingDir, `session-${today()}.json`);

  // Load or initialize session report
  let session = {
    engineer:     engineerName,
    repo:         repoName,
    session_date: today(),
    topics:       [],
  };

  if (existsSync(reportPath)) {
    try {
      session = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch {}
  }

  // Remove any previous entry for this topic (in case of retry)
  session.topics = session.topics.filter(t => t.topic !== payload.topic);

  // Append this topic's result
  session.topics.push({
    topic:          payload.topic,
    completed_at:   nowTime(),
    xp: {
      earned: payload.xp_earned ?? 0,
      max:    payload.xp_max ?? 50,
    },
    understood:     payload.correct_concepts   ?? [],
    struggled_with: payload.missed_concepts    ?? [],
    open_questions: payload.questions_asked    ?? [],
  });

  mkdirSync(onboardingDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(session, null, 2));

  console.error(`✓ Topic report saved: ${payload.topic} (${payload.xp_earned ?? 0}/${payload.xp_max ?? 50} XP)`);
}

main().catch(err => {
  console.error(`post-topic-quiz hook error (non-fatal): ${err.message}`);
  process.exit(0);
});
