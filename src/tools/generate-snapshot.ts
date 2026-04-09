import { readFile, readdir, stat } from "fs/promises";
import { join, extname, relative } from "path";
import type { RepoStructure } from "./analyze-repo.js";

interface FileSnapshot {
  path: string;
  content: string;
  role: string; // e.g. "routes", "main model", "entry point"
}

interface RepoSnapshot {
  files: FileSnapshot[];
  directoryTree: string;
  summary: string;
}

async function readFileSafe(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf-8");
  } catch {
    return null;
  }
}

async function buildDirectoryTree(
  dir: string,
  repoRoot: string,
  depth = 0,
  maxDepth = 3,
  lines: string[] = []
): Promise<string[]> {
  if (depth > maxDepth) return lines;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return lines;
  }

  const skip = new Set(["node_modules", "vendor", ".git", "dist", "tmp", "log", ".bundle", "coverage"]);
  for (const entry of entries.sort()) {
    if (skip.has(entry)) continue;
    const fullPath = join(dir, entry);
    let s;
    try { s = await stat(fullPath); } catch { continue; }
    const indent = "  ".repeat(depth);
    const relPath = relative(repoRoot, fullPath);
    if (s.isDirectory()) {
      lines.push(`${indent}${entry}/`);
      await buildDirectoryTree(fullPath, repoRoot, depth + 1, maxDepth, lines);
    } else {
      lines.push(`${indent}${entry}`);
    }
  }
  return lines;
}

async function snapshotKeyFiles(repoPath: string, analysis: RepoStructure): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];
  const MAX_BYTES = 6000;

  async function addFile(filePath: string, role: string): Promise<void> {
    const content = await readFileSafe(filePath);
    if (!content) return;
    const relPath = relative(repoPath, filePath);
    snapshots.push({
      path: relPath,
      content: content.length > MAX_BYTES ? content.slice(0, MAX_BYTES) + "\n# [truncated]" : content,
      role,
    });
  }

  // Always include these if they exist
  await addFile(join(repoPath, "CLAUDE.md"), "AI context / project rules");
  await addFile(join(repoPath, "README.md"), "project overview");

  const { language, framework } = analysis.techStack;

  // Rails-specific key files
  if (framework === "Ruby on Rails") {
    await addFile(join(repoPath, "Gemfile"), "dependency manifest");
    await addFile(join(repoPath, "config", "routes.rb"), "HTTP routes");
    await addFile(join(repoPath, "config", "application.rb"), "app configuration");
    await addFile(join(repoPath, "config", "database.yml"), "database config");

    // Sample: first model file found
    const modelsDir = join(repoPath, "app", "models");
    try {
      const models = (await readdir(modelsDir))
        .filter((f) => f.endsWith(".rb") && !f.includes("concern") && !f.includes("application"))
        .slice(0, 3);
      for (const m of models) {
        await addFile(join(modelsDir, m), `model: ${m.replace(".rb", "")}`);
      }
    } catch { /* no models dir */ }

    // Sample: first service file
    const servicesDir = join(repoPath, "app", "services");
    try {
      const services = (await readdir(servicesDir)).filter((f) => f.endsWith(".rb")).slice(0, 2);
      for (const s of services) {
        await addFile(join(servicesDir, s), `service object: ${s.replace(".rb", "")}`);
      }
    } catch { /* no services dir */ }
  }

  // Node/TypeScript key files
  if (language === "typescript" || language === "javascript/typescript") {
    await addFile(join(repoPath, "package.json"), "dependency manifest");
    await addFile(join(repoPath, "tsconfig.json"), "TypeScript config");

    for (const candidate of ["src/index.ts", "src/main.ts", "src/app.ts", "index.ts", "main.ts"]) {
      await addFile(join(repoPath, candidate), "application entry point");
    }
  }

  // Python key files
  if (language === "python") {
    await addFile(join(repoPath, "pyproject.toml"), "dependency manifest");
    await addFile(join(repoPath, "requirements.txt"), "dependency manifest");
    for (const candidate of ["manage.py", "app.py", "main.py", "src/main.py"]) {
      await addFile(join(repoPath, candidate), "application entry point");
    }
  }

  // Java key files
  if (language === "java") {
    await addFile(join(repoPath, "pom.xml"), "dependency manifest");
    await addFile(join(repoPath, "build.gradle"), "build config");
  }

  // Go key files
  if (language === "go") {
    await addFile(join(repoPath, "go.mod"), "module definition");
    for (const candidate of ["main.go", "cmd/main.go", "cmd/server/main.go"]) {
      await addFile(join(repoPath, candidate), "application entry point");
    }
  }

  // Docker / CI
  await addFile(join(repoPath, "Dockerfile"), "container definition");
  await addFile(join(repoPath, "docker-compose.yml"), "local dev services");

  // Deduplicate by path
  const seen = new Set<string>();
  return snapshots.filter((s) => {
    if (seen.has(s.path)) return false;
    seen.add(s.path);
    return true;
  });
}

export async function generateRepoSnapshot(
  repoPath: string,
  analysis: RepoStructure
): Promise<RepoSnapshot> {
  const [files, treeLines] = await Promise.all([
    snapshotKeyFiles(repoPath, analysis),
    buildDirectoryTree(repoPath, repoPath),
  ]);

  const directoryTree = treeLines.join("\n");

  const summary = [
    `Snapshot of ${repoPath}`,
    `Files captured: ${files.length}`,
    `Directory tree: ${treeLines.length} entries`,
    "",
    "Use this snapshot to synthesize an onboarding session for a new engineer.",
    "Focus on: architecture, how to run the project, danger zones, key patterns.",
  ].join("\n");

  return { files, directoryTree, summary };
}
