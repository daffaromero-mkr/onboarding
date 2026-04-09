#!/usr/bin/env node
/**
 * PreToolUse hook — fires before /onboarding skill loads.
 *
 * Responsibilities:
 *  1. Resolve all available docs (repo-agnostic)
 *  2. Identify missing topics and trigger doc generation only for those
 *  3. Merge all sources into session context
 *  4. Optionally enrich with Confluence MCP (silent fallback if unavailable)
 *
 * Output: writes .onboarding/session-context.json for SKILL.md to read.
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveRepoContext, mergeDocSources } from './docs-resolver.js';
import { resolveEngineerName } from './utils/engineer-name.js';

const cwd = process.cwd();
const onboardingDir = join(cwd, '.onboarding');

async function main() {
  // Ensure .onboarding/ dir exists
  mkdirSync(onboardingDir, { recursive: true });
  mkdirSync(join(onboardingDir, 'signals'), { recursive: true });

  const ctx = await resolveRepoContext(cwd);

  // Warn about stale docs
  if (ctx.stale_warnings.length > 0) {
    console.error(`⚠️  Some docs are over 90 days old — consider refreshing:`);
    ctx.stale_warnings.forEach(w => console.error(`   • ${w}`));
  }

  // Generate only missing topics
  if (ctx.missing_topics.length > 0) {
    console.error(`⚙️  Missing docs for: ${ctx.missing_topics.join(', ')}. Generating...`);
    await runDocGenerationAgent(ctx);

    // Re-resolve to include newly generated files
    const refreshed = await resolveRepoContext(cwd);
    Object.assign(ctx, refreshed);
  }

  // Merge all sources into one context blob
  const mergedDocs = mergeDocSources(ctx.sources);

  // Try Confluence enrichment — silent no-op if unavailable
  let confluenceCtx = null;
  try {
    confluenceCtx = await fetchConfluenceContext(ctx.repo_name);
  } catch {
    // No token, server not running, or space not found — all fine
  }

  // Write session context for SKILL.md to inject
  const sessionContext = {
    repo_name:        ctx.repo_name,
    repo_remote:      ctx.repo_remote,
    docs_level:       ctx.is_sufficient ? 'full' : 'partial',
    covered_topics:   ctx.covered_topics,
    merged_docs:      mergedDocs,
    confluence:       confluenceCtx,
    generated_at:     new Date().toISOString(),
  };

  writeFileSync(
    join(onboardingDir, 'session-context.json'),
    JSON.stringify(sessionContext, null, 2)
  );

  console.error(`✓ Context ready — ${ctx.covered_topics.length}/4 topics covered (${ctx.repo_name})`);
}

async function runDocGenerationAgent(ctx) {
  const request = {
    topics_to_generate: ctx.missing_topics,
    repo_name:          ctx.repo_name,
    repo_remote:        ctx.repo_remote,
    requested_at:       new Date().toISOString(),
  };

  writeFileSync(
    join(onboardingDir, 'doc-generation-request.json'),
    JSON.stringify(request, null, 2)
  );

  // Invoke the orchestrator which calls the doc-generator skill via claude CLI
  const orchestratorPath = join(dirname(fileURLToPath(import.meta.url)), 'run-doc-generator.js');

  try {
    const { spawnSync } = await import('child_process');
    const result = spawnSync('node', [orchestratorPath], {
      cwd,
      stdio: 'inherit',
      timeout: 6 * 60 * 1000,
    });

    if (result.status !== 0) {
      console.error('Doc generator exited with errors — placeholders may have been written.');
    }
  } catch (err) {
    console.error(`Could not run doc generator: ${err.message}`);
    console.error('Onboarding will proceed with available docs.');
  }
}

async function fetchConfluenceContext(repoName) {
  // Only attempt if MCP Confluence env vars are present
  if (!process.env.CONFLUENCE_API_TOKEN) return null;
  if (!process.env.CONFLUENCE_URL) return null;

  const response = await fetch(
    `${process.env.CONFLUENCE_URL}/rest/api/content/search?cql=space.key="${repoName.toUpperCase()}" AND label="onboarding"&limit=5`,
    {
      headers: {
        Authorization: `Bearer ${process.env.CONFLUENCE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) return null;

  const data = await response.json();
  return {
    space:    repoName.toUpperCase(),
    pages:    data.results?.map(p => ({ id: p.id, title: p.title })) ?? [],
  };
}

main().catch(err => {
  // Hook errors must not block the session — log and exit cleanly
  console.error(`pre-onboarding hook error (non-fatal): ${err.message}`);
  process.exit(0);
});
