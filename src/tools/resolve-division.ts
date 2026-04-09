import { execSync } from "child_process";

export interface DivisionInfo {
  division: string;
  productName: string;
  repoName: string;
  remoteUrl: string | null;
  confidence: "high" | "medium" | "low";
  note: string;
}

// Maps git remote URL patterns → division metadata
const DIVISION_MAP: Array<{
  patterns: RegExp[];
  division: string;
  productName: string;
}> = [
  {
    patterns: [/quickbook/i, /jurnal/i, /mekari-jurnal/i],
    division: "jurnal",
    productName: "Mekari Jurnal",
  },
  {
    patterns: [/talenta/i, /mekari-talenta/i, /hris/i],
    division: "talenta",
    productName: "Mekari Talenta",
  },
  {
    patterns: [/flex/i, /mekari-flex/i, /expense/i],
    division: "flex",
    productName: "Mekari Flex",
  },
  {
    patterns: [/klikpajak/i, /pajak/i],
    division: "klikpajak",
    productName: "Klikpajak",
  },
  {
    patterns: [/mekari-sign/i, /esign/i, /sign-core/i],
    division: "sign",
    productName: "Mekari Sign",
  },
  {
    patterns: [/accounting-service/i, /acc-service/i],
    division: "accounting-service",
    productName: "Mekari Accounting Service",
  },
];

function extractRepoName(remoteUrl: string): string {
  // Handles: git@github.com:org/repo.git, https://github.com/org/repo.git
  const match = remoteUrl.match(/[/:]([^/:]+\/[^/]+?)(\.git)?$/);
  if (match) return match[1];
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

export function resolveDivision(repoPath: string): DivisionInfo {
  const remoteUrl = getGitRemote(repoPath);
  const repoName = remoteUrl ? extractRepoName(remoteUrl) : repoPath.split("/").pop() ?? "unknown";

  if (remoteUrl) {
    for (const entry of DIVISION_MAP) {
      if (entry.patterns.some((p) => p.test(remoteUrl) || p.test(repoName))) {
        return {
          division: entry.division,
          productName: entry.productName,
          repoName,
          remoteUrl,
          confidence: "high",
          note: `Matched via git remote URL: ${remoteUrl}`,
        };
      }
    }
  }

  // Fallback: derive from repo name itself
  for (const entry of DIVISION_MAP) {
    if (entry.patterns.some((p) => p.test(repoName))) {
      return {
        division: entry.division,
        productName: entry.productName,
        repoName,
        remoteUrl,
        confidence: "medium",
        note: `Matched via repo directory name. Remote URL: ${remoteUrl ?? "not found"}`,
      };
    }
  }

  // Unknown — return the repo name as the division slug
  return {
    division: repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    productName: repoName,
    repoName,
    remoteUrl,
    confidence: "low",
    note: `Unknown division. Using repo name as fallback. Override with: /onboarding division=<name>`,
  };
}
