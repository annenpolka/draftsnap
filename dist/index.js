#!/usr/bin/env node

// src/cli.ts
import { createRequire } from "module";
import cac from "cac";

// src/core/git.ts
import { execFile } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
var GitError = class extends Error {
  args;
  exitCode;
  stdout;
  stderr;
  constructor(args, exitCode, stdout, stderr) {
    super(`git ${args.join(" ")} (exit code ${exitCode ?? "unknown"})`);
    this.name = "GitError";
    this.args = args;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
};
var DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
function stripTrailingNewline(value) {
  if (value.endsWith("\r\n")) {
    return value.slice(0, -2);
  }
  if (value.endsWith("\n")) {
    return value.slice(0, -1);
  }
  return value;
}
function createGitClient({ workTree, gitDir }) {
  return {
    async exec(args, options = {}) {
      const gitArgs = ["--git-dir", gitDir, "--work-tree", workTree, ...args];
      try {
        const { stdout, stderr } = await execFileAsync("git", gitArgs, {
          encoding: "utf8",
          maxBuffer: DEFAULT_MAX_BUFFER,
          cwd: options.cwd ?? workTree,
          env: {
            ...process.env,
            GIT_DIR: gitDir,
            GIT_WORK_TREE: workTree
          }
        });
        return {
          stdout: options.trim ?? true ? stripTrailingNewline(stdout) : stdout,
          stderr: options.trim ?? true ? stripTrailingNewline(stderr) : stderr
        };
      } catch (error) {
        if (error && typeof error === "object" && "stdout" in error && "stderr" in error) {
          const execError = error;
          const trim = options.trim ?? true;
          const stdout = execError.stdout ?? "";
          const stderr = execError.stderr ?? "";
          throw new GitError(
            args,
            typeof execError.code === "number" ? execError.code : null,
            trim ? stripTrailingNewline(stdout) : stdout,
            trim ? stripTrailingNewline(stderr) : stderr
          );
        }
        throw error;
      }
    }
  };
}

// src/core/repository.ts
import { mkdir, readdir, readFile as readFile2, stat as stat2, writeFile } from "fs/promises";
import { join as join2, relative } from "path";

// src/utils/gitdir.ts
import { readFile, stat } from "fs/promises";
import { isAbsolute, join, resolve } from "path";

// src/utils/fs.ts
function isErrno(error, code) {
  return !!error && typeof error === "object" && "code" in error && error.code === code;
}

// src/utils/gitdir.ts
function parseGitdir(content) {
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const lower = line.toLowerCase();
    if (lower.startsWith("gitdir:")) {
      return line.slice("gitdir:".length).trim();
    }
  }
  return null;
}
async function resolveMainGitDir(workTree) {
  const dotGit = join(workTree, ".git");
  try {
    const stats = await stat(dotGit);
    if (stats.isDirectory()) {
      return dotGit;
    }
    if (stats.isFile()) {
      const content = await readFile(dotGit, "utf8");
      const gitdir = parseGitdir(content);
      if (!gitdir) {
        throw new Error(`unable to parse gitdir from ${dotGit}`);
      }
      return isAbsolute(gitdir) ? gitdir : resolve(workTree, gitdir);
    }
    return null;
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

// src/core/repository.ts
async function pathExists(path) {
  try {
    await stat2(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
async function listFiles(root) {
  const results = [];
  async function walk(current, prefix) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const nextPath = join2(current, entry.name);
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(nextPath, nextPrefix);
      } else {
        results.push(nextPrefix.replace(/\\/g, "/"));
      }
    }
  }
  await walk(root, "");
  return results.sort();
}
async function ensureExclude(options) {
  const { workTree, scratchDir, gitDir, mainGitDir } = options;
  if (!mainGitDir) {
    return;
  }
  const excludePath = join2(mainGitDir, "info", "exclude");
  const excludeDir = join2(mainGitDir, "info");
  await mkdir(excludeDir, { recursive: true });
  const gitDirRelative = relative(workTree, gitDir) || gitDir;
  const desired = /* @__PURE__ */ new Set([
    `${scratchDir}/`,
    `${gitDirRelative}${gitDirRelative.endsWith("/") ? "" : "/"}`
  ]);
  let current = "";
  if (await pathExists(excludePath)) {
    current = await readFile2(excludePath, "utf8");
    for (const line of current.split("\n")) {
      if (line.trim()) {
        desired.delete(line.trim());
      }
    }
  }
  if (desired.size === 0) {
    return;
  }
  const append = `${Array.from(desired).join("\n")}
`;
  await writeFile(excludePath, current + append);
}
async function ensureSidecarExclude(gitDir, scratchDir) {
  const excludeDir = join2(gitDir, "info");
  const excludePath = join2(excludeDir, "exclude");
  await mkdir(excludeDir, { recursive: true });
  let current = "";
  const existingLines = /* @__PURE__ */ new Set();
  if (await pathExists(excludePath)) {
    current = await readFile2(excludePath, "utf8");
    for (const line of current.split("\n")) {
      if (line.trim()) {
        existingLines.add(line.trim());
      }
    }
  }
  const desired = ["*", `!${scratchDir}/`, `!${scratchDir}/**`];
  const missing = desired.filter((entry) => !existingLines.has(entry));
  if (missing.length === 0) {
    return;
  }
  const needsNewline = current.length > 0 && !current.endsWith("\n");
  const suffix = `${missing.join("\n")}
`;
  const content = needsNewline ? `${current}
${suffix}` : `${current}${suffix}`;
  await writeFile(excludePath, content);
}
async function ensureSidecar(options) {
  const { workTree, gitDir, scratchDir } = options;
  const git = createGitClient({ workTree, gitDir });
  let initialized = false;
  if (!await pathExists(join2(gitDir, "HEAD"))) {
    await git.exec(["init", "--quiet"]);
    initialized = true;
  }
  await mkdir(join2(workTree, scratchDir), { recursive: true });
  const mainGitDir = await resolveMainGitDir(workTree);
  await ensureExclude({ workTree, scratchDir, gitDir, mainGitDir });
  await ensureSidecarExclude(gitDir, scratchDir);
  const filesRoot = join2(workTree, scratchDir);
  const files = await listFiles(filesRoot);
  const prefixed = files.map((file) => `${scratchDir}/${file}`);
  return {
    initialized,
    gitDir,
    scratchDir,
    files: prefixed
  };
}

// src/types/errors.ts
var DraftsnapError = class extends Error {
  code;
  context;
  constructor(message, code, context) {
    super(message);
    this.name = "DraftsnapError";
    this.code = code;
    this.context = context;
  }
};
var LockError = class extends DraftsnapError {
  constructor(message = "another process holds the lock") {
    super(message, 12 /* LOCKED */);
    this.name = "LockError";
  }
};
var InvalidArgsError = class extends DraftsnapError {
  constructor(message) {
    super(message, 14 /* INVALID_ARGS */);
    this.name = "InvalidArgsError";
  }
};
var NotInitializedError = class extends DraftsnapError {
  constructor(message = "sidecar repository not initialized") {
    super(message, 11 /* NOT_INITIALIZED */);
    this.name = "NotInitializedError";
  }
};

// src/utils/path.ts
import { isAbsolute as isAbsolute2, posix, relative as relative2, resolve as resolve2, sep } from "path";
function toPosixPath(value) {
  return value.split(sep).join(posix.sep);
}
function sanitizeTargetPath(candidate, workTree, scratchDir) {
  const workRoot = resolve2(workTree);
  const scratchRoot = resolve2(workRoot, scratchDir);
  const targetAbs = isAbsolute2(candidate) ? resolve2(candidate) : resolve2(workRoot, candidate);
  const rel = relative2(scratchRoot, targetAbs);
  if (!rel || rel.startsWith("..") || rel === "") {
    return null;
  }
  if (rel.split(sep).some((segment) => segment === ".." || segment === "")) {
    return null;
  }
  return toPosixPath(`${scratchDir}/${rel}`);
}

// src/commands/diff.ts
function parseNumstat(output) {
  if (!output.trim()) {
    return [];
  }
  return output.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => line.split("	")).filter((parts) => parts.length === 3).map(([addedRaw, removedRaw, file]) => {
    const added = addedRaw === "-" ? 0 : Number.parseInt(addedRaw, 10);
    const removed = removedRaw === "-" ? 0 : Number.parseInt(removedRaw, 10);
    return {
      path: file,
      added: Number.isNaN(added) ? 0 : added,
      removed: Number.isNaN(removed) ? 0 : removed
    };
  });
}
async function diffCommand(options) {
  const { workTree, gitDir, scratchDir, json, logger, path, current, since } = options;
  await ensureSidecar({ workTree, gitDir, scratchDir });
  const git = createGitClient({ workTree, gitDir });
  let sanitizedPath;
  if (path) {
    const candidate = sanitizeTargetPath(path, workTree, scratchDir);
    if (!candidate) {
      throw new InvalidArgsError("path must be within scratch directory");
    }
    sanitizedPath = candidate;
  }
  const head = await git.exec(["rev-parse", "--verify", "HEAD"]).catch(() => null);
  if (!head) {
    return {
      status: "ok",
      code: 0 /* OK */,
      data: {
        basis: { type: "none" },
        entries: [],
        patch: ""
      }
    };
  }
  const pathArgs = sanitizedPath ? ["--", sanitizedPath] : [];
  if (current) {
    const patchArgs2 = ["diff", "HEAD", ...pathArgs];
    const numstatArgs2 = ["diff", "--numstat", "HEAD", ...pathArgs];
    const patchResult2 = await git.exec(patchArgs2);
    const numstatResult2 = await git.exec(numstatArgs2);
    const entries2 = parseNumstat(numstatResult2.stdout);
    if (!json) {
      if (patchResult2.stdout) {
        logger.info(patchResult2.stdout);
      } else if (entries2.length > 0) {
        entries2.forEach((entry) => {
          logger.info(`${entry.path} +${entry.added} -${entry.removed}`);
        });
      } else {
        logger.info("no differences");
      }
    }
    return {
      status: "ok",
      code: 0 /* OK */,
      data: {
        basis: { type: "current", new: "working", old: head.stdout },
        entries: entries2,
        patch: patchResult2.stdout
      }
    };
  }
  if (since !== void 0 && (!Number.isInteger(since) || since < 1)) {
    throw new InvalidArgsError("--since must be >= 1");
  }
  if (since === void 0) {
    const parent = await git.exec(["rev-parse", "HEAD^"]).catch(() => null);
    if (!parent) {
      if (!json) {
        logger.info("no previous commit to diff against");
      }
      return {
        status: "ok",
        code: 0 /* OK */,
        data: {
          basis: { type: "latest_pair", new: head.stdout, old: null },
          entries: [],
          patch: ""
        }
      };
    }
    const patchArgs2 = ["diff", parent.stdout, head.stdout, ...pathArgs];
    const numstatArgs2 = ["diff", "--numstat", parent.stdout, head.stdout, ...pathArgs];
    const patchResult2 = await git.exec(patchArgs2);
    const numstatResult2 = await git.exec(numstatArgs2);
    const entries2 = parseNumstat(numstatResult2.stdout);
    if (!json) {
      if (patchResult2.stdout) {
        logger.info(patchResult2.stdout);
      } else if (entries2.length > 0) {
        entries2.forEach((entry) => {
          logger.info(`${entry.path} +${entry.added} -${entry.removed}`);
        });
      } else {
        logger.info("no differences");
      }
    }
    return {
      status: "ok",
      code: 0 /* OK */,
      data: {
        basis: { type: "latest_pair", new: head.stdout, old: parent.stdout },
        entries: entries2,
        patch: patchResult2.stdout
      }
    };
  }
  const offset = since;
  const baseRef = await git.exec(["rev-parse", `HEAD~${offset}`]).catch(() => null);
  if (!baseRef) {
    return {
      status: "ok",
      code: 0 /* OK */,
      data: {
        basis: { type: "since", since: offset, new: head.stdout, old: null },
        entries: [],
        patch: ""
      }
    };
  }
  const patchArgs = ["diff", baseRef.stdout, head.stdout, ...pathArgs];
  const numstatArgs = ["diff", "--numstat", baseRef.stdout, head.stdout, ...pathArgs];
  const patchResult = await git.exec(patchArgs);
  const numstatResult = await git.exec(numstatArgs);
  const entries = parseNumstat(numstatResult.stdout);
  if (!json) {
    if (patchResult.stdout) {
      logger.info(patchResult.stdout);
    } else if (entries.length > 0) {
      entries.forEach((entry) => {
        logger.info(`${entry.path} +${entry.added} -${entry.removed}`);
      });
    } else {
      logger.info("no differences");
    }
  }
  return {
    status: "ok",
    code: 0 /* OK */,
    data: {
      basis: { type: "since", since: offset, new: head.stdout, old: baseRef.stdout },
      entries,
      patch: patchResult.stdout
    }
  };
}

// src/commands/ensure.ts
async function ensureCommand(options) {
  const { workTree, gitDir, scratchDir, json, logger } = options;
  const result = await ensureSidecar({ workTree, gitDir, scratchDir });
  if (!json) {
    if (result.initialized) {
      logger.info(`initialized sidecar at ${gitDir}`);
    } else {
      logger.info("sidecar already initialized");
    }
    if (result.files.length > 0) {
      logger.info(`tracked files:
${result.files.join("\n")}`);
    }
  }
  return {
    status: "ok",
    code: 0 /* OK */,
    data: {
      initialized: result.initialized,
      gitDir: result.gitDir,
      scratchDir: result.scratchDir,
      files: result.files
    }
  };
}

// src/utils/timeline.ts
function computeTimelineBar(commits, options) {
  const scale = Math.max(1, options.scale);
  const maxCommits = Math.max(1, options.maxCommits);
  const ratio = Math.min(1, commits / maxCommits);
  const filled = Math.round(ratio * scale);
  return {
    scale,
    filled: Math.min(scale, Math.max(0, filled))
  };
}

// src/commands/log.ts
function parsePrettyLog(output, fallbackPath) {
  if (!output.trim()) {
    return [];
  }
  const lines = output.split("\n");
  const entries = [];
  let current;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      current = void 0;
      continue;
    }
    if (line.includes("")) {
      const [commit, timestamp, message] = line.split("");
      if (commit && timestamp) {
        current = { commit, timestamp, message };
        entries.push(current);
      }
      continue;
    }
    if (current && current.path === void 0) {
      current.path = line;
    }
  }
  if (!fallbackPath) {
    return entries;
  }
  return entries.map((entry) => {
    if (entry.path !== void 0) {
      return entry;
    }
    return { ...entry, path: fallbackPath };
  });
}
function parseNumstat2(output, targetPath) {
  if (!output.trim()) {
    return {
      entries: [],
      summary: { commits: 0, totalAdditions: 0, totalDeletions: 0, net: 0 }
    };
  }
  const lines = output.split("\n");
  const entries = [];
  let totalAdditions = 0;
  let totalDeletions = 0;
  let currentCommit;
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith("commit ")) {
      const [, commit] = line.split(" ");
      currentCommit = {
        commit,
        timestamp: "",
        message: "",
        additions: 0,
        deletions: 0,
        highlights: []
      };
      entries.push(currentCommit);
      continue;
    }
    if (line.startsWith("date ")) {
      if (currentCommit) {
        currentCommit.timestamp = line.slice(5);
      }
      continue;
    }
    if (line.startsWith("message ")) {
      if (currentCommit) {
        currentCommit.message = line.slice(8);
      }
      continue;
    }
    const numstatMatch = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (numstatMatch && currentCommit) {
      const [, addStr, delStr, file] = numstatMatch;
      if (file !== targetPath) {
        continue;
      }
      const additions = addStr === "-" ? 0 : Number(addStr);
      const deletions = delStr === "-" ? 0 : Number(delStr);
      currentCommit.additions += additions;
      currentCommit.deletions += deletions;
      totalAdditions += additions;
      totalDeletions += deletions;
      if (additions > 0) {
        currentCommit.highlights.push({ type: "add", text: `+${additions} lines` });
      }
      if (deletions > 0) {
        currentCommit.highlights.push({ type: "del", text: `-${deletions} lines` });
      }
    }
  }
  const filtered = entries.filter((entry) => entry.additions > 0 || entry.deletions > 0 || entry.message).map((entry) => ({
    ...entry,
    highlights: entry.highlights.slice(0, 2)
  }));
  return {
    entries: filtered,
    summary: {
      commits: filtered.length,
      totalAdditions,
      totalDeletions,
      net: totalAdditions - totalDeletions
    }
  };
}
async function logCommand(options) {
  const { workTree, gitDir, scratchDir, json, logger, path, timeline, since } = options;
  await ensureSidecar({ workTree, gitDir, scratchDir });
  const git = createGitClient({ workTree, gitDir });
  const head = await git.exec(["rev-parse", "--verify", "HEAD"]).catch(() => null);
  if (!head) {
    return {
      status: "ok",
      code: 0 /* OK */,
      data: { entries: [] }
    };
  }
  let sanitizedPath;
  if (path) {
    const candidate = sanitizeTargetPath(path, workTree, scratchDir);
    if (!candidate) {
      throw new InvalidArgsError("path must be within scratch directory");
    }
    sanitizedPath = candidate;
  }
  if (timeline) {
    if (!sanitizedPath) {
      throw new InvalidArgsError("timeline mode requires -- <path>");
    }
    const args2 = [
      "log",
      "--follow",
      "--date=iso-strict",
      `--pretty=commit %H
date %ad
message %s`,
      "--numstat"
    ];
    if (since && since > 0) {
      args2.push(`-${since}`);
    }
    args2.push("--", sanitizedPath);
    const { stdout: stdout2 } = await git.exec(args2);
    const parsed = parseNumstat2(stdout2, sanitizedPath);
    if (!json) {
      if (parsed.entries.length === 0) {
        logger.info(`no timeline entries for ${sanitizedPath}`);
      } else {
        logger.info(`timeline for ${sanitizedPath}`);
        parsed.entries.forEach((entry) => {
          logger.info(`${entry.timestamp} ${entry.message} +${entry.additions}/-${entry.deletions}`);
        });
      }
    }
    const bars = computeTimelineBar(parsed.entries.length, {
      scale: 10,
      maxCommits: Math.max(1, parsed.entries.length)
    });
    return {
      status: "ok",
      code: 0 /* OK */,
      data: {
        entries: [],
        timeline: {
          summary: parsed.summary,
          bars,
          entries: parsed.entries,
          path: sanitizedPath
        }
      }
    };
  }
  const format = "%H%ad%s";
  const args = ["log", "--date=iso-strict", `--pretty=${format}`, "--name-only"];
  if (since && since > 0) {
    args.push(`-${since}`);
  }
  if (sanitizedPath) {
    args.push("--", sanitizedPath);
  }
  const { stdout } = await git.exec(args);
  const entries = parsePrettyLog(stdout, sanitizedPath);
  if (!json) {
    if (entries.length === 0) {
      logger.info("no log entries");
    } else {
      entries.forEach((entry) => {
        logger.info(`${entry.commit.slice(0, 7)} ${entry.timestamp} ${entry.message}`);
      });
    }
  }
  return {
    status: "ok",
    code: 0 /* OK */,
    data: { entries }
  };
}

// src/commands/prompt.ts
var PROMPT_TEXT = `You may use a CLI tool named "draftsnap" to manage temporary drafts (e.g., Markdown notes, outlines, experiments) in a sidecar Git repository. This tool provides a safety net when working with scratch files, allowing you to restore previous versions if needed.

Basic workflow:
1) Once per session, run \`draftsnap ensure --json\`. It idempotently prepares a local sidecar repo, creates the scratch directory, and sets \`.git/info/exclude\`. Proceed only if it returns JSON with code 0.

2) When working with files in the configured scratch directory (default: \`scratch/\`), snapshot changes with:
   \`draftsnap snap <path> -m "<short reason>" --json\`
   \`draftsnap snap --all -m "<short reason>" --json\` to commit every modified scratch file together.
   Treat exit code 0 as committed. Treat exit code 10 as "no changes" (still a success).

3) Parse only STDOUT as JSON (\`--json\`). Never parse STDERR; it is human-oriented logs.

4) To review or roll back, you may call:
   - \`draftsnap log --json [-- <path>]\` to list history,
   - \`draftsnap diff [REV] --json [-- <path>]\` to inspect changes,
   - \`draftsnap restore <revision> <path> --json\` to restore content into the working tree.

5) For periodic cleanup, you may run \`draftsnap prune --keep 200 --json\` (or \`--days N\`). Use it sparingly.

6) Do not modify \`.gitignore\`; drafts are excluded locally via \`.git/info/exclude\`. The tool never pushes to any remote.

7) If \`draftsnap\` is unavailable, continue your task without it; do not block.

When to snapshot (default behavior):
- After creating a new file in scratch/
- After making substantial changes (structural changes, >10 lines modified, or significant content changes)
- Before potentially destructive operations (e.g., large refactors, deletions)
- When the user says "try this", "experiment with", or similar exploratory language

Don't snapshot for:
- Minor formatting changes (whitespace, indentation only)
- Small typo fixes (<5 character changes)
- When the user explicitly says "don't snap" or "no need to snap"

User can adjust frequency:
- "snap every edit" \u2192 snapshot after every change, regardless of size
- "snap less" or "only snap when I say" \u2192 only snapshot when explicitly requested
- "snap more often" \u2192 be more aggressive with automatic snapshots

Message convention for \`-m\`:
Use a terse "purpose: summary" style, e.g., \`purpose: tighten outline\`, \`purpose: add authentication section\`, so commits are searchable.

Return handling:
- Success with commit: \`{"status":"ok","code":0,...}\`
- Success with no changes: \`{"status":"ok","code":10,...}\`
- Precondition or lock errors are non-fatal to your overall task; you may retry later.

Examples:
- Start: \`draftsnap ensure --json\`
- After writing \`scratch/idea.md\`: \`draftsnap snap scratch/idea.md -m "purpose: initial draft" --json\`
- After major edit to \`scratch/design.md\`: \`draftsnap snap scratch/design.md -m "purpose: add security considerations" --json\`
- After touching multiple files: \`draftsnap snap --all -m "purpose: checkpoint session work" --json\`
- Before a risky refactor: \`draftsnap snap scratch/code.md -m "purpose: pre-refactor checkpoint" --json\`

This tool provides safety when experimenting with AI-generated content. Use it proactively to enable fearless iteration.`;
function promptCommand(json) {
  if (json) {
    return { status: "ok", code: 0 /* OK */, message: PROMPT_TEXT };
  }
  return PROMPT_TEXT;
}

// src/commands/prune.ts
import { execFile as execFile2 } from "child_process";
import { mkdtemp, rename, rm } from "fs/promises";
import { tmpdir } from "os";
import { join as join3 } from "path";
import { promisify as promisify2 } from "util";
var execFileAsync2 = promisify2(execFile2);
async function pruneCommand(options) {
  const { workTree, gitDir, scratchDir, json, logger, keep } = options;
  if (!Number.isInteger(keep) || keep < 1) {
    throw new InvalidArgsError("--keep must be >= 1");
  }
  await ensureSidecar({ workTree, gitDir, scratchDir });
  const git = createGitClient({ workTree, gitDir });
  const revList = await git.exec(["rev-list", "--reverse", "HEAD"]).catch(() => ({ stdout: "" }));
  const commits = revList.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  if (commits.length === 0) {
    return {
      status: "ok",
      code: 10 /* NO_CHANGES */,
      data: { kept: 0, removed: 0, removedCommits: [] }
    };
  }
  if (commits.length <= keep) {
    if (!json) {
      logger.info("already within threshold");
    }
    return {
      status: "ok",
      code: 10 /* NO_CHANGES */,
      data: { kept: commits.length, removed: 0, removedCommits: [] }
    };
  }
  const removeCount = commits.length - keep;
  const removedCommits = commits.slice(0, removeCount);
  const tmpClone = await mkdtemp(join3(tmpdir(), "draftsnap-node-prune-"));
  try {
    await execFileAsync2(
      "git",
      ["clone", "--quiet", "--depth", String(keep), "--no-checkout", gitDir, tmpClone],
      {
        cwd: workTree,
        env: { ...process.env }
      }
    );
    await rm(gitDir, { recursive: true, force: true });
    await rename(join3(tmpClone, ".git"), gitDir);
    const refreshedGit = createGitClient({ workTree, gitDir });
    await refreshedGit.exec(["reset", "--hard"]);
    if (!json) {
      logger.info(`removed ${removeCount} commits, kept ${keep}`);
    }
    return {
      status: "ok",
      code: 0 /* OK */,
      data: {
        kept: keep,
        removed: removeCount,
        removedCommits
      }
    };
  } finally {
    await rm(tmpClone, { recursive: true, force: true });
  }
}

// src/commands/restore.ts
import { rename as rename2, stat as stat3, writeFile as writeFile2 } from "fs/promises";
import { join as join5 } from "path";

// src/core/lock.ts
import { existsSync, rmSync } from "fs";
import { mkdir as mkdir2 } from "fs/promises";
import { dirname, join as join4 } from "path";
var DEFAULT_TIMEOUT = 5e3;
var DEFAULT_RETRY = 100;
function wait(ms) {
  return new Promise((resolve3) => setTimeout(resolve3, ms));
}
var LockManager = class {
  lockDir;
  held = false;
  cleanupRegistered = false;
  constructor(gitDir) {
    this.lockDir = join4(gitDir, ".draftsnap.lock");
  }
  async acquire(options = {}) {
    if (this.held) {
      return;
    }
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    const retryMs = options.retryMs ?? DEFAULT_RETRY;
    const deadline = Date.now() + timeoutMs;
    const parentDir = dirname(this.lockDir);
    await mkdir2(parentDir, { recursive: true });
    while (true) {
      try {
        await mkdir2(this.lockDir, { recursive: false });
        this.held = true;
        this.registerCleanup();
        return;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
          if (Date.now() >= deadline) {
            throw new LockError();
          }
          await wait(retryMs);
          continue;
        }
        throw error;
      }
    }
  }
  release() {
    if (!this.held) {
      return;
    }
    try {
      if (existsSync(this.lockDir)) {
        rmSync(this.lockDir, { recursive: true, force: true });
      }
    } finally {
      this.held = false;
      this.cleanupRegistered = false;
    }
  }
  registerCleanup() {
    if (this.cleanupRegistered) {
      return;
    }
    const cleanup = () => {
      this.release();
    };
    process.once("exit", cleanup);
    process.once("SIGINT", () => {
      cleanup();
      process.exit(130);
    });
    process.once("SIGTERM", () => {
      cleanup();
      process.exit(143);
    });
    this.cleanupRegistered = true;
  }
};

// src/commands/restore.ts
async function restoreCommand(options) {
  const { workTree, gitDir, scratchDir, json, logger, revision, path } = options;
  const sanitized = sanitizeTargetPath(path, workTree, scratchDir);
  if (!sanitized) {
    throw new InvalidArgsError("path must be within scratch directory");
  }
  await ensureSidecar({ workTree, gitDir, scratchDir });
  const git = createGitClient({ workTree, gitDir });
  const lock = new LockManager(gitDir);
  await lock.acquire();
  try {
    const blob = await git.exec(["show", `${revision}:${sanitized}`], { trim: false }).catch(() => {
      throw new InvalidArgsError(`unknown revision or path: ${revision}`);
    });
    const absPath = join5(workTree, sanitized);
    let backup = null;
    const existing = await stat3(absPath).catch(() => null);
    if (existing) {
      const backupPath = `${absPath}.draftsnap.bak.${Date.now()}`;
      await rename2(absPath, backupPath);
      backup = backupPath;
    }
    await writeFile2(absPath, blob.stdout);
    const bytes = Buffer.byteLength(blob.stdout, "utf8");
    if (!json) {
      logger.info(`restored ${sanitized} from ${revision}`);
      if (backup) {
        logger.info(`backup saved to ${backup}`);
      }
    }
    return {
      status: "ok",
      code: 0 /* OK */,
      data: {
        path: sanitized,
        bytes,
        revision,
        backup
      }
    };
  } finally {
    lock.release();
  }
}

// src/commands/snap.ts
import { mkdir as mkdir3, stat as stat4, writeFile as writeFile3 } from "fs/promises";
import { dirname as dirname2, isAbsolute as isAbsolute3, join as join6, posix as posix2 } from "path";
async function ensureFileExists(_targetPath, absPath, stdinContent) {
  await mkdir3(dirname2(absPath), { recursive: true });
  if (stdinContent !== void 0) {
    await writeFile3(absPath, stdinContent);
    return;
  }
  try {
    await stat4(absPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await writeFile3(absPath, "");
      return;
    }
    throw error;
  }
}
function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
function resolveTargetPath(path, scratchDir, space) {
  const normalized = normalizePath(path);
  if (isAbsolute3(path)) {
    return path;
  }
  const scratchPrefix = normalizePath(`${scratchDir}/`);
  if (normalized === scratchDir || normalized.startsWith(scratchPrefix)) {
    return normalized;
  }
  if (space) {
    return posix2.join(scratchDir, space, normalized);
  }
  return posix2.join(scratchDir, normalized);
}
async function snapCommand(options) {
  const { workTree, gitDir, scratchDir, json, logger, message, path, all, stdinContent, space } = options;
  if (all && space) {
    throw new InvalidArgsError("snap --all cannot be combined with --space");
  }
  const lock = new LockManager(gitDir);
  await lock.acquire();
  try {
    await ensureSidecar({ workTree, gitDir, scratchDir });
    const git = createGitClient({ workTree, gitDir });
    let stagedPaths = [];
    let targetPath = null;
    if (all) {
      await git.exec(["add", "-f", scratchDir]);
      const diff = await git.exec(["diff", "--cached", "--name-only"]);
      stagedPaths = diff.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
      if (stagedPaths.length === 0) {
        if (!json) {
          logger.info(`no pending changes under ${scratchDir}`);
        }
        return {
          status: "ok",
          code: 10 /* NO_CHANGES */,
          data: { commit: null, path: null, paths: [], files_count: 0, bytes: 0 }
        };
      }
    } else {
      if (!path) {
        throw new InvalidArgsError("snap requires a target path");
      }
      const candidate = resolveTargetPath(path, scratchDir, space);
      const sanitized = sanitizeTargetPath(candidate, workTree, scratchDir);
      if (!sanitized) {
        throw new InvalidArgsError("path must be within scratch directory");
      }
      targetPath = sanitized;
      const absTarget = join6(workTree, sanitized);
      await ensureFileExists(sanitized, absTarget, stdinContent);
      await git.exec(["add", "-f", "--", sanitized]);
      const diff = await git.exec(["diff", "--cached", "--name-only"]);
      stagedPaths = diff.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
      stagedPaths = stagedPaths.filter((entry) => entry === sanitized);
      if (stagedPaths.length === 0) {
        if (!json) {
          logger.info(`no changes for ${sanitized}`);
        }
        return {
          status: "ok",
          code: 10 /* NO_CHANGES */,
          data: { commit: null, path: sanitized, paths: [], files_count: 0, bytes: 0 }
        };
      }
    }
    let totalBytes = 0;
    for (const staged of stagedPaths) {
      try {
        const size = await stat4(join6(workTree, staged));
        totalBytes += size.size;
      } catch (error) {
        if (isErrno(error, "ENOENT")) {
          continue;
        }
        throw error;
      }
    }
    const baseMessage = message ?? (all ? "snap: all" : `snap: ${targetPath}`);
    const finalMessage = !all && space ? `[space:${space}] ${baseMessage}` : baseMessage;
    await git.exec(["commit", "--quiet", "-m", finalMessage]);
    const commit = await git.exec(["rev-parse", "HEAD"]);
    if (!json) {
      if (all) {
        logger.info(`snap stored ${stagedPaths.length} files at ${commit.stdout}`);
      } else {
        logger.info(`snap stored ${targetPath} at ${commit.stdout}`);
      }
    }
    return {
      status: "ok",
      code: 0 /* OK */,
      data: {
        commit: commit.stdout,
        path: targetPath,
        paths: stagedPaths,
        files_count: stagedPaths.length,
        bytes: totalBytes
      }
    };
  } finally {
    lock.release();
  }
}

// src/commands/status.ts
import { readFile as readFile3, stat as stat5 } from "fs/promises";
import { join as join7, relative as relative3 } from "path";
function parseGitStatus(output) {
  const lines = output.split("\n").filter(Boolean);
  const modified = /* @__PURE__ */ new Set();
  const added = /* @__PURE__ */ new Set();
  const deleted = /* @__PURE__ */ new Set();
  for (const line of lines) {
    if (line.length < 3) continue;
    const statusCode = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    if (filePath.endsWith("/")) {
      continue;
    }
    const actualFilePath = filePath.includes(" -> ") ? filePath.split(" -> ")[1].trim() : filePath;
    const staged = statusCode[0];
    const unstaged = statusCode[1];
    if (statusCode === "??") {
      added.add(actualFilePath);
      continue;
    }
    if (staged === "M" || unstaged === "M") {
      modified.add(actualFilePath);
    }
    if (staged === "A" || staged === "C") {
      added.add(actualFilePath);
    }
    if (staged === "D" || unstaged === "D") {
      deleted.add(actualFilePath);
    }
    if (staged === "R") {
      modified.add(actualFilePath);
    }
  }
  return {
    modified: Array.from(modified).sort(),
    added: Array.from(added).sort(),
    deleted: Array.from(deleted).sort(),
    hasChanges: modified.size + added.size + deleted.size > 0
  };
}
async function exists(path) {
  try {
    await stat5(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
async function statusCommand(options) {
  const { workTree, gitDir, scratchDir, json, logger } = options;
  const headExists = await exists(join7(gitDir, "HEAD"));
  const lockExists = await exists(join7(gitDir, ".draftsnap.lock"));
  async function readExcludeLines(path) {
    try {
      const content = await readFile3(path, "utf8");
      return new Set(
        content.split("\n").map((line) => line.trim()).filter(Boolean)
      );
    } catch (error) {
      if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) {
        return /* @__PURE__ */ new Set();
      }
      throw error;
    }
  }
  const mainGitDir = await resolveMainGitDir(workTree);
  const mainExclude = mainGitDir ? await readExcludeLines(join7(mainGitDir, "info", "exclude")) : /* @__PURE__ */ new Set();
  const gitDirRelative = relative3(workTree, gitDir) || gitDir;
  const mainGitDirEntry = mainExclude.has(
    `${gitDirRelative}${gitDirRelative.endsWith("/") ? "" : "/"}`
  );
  const mainScrDir = mainExclude.has(`${scratchDir}/`);
  const sideExcludePath = join7(gitDir, "info", "exclude");
  const sideExclude = await readExcludeLines(sideExcludePath);
  const sideWildcard = sideExclude.has("*");
  const sideScrDir = sideExclude.has(`!${scratchDir}/`);
  const sideScrGlob = sideExclude.has(`!${scratchDir}/**`);
  let workingTreeStatus = {
    hasUncommittedChanges: false,
    modified: [],
    added: [],
    deleted: []
  };
  if (headExists) {
    try {
      const git = createGitClient({ workTree, gitDir });
      const { stdout } = await git.exec(["status", "--porcelain"]);
      const parsed = parseGitStatus(stdout);
      const scratchPrefix = `${scratchDir}/`;
      workingTreeStatus = {
        hasUncommittedChanges: parsed.hasChanges,
        modified: parsed.modified.filter((file) => file.startsWith(scratchPrefix)),
        added: parsed.added.filter((file) => file.startsWith(scratchPrefix)),
        deleted: parsed.deleted.filter((file) => file.startsWith(scratchPrefix))
      };
      workingTreeStatus.hasUncommittedChanges = workingTreeStatus.modified.length > 0 || workingTreeStatus.added.length > 0 || workingTreeStatus.deleted.length > 0;
    } catch (error) {
      if (!json) {
        logger.warn(`failed to get working tree status: ${error}`);
      }
    }
  }
  if (!json) {
    logger.info(`git dir: ${gitDir}`);
    logger.info(`scratch dir: ${scratchDir}`);
    logger.info(headExists ? "initialized: yes" : "initialized: no");
    logger.info(lockExists ? "locked: yes" : "locked: no");
    logger.info(
      `main exclude - git_dir: ${mainGitDirEntry ? "true" : "false"}, scr_dir: ${mainScrDir ? "true" : "false"}`
    );
    logger.info(
      `sidecar exclude - wildcard: ${sideWildcard ? "true" : "false"}, scr_dir: ${sideScrDir ? "true" : "false"}, scr_glob: ${sideScrGlob ? "true" : "false"}`
    );
    if (workingTreeStatus.hasUncommittedChanges) {
      logger.info("uncommitted changes: yes");
      logger.info(`  modified: ${workingTreeStatus.modified.length}`);
      logger.info(`  added: ${workingTreeStatus.added.length}`);
      logger.info(`  deleted: ${workingTreeStatus.deleted.length}`);
    } else {
      logger.info("uncommitted changes: no");
    }
  }
  return {
    status: "ok",
    code: 0 /* OK */,
    data: {
      initialized: headExists,
      locked: lockExists,
      gitDir,
      scratchDir,
      exclude: {
        main: {
          gitDir: mainGitDirEntry,
          scrDir: mainScrDir
        },
        sidecar: {
          wildcard: sideWildcard,
          scrDir: sideScrDir,
          scrGlob: sideScrGlob
        }
      },
      workingTree: workingTreeStatus
    }
  };
}

// src/commands/timeline.ts
import { execFile as execFile3, spawn as spawnProcess } from "child_process";
import { promisify as promisify3 } from "util";
function decideTimelineMode(context) {
  if (context.json) {
    return "json";
  }
  if (context.raw || !context.stdoutIsTTY) {
    return "plain";
  }
  if (context.hasFzf) {
    return "interactive";
  }
  return "plain";
}
function parseLog(output, fallbackPath) {
  if (!output.trim()) {
    return [];
  }
  const lines = output.split("\n");
  const entries = [];
  let current = null;
  let inPathSection = false;
  const finalize = () => {
    const commit = current?.commit;
    const relativeTime = current?.relativeTime;
    const authorDate = current?.authorDate;
    const message = current?.message;
    if (commit && relativeTime && authorDate && message) {
      const path = current?.path ?? fallbackPath ?? "";
      entries.push({ commit, relativeTime, authorDate, message, path });
    }
    current = null;
    inPathSection = false;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) {
      if (current) {
        if (!inPathSection) {
          inPathSection = true;
        } else {
          finalize();
        }
      } else {
        finalize();
      }
      continue;
    }
    if (line.startsWith("commit ")) {
      finalize();
      current = { commit: line.slice(7).trim() };
      inPathSection = false;
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("relative ")) {
      current.relativeTime = line.slice(9).trim();
      continue;
    }
    if (line.startsWith("author ")) {
      current.authorDate = line.slice(7).trim();
      continue;
    }
    if (line.startsWith("message ")) {
      current.message = line.slice(8);
      continue;
    }
    if (!current.path) {
      current.path = line.trim();
    }
    inPathSection = true;
  }
  finalize();
  return entries;
}
async function timelineCommand(options) {
  const { workTree, gitDir, scratchDir, json, raw, logger, path, env } = options;
  await ensureSidecar({ workTree, gitDir, scratchDir });
  const git = createGitClient({ workTree, gitDir });
  let sanitizedPath;
  if (path) {
    const candidate = sanitizeTargetPath(path, workTree, scratchDir);
    if (!candidate) {
      throw new InvalidArgsError("path must be within scratch directory");
    }
    sanitizedPath = candidate;
  }
  const stdoutIsTTY = env?.stdoutIsTTY ?? Boolean(process.stdout?.isTTY);
  const platform = env?.platform ?? process.platform;
  let hasFzf = false;
  if (!json && !raw && stdoutIsTTY) {
    const exists3 = env?.commandExists ?? commandExists;
    hasFzf = await exists3("fzf");
  }
  const mode = decideTimelineMode({ json, raw, stdoutIsTTY, hasFzf });
  const head = await git.exec(["rev-parse", "--verify", "HEAD"]).catch(() => null);
  if (!head) {
    if (mode === "json") {
      return {
        status: "ok",
        code: 0 /* OK */,
        data: { mode: "json", entries: [] }
      };
    }
    throw new NotInitializedError();
  }
  const args = [
    "log",
    "--date=iso-strict",
    "--pretty=format:commit %H%nrelative %ar%nauthor %aI%nmessage %s",
    "--name-only"
  ];
  if (sanitizedPath) {
    args.push("--", sanitizedPath);
  }
  const { stdout } = await git.exec(args);
  const entries = parseLog(stdout, sanitizedPath);
  if (mode === "plain") {
    entries.forEach((entry) => {
      logger.info(`${entry.relativeTime} \u2502 ${entry.path} \u2502 ${entry.message}`);
    });
    return {
      status: "ok",
      code: 0 /* OK */,
      data: { mode: "plain", entries }
    };
  }
  if (mode === "json") {
    return {
      status: "ok",
      code: 0 /* OK */,
      data: { mode: "json", entries }
    };
  }
  const spawnFn = env?.spawn ?? spawnProcess;
  const exists2 = env?.commandExists ?? commandExists;
  const code = await runInteractiveTimeline({
    entries,
    gitDir,
    workTree,
    spawn: spawnFn,
    commandExists: exists2,
    platform
  });
  return {
    status: "ok",
    code,
    data: { mode: "interactive", entries }
  };
}
var execFileAsync3 = promisify3(execFile3);
async function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "which";
  try {
    await execFileAsync3(checker, [command]);
    return true;
  } catch {
    return false;
  }
}
function shellQuote(value) {
  const escaped = value.replace(/(["\\$`])/g, "\\$1");
  return `"${escaped}"`;
}
async function runInteractiveTimeline(params) {
  const { entries, gitDir, workTree, spawn, commandExists: commandExists2, platform } = params;
  if (entries.length === 0) {
    return 0 /* OK */;
  }
  const delimiter = String.fromCharCode(31);
  const previewBase = `git --git-dir=${shellQuote(gitDir)} --work-tree=${shellQuote(workTree)} show {1}`;
  const useDelta = await commandExists2("delta");
  const previewCommand = useDelta ? `${previewBase} | delta` : previewBase;
  const pager = process.env.PAGER ?? "less -R";
  const diffPipeline = useDelta ? `${previewBase} | delta` : previewBase;
  const diffCommand2 = `sh -c ${shellQuote(`${diffPipeline} | ${pager}`)}`;
  const restoreCommand2 = "sh -c " + shellQuote(
    'read -r -p "Restore {3}? [y/N] " ans < /dev/tty && [ "$ans" = y ] && draftsnap restore {1} -- "{3}"'
  );
  const modifier = "ctrl";
  const modifierLabel = platform === "darwin" ? "Ctrl" : "Ctrl";
  const header = `Enter: view diff | ${modifierLabel}-R: restore | Esc: quit`;
  const args = [
    "--ansi",
    "--no-sort",
    `--delimiter=${delimiter}`,
    "--with-nth=5",
    `--header=${header}`,
    `--preview=${previewCommand}`,
    "--preview-window=right:60%:wrap",
    `--bind=enter:execute(${diffCommand2})`,
    `--bind=${modifier}-r:execute(${restoreCommand2})+abort`,
    "--bind=esc:abort"
  ];
  const child = spawn("fzf", args, { stdio: ["pipe", "inherit", "inherit"] });
  entries.forEach((entry) => {
    const display = `${entry.relativeTime} \u2502 ${entry.path} \u2502 ${entry.message}`;
    child.stdin.write(
      `${entry.commit}${delimiter}${entry.relativeTime}${delimiter}${entry.path}${delimiter}${entry.message}${delimiter}${display}
`
    );
  });
  child.stdin.end();
  await new Promise((resolve3) => {
    child.on("close", (code) => {
      if (typeof code === "number") {
        resolve3();
      } else {
        resolve3();
      }
    });
  });
  return 0 /* OK */;
}

// src/utils/logger.ts
function createLogger(options, sink = defaultLogger) {
  const base = sink;
  return {
    info(message) {
      if (options.json || options.quiet) {
        return;
      }
      base.info(message);
    },
    warn(message) {
      if (options.json || options.quiet) {
        return;
      }
      base.warn(message);
    },
    error(message) {
      base.error(message);
    },
    debug(message) {
      if (!options.debug || options.json) {
        return;
      }
      base.debug(message);
    }
  };
}
var defaultLogger = {
  info: (message) => console.error(message),
  warn: (message) => console.error(message),
  error: (message) => console.error(message),
  debug: (message) => console.error(`[debug] ${message}`)
};

// src/utils/stdin.ts
async function readAllStdin() {
  const chunks = [];
  return new Promise((resolve3, reject) => {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve3(chunks.join("")));
  });
}

// src/cli.ts
var require2 = createRequire(import.meta.url);
var packageJson = require2("../package.json");
var DEFAULT_HINT = "draftsnap: run `draftsnap --help` for commands or `draftsnap prompt` for agent guidance.";
function toBoolean(value) {
  return value === true;
}
function parseOptionalNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return void 0;
}
function buildContext(options) {
  const scratchDir = typeof options.scratch === "string" ? options.scratch : "scratch";
  const gitDir = typeof options.gitDir === "string" ? options.gitDir : ".git-scratch";
  const json = toBoolean(options.json);
  const quiet = toBoolean(options.quiet);
  const debug = toBoolean(options.debug);
  return {
    workTree: process.cwd(),
    gitDir,
    scratchDir,
    json,
    quiet,
    debug,
    logger: createLogger({ json, quiet, debug })
  };
}
function printJson(data) {
  process.stdout.write(`${JSON.stringify(data)}
`);
}
function printDefaultHintJson(json) {
  if (json) {
    printJson({ status: "ok", code: 0 /* OK */, message: DEFAULT_HINT });
  } else {
    console.log(DEFAULT_HINT);
  }
  process.exitCode = 0 /* OK */;
}
async function executeWithHandling(cli, commandOptions, handler) {
  const globalOptions = cli.options ?? {};
  const ctx = buildContext({ ...globalOptions, ...commandOptions });
  try {
    await handler(ctx);
  } catch (error) {
    if (error instanceof DraftsnapError) {
      if (ctx.json) {
        printJson({
          status: error.code === 10 /* NO_CHANGES */ ? "ok" : "error",
          code: error.code,
          message: error.message
        });
      } else {
        console.error(error.message);
      }
      process.exitCode = error.code;
    } else {
      console.error(error);
      process.exitCode = 1;
    }
  }
}
async function run(argv) {
  const cli = cac("draftsnap");
  cli.option("--scratch <dir>", "scratch directory", { default: "scratch" });
  cli.option("--git-dir <dir>", "sidecar git directory", { default: ".git-scratch" });
  cli.option("--json", "output JSON");
  cli.option("--quiet", "suppress logs");
  cli.option("--debug", "enable debug logs");
  cli.command("ensure", "Initialize or verify the sidecar").action(async (options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const result = await ensureCommand(ctx);
      if (ctx.json) {
        printJson(result);
      }
    });
  });
  cli.command("snap [path]", "Capture a snapshot from a file or stdin").option("-m, --message <message>", "Commit message").option("--all", "Snapshot all pending changes").option("--stdin", "Read content from stdin").option("--space <name>", "Optional space prefix").action(async (path, options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const stdinRequested = toBoolean(options.stdin);
      const stdinContent = stdinRequested ? await readAllStdin() : void 0;
      const result = await snapCommand({
        ...ctx,
        path: options.all ? void 0 : path,
        message: options.message,
        all: toBoolean(options.all),
        space: options.space,
        stdinContent
      });
      if (ctx.json) {
        printJson(result);
      }
    });
  });
  cli.command("log [path]", "List snapshots with metadata").option("--timeline", "Show timeline summary for a document").option("--since <n>", "Number of commits to include").action(async (path, options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const result = await logCommand({
        ...ctx,
        path,
        timeline: toBoolean(options.timeline),
        since: parseOptionalNumber(options.since)
      });
      if (ctx.json) {
        printJson(result);
      }
    });
  });
  cli.command("timeline [path]", "Browse snapshot history interactively").option("--raw", "Force plain-text fallback mode").option("--json", "Output JSON (also available as global option)").action(async (path, options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const json = ctx.json || toBoolean(options.json);
      const result = await timelineCommand({
        ...ctx,
        json,
        path,
        raw: toBoolean(options.raw)
      });
      if (json) {
        printJson(result);
      }
    });
  });
  cli.command("diff [path]", "Compare recent snapshots or the working tree").option("--current", "Compare against working tree").option("--since <n>", "Number of commits to include").action(async (path, options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const result = await diffCommand({
        ...ctx,
        path,
        current: toBoolean(options.current),
        since: parseOptionalNumber(options.since)
      });
      if (ctx.json) {
        printJson(result);
      }
    });
  });
  cli.command("status", "Report initialization and lock status").action(async (options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const result = await statusCommand(ctx);
      if (ctx.json) {
        printJson(result);
      }
    });
  });
  cli.command("restore <revision> [path]", "Restore a file from a prior snapshot").action(async (revision, path, options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const dashDashArgs = options["--"];
      const resolvedPath = path || dashDashArgs?.[0];
      if (!resolvedPath) {
        throw new InvalidArgsError("path is required");
      }
      const result = await restoreCommand({
        ...ctx,
        revision,
        path: resolvedPath
      });
      if (ctx.json) {
        printJson(result);
      }
    });
  });
  cli.command("prune", "Trim old snapshots, keeping the latest N commits").option("--keep <n>", "Number of commits to keep", { default: "100" }).action(async (options) => {
    await executeWithHandling(cli, options, async (ctx) => {
      const keep = parseOptionalNumber(options.keep) ?? 100;
      const result = await pruneCommand({
        ...ctx,
        keep
      });
      if (ctx.json) {
        printJson(result);
      }
    });
  });
  cli.command("prompt", "Display guidance for using draftsnap safely").option("--json", "Output guidance as JSON").action(async (options) => {
    const json = toBoolean(options.json);
    const output = promptCommand(json);
    if (json) {
      printJson(output);
    } else {
      console.log(output);
    }
    process.exitCode = 0 /* OK */;
  });
  cli.help();
  cli.version(packageJson.version ?? "0.0.0");
  if (argv.length === 0) {
    printDefaultHintJson(false);
    return;
  }
  const parsed = cli.parse(["", "", ...argv]);
  if (!cli.matchedCommandName && parsed.args.length === 0 && !parsed.options.help && !parsed.options.version) {
    printDefaultHintJson(Boolean(parsed.options.json));
  }
}

// src/index.ts
run(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});
//# sourceMappingURL=index.js.map