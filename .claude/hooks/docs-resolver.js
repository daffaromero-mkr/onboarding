#!/usr/bin/env node
/**
 * Repo-agnostic docs resolver.
 *
 * Scans ALL doc levels simultaneously, scores completeness per topic,
 * and returns what's covered and what's missing. README is always included.
 * Never stops at the first match — merges everything it finds.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, basename } from 'path';

// Which topics each source file covers
const TOPIC_COVERAGE = {
  'docs/system-design.md':                ['system-design'],
  'docs/codebase.md':                     ['codebase'],
  'docs/domain.md':                       ['domain'],
  'docs/workflow.md':                     ['workflow'],
  '.claude/skills/onboarding/SKILL.md':   ['codebase', 'workflow', 'domain'],
  'CLAUDE.md':                            ['workflow', 'codebase'],
  'README.md':                            ['codebase'],
};

const REQUIRED_TOPICS = ['system-design', 'codebase', 'domain', 'workflow'];
const MIN_USEFUL_BYTES = 500;
const STALE_DAYS = 90;

export async function resolveRepoContext(cwd = process.cwd()) {
  const repoName = basename(cwd);
  let repoRemote = null;

  try {
    repoRemote = execSync('git remote get-url origin', {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
  } catch {}

  // Step 1: Scan ALL levels — never skip a level
  const sources = {};
  const staleWarnings = [];

  for (const [relativePath, coveredTopics] of Object.entries(TOPIC_COVERAGE)) {
    const fullPath = join(cwd, relativePath);

    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf8');
    if (content.trim().length < MIN_USEFUL_BYTES) continue; // near-empty, skip

    // Check staleness for /docs/ files
    if (relativePath.startsWith('docs/')) {
      const stat = statSync(fullPath);
      const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > STALE_DAYS) {
        staleWarnings.push(`${relativePath} (${Math.round(ageDays)} days old)`);
      }
    }

    sources[relativePath] = { content, coveredTopics };
  }

  // Also scan for any additional .md files in /docs/ not in TOPIC_COVERAGE
  const docsDir = join(cwd, 'docs');
  if (existsSync(docsDir)) {
    for (const file of readdirSync(docsDir)) {
      if (!file.endsWith('.md')) continue;
      const rel = `docs/${file}`;
      if (sources[rel]) continue; // already scanned

      const fullPath = join(cwd, rel);
      const content = readFileSync(fullPath, 'utf8');
      if (content.trim().length >= MIN_USEFUL_BYTES) {
        sources[rel] = { content, coveredTopics: ['supplementary'] };
      }
    }
  }

  // Step 2: Compute covered and missing topics
  const coveredTopics = new Set(
    Object.values(sources).flatMap(s => s.coveredTopics)
  );
  const missingTopics = REQUIRED_TOPICS.filter(t => !coveredTopics.has(t));

  return {
    repo_name:       repoName,
    repo_remote:     repoRemote,
    sources,                              // all usable files with content
    covered_topics:  [...coveredTopics],
    missing_topics:  missingTopics,       // only these need generation
    is_sufficient:   missingTopics.length === 0,
    stale_warnings:  staleWarnings,
  };
}

// Build a merged context string for injection into the session
export function mergeDocSources(sources) {
  const sections = [];

  for (const [path, { content }] of Object.entries(sources)) {
    sections.push(`\n\n<!-- SOURCE: ${path} -->\n${content}`);
  }

  return sections.join('');
}

// CLI usage: node docs-resolver.js
if (process.argv[1] === import.meta.url.replace('file://', '')) {
  const ctx = await resolveRepoContext();
  console.log(JSON.stringify(ctx, null, 2));
}
