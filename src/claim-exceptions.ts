import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { GunkError } from "./errors.js";
import { GUNK_BUSTER_GITIGNORE } from "./gunk-buster-dir.js";
import {
  claimExceptionLedgerSchema,
  type ClaimException,
  type ClaimExceptionLedger,
  type ClaimFinding,
} from "./schema.js";

const EXCEPTIONS_RELATIVE_PATH = path.join(".gunk-buster", "claim-exceptions.json");

export async function loadClaimExceptionLedger(repoRoot: string): Promise<ClaimExceptionLedger> {
  const ledgerPath = path.join(repoRoot, EXCEPTIONS_RELATIVE_PATH);
  let raw: string;
  try {
    raw = await readFile(ledgerPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, exceptions: [] };
    throw new GunkError(`cannot read claim exception ledger: ${String(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new GunkError(`invalid claim exception ledger at ${ledgerPath}: ${String(error)}`);
  }
  const result = claimExceptionLedgerSchema.safeParse(parsed);
  if (!result.success) {
    throw new GunkError(`invalid claim exception ledger at ${ledgerPath}: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export async function writeClaimException(repoRoot: string, entry: ClaimException): Promise<void> {
  const ledger = await loadClaimExceptionLedger(repoRoot);
  const exceptions = [
    ...ledger.exceptions.filter(
      (existing) =>
        existing.path !== entry.path ||
        existing.line !== entry.line ||
        existing.check !== entry.check ||
        existing.token !== entry.token,
    ),
    entry,
  ];
  const dir = path.join(repoRoot, ".gunk-buster");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, ".gitignore"), GUNK_BUSTER_GITIGNORE);
  await writeFile(
    path.join(dir, "claim-exceptions.json"),
    `${JSON.stringify({ schemaVersion: 1, exceptions }, null, 2)}\n`,
  );
}

export function applyClaimExceptions(
  findings: readonly ClaimFinding[],
  exceptions: readonly ClaimException[],
): ClaimFinding[] {
  return findings.map((finding) => {
    const exception = exceptions.find(
      (entry) =>
        entry.path === finding.path &&
        entry.line === finding.line &&
        entry.check === finding.check &&
        entry.token === finding.actual &&
        entry.contentHash === finding.contentHash,
    );
    return exception === undefined
      ? { ...finding, disposition: "ACTIVE" as const }
      : { ...finding, disposition: "EXCEPTED" as const, exceptionReason: exception.reason };
  });
}
