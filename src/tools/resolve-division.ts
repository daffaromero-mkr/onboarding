import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface DivisionInfo {
  division: string;
  productName: string;
  repoName: string;
  remoteUrl: string | null;
  confluenceSpace: string | null;
  onboardingRootPageId: string | null;
  confidence: "high" | "medium" | "low";
  note: string;
}

interface DivisionEntry {
  division: string;
  product_name: string;
  repo_patterns: string[];
  confluence_space: string;
  onboarding_root_page_id: string | null;
}

interface DivisionMap {
  mappings: DivisionEntry[];
  fallback_division: string;
  fallback_confluence_space: string;
}

// Load division-map.json — first check project root, then package root
function loadDivisionMap(repoPath?: string): DivisionMap {
  const candidates = [
    repoPath ? join(repoPath, ".claude", "division-map.json") : null,
    repoPath ? join(repoPath, "division-map.json") : null,
    join(__dirname, "..", "..", "division-map.json"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, "utf-8")) as DivisionMap;
    } catch {
      continue;
    }
  }

  // Minimal fallback if file not found
  return { mappings: [], fallback_division: "unknown", fallback_confluence_space: "ENG" };
}

function extractRepoName(remoteUrl: string): string {
  const match = remoteUrl.match(/[/:]([^/:]+\/[^/]+?)(\.git)?$/);
  if (match) return match[1].split("/").pop() ?? remoteUrl;
  return remoteUrl.split("/").pop()?.replace(/\.git$/, "") ?? remoteUrl;
}

function getGitRemote(repoPath: string): string | null {
  try {
    return execSync("git remote get-url origin", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function matchEntry(
  entry: DivisionEntry,
  remoteUrl: string | null,
  repoName: string
): boolean {
  return entry.repo_patterns.some((pattern) => {
    const re = new RegExp(pattern, "i");
    return (remoteUrl && re.test(remoteUrl)) || re.test(repoName);
  });
}

export function resolveDivision(repoPath: string, overrideDivision?: string): DivisionInfo {
  const map = loadDivisionMap(repoPath);
  const remoteUrl = getGitRemote(repoPath);
  const repoName = remoteUrl ? extractRepoName(remoteUrl) : repoPath.split("/").pop() ?? "unknown";

  if (overrideDivision) {
    const matched = map.mappings.find((e) => e.division === overrideDivision);
    return {
      division: overrideDivision,
      productName: matched?.product_name ?? overrideDivision,
      repoName,
      remoteUrl,
      confluenceSpace: matched?.confluence_space ?? null,
      onboardingRootPageId: matched?.onboarding_root_page_id ?? null,
      confidence: "high",
      note: "Division was manually overridden.",
    };
  }

  // Try remote URL first (high confidence), then repo name (medium)
  for (const confidence of ["high", "medium"] as const) {
    const searchIn = confidence === "high" ? remoteUrl : repoName;
    if (!searchIn) continue;
    for (const entry of map.mappings) {
      if (entry.repo_patterns.some((p) => new RegExp(p, "i").test(searchIn))) {
        return {
          division: entry.division,
          productName: entry.product_name,
          repoName,
          remoteUrl,
          confluenceSpace: entry.confluence_space,
          onboardingRootPageId: entry.onboarding_root_page_id,
          confidence,
          note:
            confidence === "high"
              ? `Matched via git remote URL: ${remoteUrl}`
              : `Matched via repo directory name. Remote: ${remoteUrl ?? "not found"}`,
        };
      }
    }
  }

  // Unknown — use repo name as slug
  return {
    division: repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    productName: repoName,
    repoName,
    remoteUrl,
    confluenceSpace: map.fallback_confluence_space,
    onboardingRootPageId: null,
    confidence: "low",
    note: `Unknown division. Using repo name as fallback. Override with /onboarding division=<name>, or add entry to division-map.json.`,
  };
}
