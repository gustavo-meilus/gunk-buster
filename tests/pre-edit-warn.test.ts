import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { FileFinding, ScanResult } from "../src/schema.js";
import { createTempDir, removeDir } from "./helpers/fixture.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const hookPath = path.join(packageRoot, "hooks", "pre-edit-warn.mjs");

function fileFinding(overrides: Partial<FileFinding> = {}): FileFinding {
  return {
    type: "file",
    path: "src/legacy.ts",
    kind: "doc",
    label: "GHOST",
    verdict: "PROPOSE",
    evidence: [{ rule: "orphan-doc", confidence: "STRONG", rationale: "no inbound references" }],
    protections: [],
    contentHash: `sha256:${"a".repeat(64)}`,
    ...overrides,
  };
}

function scanResult(findings: ScanResult["findings"]): ScanResult {
  return {
    schemaVersion: 2,
    scannedAt: "2026-07-10T01:00:00.000Z",
    repoRoot: "/repo",
    counts: { byVerdict: {}, byLabel: {} },
    findings,
  };
}

interface HookRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runHookRaw(stdin: string): Promise<HookRun> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [hookPath]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function runHook(cwd: string, toolName: string, filePath: string): Promise<HookRun> {
  return runHookRaw(
    JSON.stringify({
      session_id: "test-session",
      cwd,
      hook_event_name: "PreToolUse",
      tool_name: toolName,
      tool_input: { file_path: filePath },
    }),
  );
}

async function runCodexHook(cwd: string, command: string): Promise<HookRun> {
  return runHookRaw(
    JSON.stringify({
      cwd,
      hook_event_name: "PreToolUse",
      model: "gpt-5",
      permission_mode: "default",
      session_id: "test-session",
      tool_name: "apply_patch",
      tool_input: { command },
      tool_use_id: "call-1",
      transcript_path: null,
      turn_id: "turn-1",
    }),
  );
}

async function writeScan(repo: string, result: ScanResult): Promise<void> {
  const dir = path.join(repo, ".gunk-buster");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "scan.json"), JSON.stringify(result, null, 2));
}

describe("pre-edit-warn hook", () => {
  let repo: string;

  afterEach(async () => {
    if (repo) await removeDir(repo);
  });

  it("warns when the target file is labeled GHOST as of the last scan", async () => {
    repo = await createTempDir();
    await writeScan(repo, scanResult([fileFinding({ path: "src/legacy.ts", label: "GHOST" })]));

    const result = await runHook(repo, "Edit", "src/legacy.ts");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("GHOST");
    expect(result.stdout.toLowerCase()).toContain("heads up");
  });

  it("warns for RELIC and DUMP labels too, and for the Write tool", async () => {
    repo = await createTempDir();
    await writeScan(
      repo,
      scanResult([
        fileFinding({ path: "src/relic.ts", label: "RELIC" }),
        fileFinding({ path: "dist/bundle.js", kind: "generated", label: "DUMP" }),
      ]),
    );

    const relicResult = await runHook(repo, "Edit", "src/relic.ts");
    const dumpResult = await runHook(repo, "Write", "dist/bundle.js");

    expect(relicResult.exitCode).toBe(0);
    expect(relicResult.stdout).toContain("RELIC");
    expect(dumpResult.exitCode).toBe(0);
    expect(dumpResult.stdout).toContain("DUMP");
  });

  it.each([
    ["GHOST", "docs/legacy.md"],
    ["RELIC", "docs/migration.md"],
    ["DUMP", "dist/bundle.js"],
  ] as const)("warns for a persisted %s target in Codex apply_patch input", async (label, target) => {
    repo = await createTempDir();
    await writeScan(repo, scanResult([fileFinding({ path: target, label })]));

    const result = await runCodexHook(
      repo,
      `*** Begin Patch\n*** Update File: ${target}\n@@\n-old\n+new\n*** End Patch`,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(label);
  });

  it.each([
    ["POSIX", "docs/legacy.md"],
    ["Windows", "docs\\legacy.md"],
  ])("resolves %s target paths to the persisted repo-relative finding", async (_platform, target) => {
    repo = await createTempDir();
    await writeScan(repo, scanResult([fileFinding({ path: "docs/legacy.md", label: "GHOST" })]));

    const result = await runCodexHook(
      repo,
      `*** Begin Patch\n*** Update File: ${target}\n@@\n-old\n+new\n*** End Patch`,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("GHOST");
  });

  it("stays silent when the target file has no finding (healthy / LIVE)", async () => {
    repo = await createTempDir();
    await writeScan(repo, scanResult([fileFinding({ path: "src/legacy.ts", label: "GHOST" })]));
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src", "healthy.ts"), "export const x = 1;\n");

    const result = await runHook(repo, "Edit", "src/healthy.ts");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("stays silent (no-op) when no scan.json has ever been persisted", async () => {
    repo = await createTempDir();
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src", "healthy.ts"), "export const x = 1;\n");

    const result = await runHook(repo, "Edit", "src/healthy.ts");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("stays silent when scan.json is malformed instead of throwing", async () => {
    repo = await createTempDir();
    const dir = path.join(repo, ".gunk-buster");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "scan.json"), "{ not valid json");

    const result = await runHook(repo, "Edit", "src/legacy.ts");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("never blocks: exits 0 even when tool_input.file_path is missing", async () => {
    repo = await createTempDir();
    await writeScan(repo, scanResult([fileFinding({ path: "src/legacy.ts", label: "GHOST" })]));

    const result = await runHookRaw(
      JSON.stringify({
        cwd: repo,
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {},
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it.each([
    ["unsupported label", scanResult([fileFinding({ label: "ECHO" })]), "apply_patch", { command: "*** Begin Patch\n*** Update File: src/legacy.ts\n*** End Patch" }],
    ["unrelated tool", scanResult([fileFinding()]), "shell_command", { command: "echo hi" }],
    ["malformed Codex input", scanResult([fileFinding()]), "apply_patch", { command: 42 }],
  ])("stays silent for %s", async (_case, scan, toolName, toolInput) => {
    repo = await createTempDir();
    await writeScan(repo, scan);

    const result = await runHookRaw(JSON.stringify({ cwd: repo, tool_name: toolName, tool_input: toolInput }));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });
});
