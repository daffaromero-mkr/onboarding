#!/usr/bin/env node
/**
 * PostToolUse hook — fires when SKILL.md writes graduation.json signal.
 * Matches on: Write tool → .onboarding/signals/graduation.json
 *
 * Two outputs:
 *  1. Confluence session summary — silent no-op if MCP unavailable
 *  2. .onboarding/your-onboarding-letter.md — always written, no dependencies
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { resolveEngineerName } from './utils/engineer-name.js';
import { today } from './utils/today.js';

const cwd       = process.cwd();
const repoName  = basename(cwd);
const onboardingDir = join(cwd, '.onboarding');

async function main() {
  const engineerName = resolveEngineerName(cwd);
  const reportPath   = join(onboardingDir, `session-${today()}.json`);

  // Load topic reports
  let topicReports = { engineer: engineerName, repo: repoName, topics: [] };
  if (existsSync(reportPath)) {
    try {
      topicReports = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch {}
  }

  // 1. Confluence summary — silent no-op if unavailable
  await tryWriteConfluenceSummary(engineerName, repoName, topicReports);

  // 2. Personal graduation letter — always written
  const letter = buildGraduationLetter(engineerName, repoName, topicReports);

  mkdirSync(onboardingDir, { recursive: true });
  writeFileSync(join(onboardingDir, 'your-onboarding-letter.md'), letter);

  console.error(`✉️  Personal note saved to .onboarding/your-onboarding-letter.md`);
}

function buildGraduationLetter(name, repo, reports) {
  const topics     = reports.topics ?? [];
  const totalXP    = topics.reduce((sum, t) => sum + (t.xp?.earned ?? 0), 0);
  const maxXP      = topics.reduce((sum, t) => sum + (t.xp?.max ?? 50), 0);
  const acedTopics = topics.filter(t => t.xp?.earned >= (t.xp?.max ?? 50) * 0.9);
  const struggles  = topics.flatMap(t => t.struggled_with ?? []);
  const questions  = topics.flatMap(t => t.open_questions ?? []);
  const hasQuestions = questions.length > 0;
  const hasStruggles = struggles.length > 0;
  const date = today();

  // Pick the strongest topic
  const strongestTopic = [...topics].sort(
    (a, b) => (b.xp?.earned ?? 0) - (a.xp?.earned ?? 0)
  )[0];

  // Build letter sections
  const openingLine = name === 'there'
    ? `Hey — you made it.`
    : `Hey ${name} — you made it.`;

  const xpLine = maxXP > 0
    ? `You finished with **${totalXP} / ${maxXP} XP** — `
      + (totalXP >= maxXP * 0.8 ? "that's a strong run." : "solid effort.")
    : '';

  const strongSection = strongestTopic
    ? `## What stood out\n\n`
      + `You moved through **${strongestTopic.topic}** with real confidence`
      + (strongestTopic.understood.length > 0
          ? ` — picked up ${naturalList(strongestTopic.understood.slice(0, 3))} without much friction.`
          : '.')
      + (acedTopics.length > 1
          ? `\n\nAnd honestly? The same energy carried through ${naturalList(acedTopics.slice(1).map(t => t.topic))} too.`
          : '')
    : '';

  const questionSection = hasQuestions
    ? `## The questions you asked\n\n`
      + `The ones that stood out:\n\n`
      + questions.slice(0, 3).map(q => `- *"${q}"*`).join('\n')
      + `\n\nThose are the right questions. Most people don't ask them until they've already made the mistake. You asked them before. That's ahead of the curve.`
    : '';

  const watchOutSection = hasStruggles
    ? `## One thing to keep in mind\n\n`
      + `${struggles.slice(0, 2).map(s => `**${s}**`).join(' and ')} — `
      + `those tripped you up a bit, and that's completely normal. `
      + `Everyone hits those. Before you touch anything in those areas, just ping a senior. `
      + `Not because you can't figure it out — but because there's context there that isn't in any doc, `
      + `and a 5-minute conversation can save you a 2-hour debugging session.`
    : `## One thing to keep in mind\n\n`
      + `You moved through this clean. Before you touch the God Models (Company, Account, Transaction), `
      + `always check the callback chain first. That's the one thing that bites everyone eventually.`;

  const nextStepSection = `## What's next\n\n`
    + `Your first PR is the real onboarding. Pick something small — `
    + `a bug fix, a missing test, a minor edge case in ${repo}. `
    + `The code matters less than learning the review cycle with real stakes. `
    + `Get one merged. Then the next one gets easier.\n\n`
    + `You know where things live now. You know what to be careful of. `
    + `You know who to ask.\n\n`
    + `That's the whole job, honestly.`;

  const closing = `---\n\n`
    + `*— Your onboarding mentor*\n`
    + `*(and every engineer who ever added a line to ${repo})*`;

  return [
    `# ${openingLine}`,
    ``,
    `Seriously — getting through onboarding takes patience and it takes showing up. You did both.`,
    ``,
    xpLine,
    ``,
    strongSection,
    ``,
    questionSection,
    ``,
    watchOutSection,
    ``,
    nextStepSection,
    ``,
    closing,
    ``,
    `<!-- Generated: ${date} | Repo: ${repo} | Engineer: ${name} -->`,
  ].filter(line => line !== null).join('\n');
}

function naturalList(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

async function tryWriteConfluenceSummary(name, repo, reports) {
  if (!process.env.CONFLUENCE_API_TOKEN) return;
  if (!process.env.CONFLUENCE_URL) return;

  try {
    const topics   = reports.topics ?? [];
    const totalXP  = topics.reduce((sum, t) => sum + (t.xp?.earned ?? 0), 0);
    const allOpen  = topics.flatMap(t => t.open_questions ?? []);

    const body = {
      type:  'page',
      title: `Onboarding Session — ${name} — ${today()}`,
      space: { key: repo.toUpperCase() },
      body:  {
        storage: {
          value: `
            <h2>Session Summary</h2>
            <p><strong>Engineer:</strong> ${name} | <strong>Repo:</strong> ${repo} | <strong>Date:</strong> ${today()}</p>
            <p><strong>Total XP:</strong> ${totalXP}</p>
            <h3>Topics</h3>
            <ul>${topics.map(t =>
              `<li><strong>${t.topic}</strong>: ${t.xp?.earned ?? 0}/${t.xp?.max ?? 50} XP
               ${t.struggled_with?.length ? `— struggled with: ${t.struggled_with.join(', ')}` : ''}</li>`
            ).join('')}</ul>
            ${allOpen.length ? `<h3>Open Questions</h3><ul>${allOpen.map(q => `<li>${q}</li>`).join('')}</ul>` : ''}
          `,
          representation: 'storage',
        },
      },
    };

    await fetch(`${process.env.CONFLUENCE_URL}/rest/api/content`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.CONFLUENCE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Silent — Confluence is optional
  }
}

main().catch(err => {
  console.error(`post-graduation hook error (non-fatal): ${err.message}`);
  process.exit(0);
});
