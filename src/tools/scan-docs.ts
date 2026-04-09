import { readFile, readdir, stat } from "fs/promises";
import { join, extname, relative } from "path";

interface DocSource {
  path: string;
  type: "claude_md" | "readme" | "skill" | "docs_dir" | "ai_workflow";
  content: string;
  isOnboardingFocused: boolean;
}

interface ScanResult {
  hasOnboardingDocs: boolean;
  hasCLAUDEMd: boolean;
  sources: DocSource[];
  summary: string;
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function collectMarkdownFiles(
  dir: string,
  repoRoot: string,
  maxFiles = 30,
  maxBytesPerFile = 8000
): Promise<DocSource[]> {
  const results: DocSource[] = [];

  async function walk(current: string): Promise<void> {
    if (results.length >= maxFiles) return;
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      // Skip hidden dirs except .claude
      if (entry.startsWith(".") && entry !== ".claude") continue;
      // Skip common non-doc dirs
      if (["node_modules", "vendor", "dist", ".git", "tmp", "log"].includes(entry)) continue;

      const fullPath = join(current, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        await walk(fullPath);
      } else if (extname(entry) === ".md") {
        const raw = await readFileSafe(fullPath);
        if (!raw) continue;
        const content = raw.length > maxBytesPerFile ? raw.slice(0, maxBytesPerFile) + "\n\n[...truncated]" : raw;
        const relPath = relative(repoRoot, fullPath);
        results.push({
          path: relPath,
          type: "docs_dir",
          content,
          isOnboardingFocused: isOnboardingFile(relPath, content),
        });
      }
    }
  }

  await walk(dir);
  return results;
}

function isOnboardingFile(path: string, content: string): boolean {
  const onboardingKeywords = [
    "onboarding",
    "getting started",
    "first day",
    "new engineer",
    "new joiner",
    "setup",
    "architecture",
    "how to",
    "welcome",
  ];
  const pathLower = path.toLowerCase();
  const contentLower = content.slice(0, 500).toLowerCase();
  return onboardingKeywords.some((kw) => pathLower.includes(kw) || contentLower.includes(kw));
}

export async function scanRepoDocs(repoPath: string): Promise<ScanResult> {
  const sources: DocSource[] = [];

  // 1. CLAUDE.md — highest priority
  const claudeMdContent = await readFileSafe(join(repoPath, "CLAUDE.md"));
  if (claudeMdContent) {
    sources.push({
      path: "CLAUDE.md",
      type: "claude_md",
      content: claudeMdContent,
      isOnboardingFocused: true,
    });
  }

  // 2. .claude/CLAUDE.md — local project overrides
  const localClaudeMd = await readFileSafe(join(repoPath, ".claude", "CLAUDE.md"));
  if (localClaudeMd) {
    sources.push({
      path: ".claude/CLAUDE.md",
      type: "claude_md",
      content: localClaudeMd,
      isOnboardingFocused: true,
    });
  }

  // 3. README.md
  const readmeContent =
    (await readFileSafe(join(repoPath, "README.md"))) ??
    (await readFileSafe(join(repoPath, "README")));
  if (readmeContent) {
    sources.push({
      path: "README.md",
      type: "readme",
      content: readmeContent.slice(0, 10000),
      isOnboardingFocused: isOnboardingFile("README.md", readmeContent),
    });
  }

  // 4. Existing onboarding skill
  const skillContent = await readFileSafe(
    join(repoPath, ".claude", "skills", "onboarding", "SKILL.md")
  );
  if (skillContent) {
    sources.push({
      path: ".claude/skills/onboarding/SKILL.md",
      type: "skill",
      content: skillContent.slice(0, 15000),
      isOnboardingFocused: true,
    });
  }

  // 5. docs/ directory — recursively collect markdown
  const docsDir = join(repoPath, "docs");
  try {
    await stat(docsDir);
    const docFiles = await collectMarkdownFiles(docsDir, repoPath);
    sources.push(...docFiles);
  } catch {
    // no docs/ dir
  }

  // 6. AI workflow docs (common pattern from Mekari/Jurnal)
  const aiWorkflowDir = join(repoPath, "docs", "ai-workflow");
  // Already covered by docs/ walk above, no duplicate needed

  const hasOnboardingDocs = sources.some((s) => s.isOnboardingFocused && s.type !== "readme");
  const hasCLAUDEMd = sources.some((s) => s.type === "claude_md");

  const onboardingSourceCount = sources.filter((s) => s.isOnboardingFocused).length;
  const summary = [
    `Found ${sources.length} documentation source(s) in ${repoPath}.`,
    hasCLAUDEMd ? "✅ CLAUDE.md present — primary AI context available." : "⚠️  No CLAUDE.md found.",
    hasOnboardingDocs
      ? `✅ ${onboardingSourceCount} onboarding-focused doc(s) found.`
      : "⚠️  No dedicated onboarding docs found — repo structure analysis will be used to generate context.",
    `Sources: ${sources.map((s) => s.path).join(", ") || "none"}`,
  ].join("\n");

  return { hasOnboardingDocs, hasCLAUDEMd, sources, summary };
}
