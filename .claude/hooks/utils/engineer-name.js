#!/usr/bin/env node
/**
 * Resolves the engineer's first name for use in hooks.
 * Priority: session-state.json → git config user.name → email prefix → "there"
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function resolveEngineerName(cwd = process.cwd()) {
  // Priority 1: captured from Q0 in session
  const statePath = join(cwd, '.onboarding', 'session-state.json');
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      if (state.engineer_name) return state.engineer_name;
    } catch {}
  }

  // Priority 2: git config user.name (first name only)
  try {
    const full = execSync('git config user.name', { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString().trim();
    if (full) return full.split(' ')[0];
  } catch {}

  // Priority 3: git config user.email prefix
  try {
    const email = execSync('git config user.email', { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString().trim();
    if (email) return email.split('@')[0];
  } catch {}

  // Graceful fallback
  return 'there';
}
