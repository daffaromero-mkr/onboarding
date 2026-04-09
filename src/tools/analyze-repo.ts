import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";

export interface TechStack {
  language: string;
  framework: string | null;
  packageManager: string | null;
  testFramework: string | null;
  hasDocker: boolean;
  hasCICD: boolean;
  cicdPlatform: string | null;
  extraTech: string[];
}

export interface RepoStructure {
  techStack: TechStack;
  keyDirs: string[];
  entryPoints: string[];
  testDirs: string[];
  complexity: "small" | "medium" | "large";
  linesOfCodeEstimate: string;
  topLevelFiles: string[];
  summary: string;
}

async function readFileSafe(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf-8");
  } catch {
    return null;
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function detectTechStack(repoPath: string): Promise<TechStack> {
  const stack: TechStack = {
    language: "unknown",
    framework: null,
    packageManager: null,
    testFramework: null,
    hasDocker: false,
    hasCICD: false,
    cicdPlatform: null,
    extraTech: [],
  };

  // Ruby / Rails
  const gemfile = await readFileSafe(join(repoPath, "Gemfile"));
  if (gemfile) {
    stack.language = "ruby";
    if (gemfile.includes("rails")) {
      stack.framework = "Ruby on Rails";
      stack.packageManager = "bundler";
    }
    if (gemfile.includes("rspec")) stack.testFramework = "RSpec";
    if (gemfile.includes("sidekiq")) stack.extraTech.push("Sidekiq");
    if (gemfile.includes("karafka")) stack.extraTech.push("Karafka/Kafka");
    if (gemfile.includes("searchkick") || gemfile.includes("elasticsearch")) stack.extraTech.push("Elasticsearch");
    if (gemfile.includes("pundit")) stack.extraTech.push("Pundit (authorization)");
    if (gemfile.includes("mongoid")) stack.extraTech.push("MongoDB (Mongoid)");
  }

  // Node.js / JavaScript / TypeScript
  const pkgJson = await readFileSafe(join(repoPath, "package.json"));
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (stack.language === "unknown") stack.language = "javascript/typescript";
      if (deps["next"]) stack.framework = "Next.js";
      else if (deps["nuxt"]) stack.framework = "Nuxt.js";
      else if (deps["@vue/cli-service"] || deps["vue"]) stack.framework = stack.framework ?? "Vue.js";
      else if (deps["react"]) stack.framework = stack.framework ?? "React";
      else if (deps["express"]) stack.framework = stack.framework ?? "Express.js";
      else if (deps["fastify"]) stack.framework = stack.framework ?? "Fastify";
      else if (deps["@nestjs/core"]) stack.framework = stack.framework ?? "NestJS";

      if (await fileExists(join(repoPath, "yarn.lock"))) stack.packageManager = stack.packageManager ?? "yarn";
      else if (await fileExists(join(repoPath, "pnpm-lock.yaml"))) stack.packageManager = stack.packageManager ?? "pnpm";
      else stack.packageManager = stack.packageManager ?? "npm";

      if (deps["jest"]) stack.testFramework = stack.testFramework ?? "Jest";
      else if (deps["vitest"]) stack.testFramework = stack.testFramework ?? "Vitest";
      else if (deps["mocha"]) stack.testFramework = stack.testFramework ?? "Mocha";

      if (deps["typescript"] || await fileExists(join(repoPath, "tsconfig.json"))) {
        stack.language = "typescript";
      }
    } catch {
      // malformed package.json
    }
  }

  // Python
  const requirements = await readFileSafe(join(repoPath, "requirements.txt"));
  const pyproject = await readFileSafe(join(repoPath, "pyproject.toml"));
  if (requirements || pyproject) {
    if (stack.language === "unknown") stack.language = "python";
    const combined = (requirements ?? "") + (pyproject ?? "");
    if (combined.includes("django")) stack.framework = "Django";
    else if (combined.includes("fastapi")) stack.framework = "FastAPI";
    else if (combined.includes("flask")) stack.framework = "Flask";
    if (combined.includes("pytest")) stack.testFramework = "pytest";
    stack.packageManager = pyproject ? "poetry/pip" : "pip";
  }

  // Java / Spring
  const pomXml = await readFileSafe(join(repoPath, "pom.xml"));
  const gradleFile = await readFileSafe(join(repoPath, "build.gradle"));
  if (pomXml || gradleFile) {
    if (stack.language === "unknown") stack.language = "java";
    const combined = (pomXml ?? "") + (gradleFile ?? "");
    if (combined.includes("spring-boot")) stack.framework = "Spring Boot";
    else if (combined.includes("spring")) stack.framework = "Spring";
    if (combined.includes("junit")) stack.testFramework = "JUnit";
    stack.packageManager = pomXml ? "maven" : "gradle";
  }

  // Go
  const goMod = await readFileSafe(join(repoPath, "go.mod"));
  if (goMod) {
    if (stack.language === "unknown") stack.language = "go";
    if (goMod.includes("gin-gonic")) stack.framework = "Gin";
    else if (goMod.includes("echo")) stack.framework = "Echo";
    else if (goMod.includes("fiber")) stack.framework = "Fiber";
    stack.packageManager = "go modules";
    stack.testFramework = "go test";
  }

  // Docker / CI
  stack.hasDocker =
    (await fileExists(join(repoPath, "Dockerfile"))) ||
    (await fileExists(join(repoPath, "docker-compose.yml"))) ||
    (await fileExists(join(repoPath, "docker-compose.yaml")));

  const githubActions = await dirExists(join(repoPath, ".github", "workflows"));
  const gitlabCI = await fileExists(join(repoPath, ".gitlab-ci.yml"));
  const bitbucketPipelines = await fileExists(join(repoPath, "bitbucket-pipelines.yml"));
  const circleCI = await dirExists(join(repoPath, ".circleci"));

  if (githubActions) { stack.hasCICD = true; stack.cicdPlatform = "GitHub Actions"; }
  else if (gitlabCI) { stack.hasCICD = true; stack.cicdPlatform = "GitLab CI"; }
  else if (bitbucketPipelines) { stack.hasCICD = true; stack.cicdPlatform = "Bitbucket Pipelines"; }
  else if (circleCI) { stack.hasCICD = true; stack.cicdPlatform = "CircleCI"; }

  // Extra tech detection from common config files
  if (await fileExists(join(repoPath, "config", "redis.yml")) || await fileExists(join(repoPath, "config", "cable.yml"))) {
    stack.extraTech.push("Redis");
  }
  if (await fileExists(join(repoPath, "config", "database.yml"))) {
    const dbYml = await readFileSafe(join(repoPath, "config", "database.yml")) ?? "";
    if (dbYml.includes("mysql")) stack.extraTech.push("MySQL");
    else if (dbYml.includes("postgres")) stack.extraTech.push("PostgreSQL");
    else if (dbYml.includes("sqlite")) stack.extraTech.push("SQLite");
  }

  return stack;
}

async function getTopLevelEntries(repoPath: string): Promise<string[]> {
  try {
    const entries = await readdir(repoPath);
    return entries.filter((e) => !e.startsWith(".") || e === ".claude");
  } catch {
    return [];
  }
}

async function detectKeyDirs(repoPath: string, allEntries: string[]): Promise<string[]> {
  const interesting = [
    "app", "src", "lib", "pkg", "cmd", "api", "server",
    "services", "workers", "jobs", "consumers",
    "components", "pages", "views", "layouts",
    "config", "db", "database", "migrations",
    "spec", "test", "tests", "__tests__",
    "docs", "scripts", "bin",
  ];
  const found: string[] = [];
  for (const dir of interesting) {
    if (allEntries.includes(dir) && await dirExists(join(repoPath, dir))) {
      found.push(dir);
    }
  }
  return found;
}

function estimateComplexity(keyDirs: string[], topLevel: string[]): "small" | "medium" | "large" {
  const score = keyDirs.length + topLevel.length;
  if (score < 10) return "small";
  if (score < 20) return "medium";
  return "large";
}

export async function analyzeRepoStructure(repoPath: string): Promise<RepoStructure> {
  const techStack = await detectTechStack(repoPath);
  const topLevelFiles = await getTopLevelEntries(repoPath);
  const keyDirs = await detectKeyDirs(repoPath, topLevelFiles);

  const testDirs = keyDirs.filter((d) => ["spec", "test", "tests", "__tests__"].includes(d));
  const entryPoints: string[] = [];

  // Detect entry points
  for (const candidate of ["main.rb", "application.rb", "config.ru", "main.ts", "main.js", "index.ts", "index.js", "main.go", "main.py", "app.py", "manage.py", "App.java"]) {
    const found = topLevelFiles.includes(candidate) || (await fileExists(join(repoPath, "src", candidate))) || (await fileExists(join(repoPath, "app", candidate)));
    if (found) entryPoints.push(candidate);
  }
  // Rails-specific
  if (await fileExists(join(repoPath, "config", "application.rb"))) {
    entryPoints.push("config/application.rb");
  }
  if (await fileExists(join(repoPath, "config", "routes.rb"))) {
    entryPoints.push("config/routes.rb");
  }

  const complexity = estimateComplexity(keyDirs, topLevelFiles);
  const linesEstimate = complexity === "small" ? "<5k lines" : complexity === "medium" ? "5k–50k lines" : ">50k lines";

  const stackLine = [
    techStack.language !== "unknown" ? `Language: ${techStack.language}` : null,
    techStack.framework ? `Framework: ${techStack.framework}` : null,
    techStack.packageManager ? `Package manager: ${techStack.packageManager}` : null,
    techStack.testFramework ? `Test framework: ${techStack.testFramework}` : null,
    techStack.extraTech.length ? `Extra: ${techStack.extraTech.join(", ")}` : null,
    techStack.hasDocker ? "Docker: yes" : null,
    techStack.hasCICD ? `CI/CD: ${techStack.cicdPlatform}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const summary = [
    `Repo complexity: ${complexity} (${linesEstimate})`,
    stackLine,
    `Key directories: ${keyDirs.join(", ") || "none detected"}`,
    `Test directories: ${testDirs.join(", ") || "none detected"}`,
    `Entry points: ${entryPoints.join(", ") || "not identified"}`,
  ].join("\n");

  return { techStack, keyDirs, entryPoints, testDirs, complexity, linesOfCodeEstimate: linesEstimate, topLevelFiles, summary };
}
