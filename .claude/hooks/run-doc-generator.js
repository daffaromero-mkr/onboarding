#!/usr/bin/env node
/**
 * Doc Generation Orchestrator
 *
 * Reads .onboarding/doc-generation-request.json and invokes the
 * doc-generator skill as a Claude Code sub-agent for each missing topic.
 *
 * Called by pre-onboarding.js when doc generation is needed.
 * Can also be invoked directly: node run-doc-generator.js
 *
 * Requires: claude CLI in PATH (Claude Code)
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const requestPath = join(cwd, '.onboarding', 'doc-generation-request.json');

async function main() {
  // Read the generation request
  if (!existsSync(requestPath)) {
    console.error('No doc-generation-request.json found — nothing to generate.');
    process.exit(0);
  }

  let request;
  try {
    request = JSON.parse(readFileSync(requestPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse doc-generation-request.json: ${err.message}`);
    process.exit(1);
  }

  const { topics_to_generate, repo_name, repo_remote } = request;

  if (!topics_to_generate || topics_to_generate.length === 0) {
    console.error('No topics to generate.');
    rmSync(requestPath, { force: true });
    process.exit(0);
  }

  // Ensure /docs/ directory exists
  mkdirSync(join(cwd, 'docs'), { recursive: true });

  console.error(`\n⚙️  Generating docs for: ${topics_to_generate.join(', ')}`);
  console.error(`   Repo: ${repo_name}`);
  console.error(`   This only runs once and saves to /docs/\n`);

  // Check if claude CLI is available
  const claudeAvailable = checkClaudeCLI();

  if (claudeAvailable) {
    await generateWithClaude(topics_to_generate, repo_name, cwd);
  } else {
    // Fallback: write placeholder docs so the session can proceed
    console.error('⚠️  claude CLI not found — writing placeholder docs.');
    writePlaceholderDocs(topics_to_generate, repo_name, cwd);
  }

  // Clean up request file
  rmSync(requestPath, { force: true });

  console.error(`\n✓ Doc generation complete. Files written to docs/\n`);
}

function checkClaudeCLI() {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function generateWithClaude(topics, repoName, cwd) {
  // Build the prompt for the doc-generator skill
  const prompt = buildDocGeneratorPrompt(topics, repoName);

  console.error('   Invoking doc-generator skill via Claude Code...');

  const result = spawnSync(
    'claude',
    [
      '--print',                              // non-interactive output
      '--allowedTools', 'Read,Write,Glob,Grep,Bash',
      '--system-prompt', getSystemPrompt(),
      '--message', prompt,
    ],
    {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5 * 60 * 1000,                // 5 minute timeout
      encoding: 'utf8',
    }
  );

  if (result.error) {
    console.error(`Doc generation error: ${result.error.message}`);
    writePlaceholderDocs(topics, repoName, cwd);
    return;
  }

  if (result.status !== 0) {
    console.error(`Doc generation failed (exit ${result.status}).`);
    console.error(result.stderr?.slice(0, 500));
    writePlaceholderDocs(topics, repoName, cwd);
    return;
  }

  // Verify files were written
  const written = topics.filter(t => existsSync(join(cwd, 'docs', `${t}.md`)));
  const missing = topics.filter(t => !existsSync(join(cwd, 'docs', `${t}.md`)));

  if (missing.length > 0) {
    console.error(`   Some files weren't written: ${missing.join(', ')} — writing placeholders.`);
    writePlaceholderDocs(missing, repoName, cwd);
  }

  console.error(`   ✓ Written: ${written.map(t => `docs/${t}.md`).join(', ')}`);
}

function buildDocGeneratorPrompt(topics, repoName) {
  return `You are running as the doc-generator skill for the Mekari onboarding MCP.

The repository "${repoName}" is missing onboarding documentation for the following topics:
${topics.map(t => `- ${t}`).join('\n')}

Your task: analyze this repository and generate the missing documentation files.

Follow the doc-generator skill instructions exactly:
1. Read .onboarding/doc-generation-request.json to confirm which topics to generate
2. Run repo reconnaissance (Step 1)
3. Run deep reconnaissance for each topic (Step 2)
4. Write each doc file using the exact templates (Step 3)
5. Only write topics listed in the request — do not regenerate existing docs

Files to write:
${topics.map(t => `- docs/${t}.md`).join('\n')}

Start now.`;
}

function getSystemPrompt() {
  // Read the doc-generator SKILL.md as the system prompt
  const skillPath = join(__dirname, '..', 'skills', 'doc-generator', 'SKILL.md');
  if (existsSync(skillPath)) {
    const content = readFileSync(skillPath, 'utf8');
    // Strip frontmatter
    return content.replace(/^---[\s\S]*?---\n/, '').trim();
  }
  return 'You are a technical documentation agent. Analyze the repo and write accurate docs.';
}

function writePlaceholderDocs(topics, repoName, cwd) {
  const date = new Date().toISOString().split('T')[0];

  const placeholders = {
    'codebase': `# Codebase Guide — ${repoName}

> AUTO-GENERATED PLACEHOLDER on ${date}
> The doc generator could not run automatically. Please fill this in manually.
> Run \`/doc-generator\` in Claude Code to generate this properly.

## Folder Structure

<!-- TODO: Document the main folder structure -->

## Entry Points

<!-- TODO: Document where the app starts -->

## Key Files

<!-- TODO: List the most important files for a new engineer -->

## Naming Conventions

<!-- TODO: Document naming conventions -->

## Common Patterns

<!-- TODO: Document recurring patterns (service objects, repositories, etc.) -->

## Danger Zones

<!-- TODO: Document files/areas that require extra care -->

## Test Structure

<!-- TODO: Document how to run tests -->
`,

    'workflow': `# Engineering Workflow — ${repoName}

> AUTO-GENERATED PLACEHOLDER on ${date}
> The doc generator could not run automatically. Please fill this in manually.

## Local Setup

\`\`\`bash
# TODO: Add setup commands
\`\`\`

## Branch Naming

<!-- TODO: Document branch naming convention -->

## PR Lifecycle

<!-- TODO: Document the PR process -->

## CI/CD Pipeline

<!-- TODO: Document CI steps -->

## Testing

<!-- TODO: Document how to run tests -->

## Deployment

<!-- TODO: Document deploy process -->
`,

    'domain': `# Domain Context — ${repoName}

> AUTO-GENERATED PLACEHOLDER on ${date}
> The doc generator could not run automatically. Please fill this in manually.

## What This Product Does

<!-- TODO: 1-3 sentences about what this product is -->

## Core Domain Entities

<!-- TODO: List the main things this system manages -->

## Glossary

<!-- TODO: Define domain-specific terms engineers will encounter -->

## Domain Rules

<!-- TODO: Document the key business rules enforced by the code -->
`,

    'system-design': `# System Design — ${repoName}

> AUTO-GENERATED PLACEHOLDER on ${date}
> The doc generator could not run automatically. Please fill this in manually.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TODO |
| Framework | TODO |
| Database | TODO |
| Cache | TODO |
| Queue | TODO |

## Architecture Overview

<!-- TODO: Describe the overall architecture -->

## External Dependencies

<!-- TODO: List external services this repo calls -->

## Data Flow

<!-- TODO: Describe how data flows through the system -->
`,
  };

  for (const topic of topics) {
    const filePath = join(cwd, 'docs', `${topic}.md`);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, placeholders[topic] ?? `# ${topic}\n\n> Placeholder — fill in manually.\n`);
      console.error(`   ✓ Placeholder written: docs/${topic}.md`);
    }
  }
}

main().catch(err => {
  console.error(`run-doc-generator error: ${err.message}`);
  // Write placeholders so the session isn't blocked
  try {
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));
    writePlaceholderDocs(request.topics_to_generate ?? [], request.repo_name ?? 'unknown', cwd);
  } catch {}
  process.exit(0);
});
