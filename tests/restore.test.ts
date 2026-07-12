import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, type GunkConfig } from "../src/config.js";
import { GunkError } from "../src/errors.js";
import { hashIndexedFile } from "../src/file-index.js";
import { loadReceipts, restore } from "../src/restore.js";
import { persistScanResult, scan } from "../src/scan.js";
import { trapReceiptSchema, type TrapReceipt } from "../src/schema.js";
import { trap } from "../src/trap.js";
import { NINETY_DAYS_AGO } from "./helpers/findings.js";
import { createFixtureRepo, createTempDir, removeDir } from "./helpers/fixture.js";

/** Distinct fixed clocks, so multiple traps in one test get distinct, sortable trap-ids. */
const TRAP_NOW = new Date("2026-07-11T14:22:05.123Z");
const LATER_TRAP_NOW = new Date("2026-07-11T15:00:00.000Z");
const RESTORE_NOW = new Date("2026-07-12T09:00:00.000Z");

describe("restore(repoRoot, ref, opts) — engine seam", () => {
  let repo: string;
  let vaultParent: string;
  let config: GunkConfig;

  beforeEach(async () => {
    // orphan-docs, backdated past the recency window: two PROPOSE file
    // findings (docs/old-plan.md and assets/unused-diagram.png).
    repo = await createFixtureRepo("orphan-docs", { commitDate: NINETY_DAYS_AGO });
    vaultParent = await createTempDir();
    config = defaultConfig();
    config.trap.vaultRoot = path.join(vaultParent, "vault");
    await persistScanResult(await scan(repo, config));
  });

  afterEach(async () => {
    await removeDir(repo);
    await removeDir(vaultParent);
  });

  async function trapOldPlan(batchId?: string): Promise<TrapReceipt> {
    return trap(repo, "docs/old-plan.md", {
      config,
      now: () => TRAP_NOW,
      ...(batchId === undefined ? {} : { batchId }),
    });
  }

  async function readInRepoReceipt(trapId: string): Promise<TrapReceipt> {
    const raw = await readFile(
      path.join(repo, ".gunk-buster", "receipts", `${trapId}.json`),
      "utf8",
    );
    return trapReceiptSchema.parse(JSON.parse(raw));
  }

  describe("by trap-id", () => {
    it("copies the file back byte-identically and flips the receipt to restored", async () => {
      const originalHash = await hashIndexedFile(repo, "docs/old-plan.md");
      const receipt = await trapOldPlan();
      expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(false);

      const result = await restore(
        repo,
        { trapId: receipt.trapId },
        { config, now: () => RESTORE_NOW },
      );

      // byte-identity proven by hash on the written file
      expect(await hashIndexedFile(repo, "docs/old-plan.md")).toBe(originalHash);

      // the returned receipt is flipped…
      expect(result.restored).toHaveLength(1);
      expect(result.restored[0]?.status).toBe("restored");
      expect(result.restored[0]?.restoredAt).toBe(RESTORE_NOW.toISOString());

      // …and so is the persisted in-repo receipt (the durable audit record survives)
      const persisted = await readInRepoReceipt(receipt.trapId);
      expect(persisted.status).toBe("restored");
      expect(persisted.restoredAt).toBe(RESTORE_NOW.toISOString());
    });

    it("copies (not moves): the vault stays append-only, nothing removed", async () => {
      const receipt = await trapOldPlan();
      await restore(repo, { trapId: receipt.trapId }, { config });

      const vaultFileAbs = path.resolve(repo, receipt.vaultPath);
      expect(existsSync(vaultFileAbs)).toBe(true);
      expect(await hashIndexedFile(path.dirname(vaultFileAbs), path.basename(vaultFileAbs))).toBe(
        receipt.contentHash,
      );
    });

    it("restoring an already-restored trap-id is a detected no-op", async () => {
      const receipt = await trapOldPlan();
      await restore(repo, { trapId: receipt.trapId }, { config, now: () => RESTORE_NOW });

      const again = await restore(repo, { trapId: receipt.trapId }, { config });
      expect(again.restored).toHaveLength(0);
      expect(again.alreadyRestored).toEqual([receipt.trapId]);
      // the original restoredAt is untouched by the no-op
      const persisted = await readInRepoReceipt(receipt.trapId);
      expect(persisted.restoredAt).toBe(RESTORE_NOW.toISOString());
    });

    it("refuses an unknown trap-id", async () => {
      await trapOldPlan();
      await expect(restore(repo, { trapId: "2020-01-01T00-00-00Z-nope" }, { config }))
        .rejects.toBeInstanceOf(GunkError);
    });

    it("hard-errors when the vault copy's hash mismatches the receipt", async () => {
      const receipt = await trapOldPlan();
      await writeFile(path.resolve(repo, receipt.vaultPath), "corrupted vault bytes\n");

      await expect(restore(repo, { trapId: receipt.trapId }, { config }))
        .rejects.toThrow(/vault/i);
      // a refusal never mutates: nothing came back, the receipt stays trapped
      expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(false);
      expect((await readInRepoReceipt(receipt.trapId)).status).toBe("trapped");
    });

    it("refuses an occupied original path with different content, unless --force", async () => {
      const originalHash = await hashIndexedFile(repo, "docs/old-plan.md");
      const receipt = await trapOldPlan();
      await writeFile(path.join(repo, "docs", "old-plan.md"), "a different squatter file\n");

      await expect(restore(repo, { trapId: receipt.trapId }, { config }))
        .rejects.toThrow(/force/i);
      expect((await readInRepoReceipt(receipt.trapId)).status).toBe("trapped");

      const forced = await restore(repo, { trapId: receipt.trapId }, { config, force: true });
      expect(forced.restored).toHaveLength(1);
      expect(await hashIndexedFile(repo, "docs/old-plan.md")).toBe(originalHash);
    });

    it("proceeds without --force when the occupied path already holds identical bytes", async () => {
      const receipt = await trapOldPlan();
      const vaultBytes = await readFile(path.resolve(repo, receipt.vaultPath));
      await writeFile(path.join(repo, "docs", "old-plan.md"), vaultBytes);

      const result = await restore(repo, { trapId: receipt.trapId }, { config });
      expect(result.restored).toHaveLength(1);
    });
  });

  describe("by original path", () => {
    it("resolves the trapped receipt for that path", async () => {
      const receipt = await trapOldPlan();
      const result = await restore(repo, { path: "docs/old-plan.md" }, { config });
      expect(result.restored.map((r) => r.trapId)).toEqual([receipt.trapId]);
      expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
    });

    it("refuses a path with no trapped receipt", async () => {
      await expect(restore(repo, { path: "docs/old-plan.md" }, { config }))
        .rejects.toBeInstanceOf(GunkError);
    });

    it("ignores restored receipts: after a restore the path resolves to nothing again", async () => {
      const receipt = await trapOldPlan();
      await restore(repo, { path: "docs/old-plan.md" }, { config });
      await expect(restore(repo, { path: "docs/old-plan.md" }, { config }))
        .rejects.toThrow(/nothing trapped|no trapped/i);
      // …while the trap-id form still detects the no-op
      const again = await restore(repo, { trapId: receipt.trapId }, { config });
      expect(again.alreadyRestored).toEqual([receipt.trapId]);
    });

    it("ambiguity (two trapped receipts for one path) errors listing the candidate trap-ids", async () => {
      const receipt = await trapOldPlan();
      // Fabricate the anomalous state (e.g. a bad merge of receipts/): a
      // second trapped receipt for the same path at a later timestamp.
      const secondId = receipt.trapId.replace("14-22-05", "15-00-00");
      const second = { ...receipt, trapId: secondId, batchId: secondId };
      await writeFile(
        path.join(repo, ".gunk-buster", "receipts", `${secondId}.json`),
        `${JSON.stringify(second, null, 2)}\n`,
      );

      const attempt = restore(repo, { path: "docs/old-plan.md" }, { config });
      await expect(attempt).rejects.toBeInstanceOf(GunkError);
      await expect(
        restore(repo, { path: "docs/old-plan.md" }, { config }),
      ).rejects.toThrow(new RegExp(`${receipt.trapId}[\\s\\S]*${secondId}`));
    });
  });

  describe("--batch and --all", () => {
    it("--batch restores every trapped receipt sharing the batchId", async () => {
      const batchId = "2026-07-11T14-22-05Z-bust";
      await trapOldPlan(batchId);
      await trap(repo, "assets/unused-diagram.png", {
        config,
        now: () => LATER_TRAP_NOW,
        batchId,
      });

      const result = await restore(repo, { batchId }, { config });
      expect(result.restored).toHaveLength(2);
      expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
      expect(existsSync(path.join(repo, "assets", "unused-diagram.png"))).toBe(true);
    });

    it("--batch refuses an unknown batchId", async () => {
      await trapOldPlan();
      await expect(restore(repo, { batchId: "no-such-batch" }, { config }))
        .rejects.toBeInstanceOf(GunkError);
    });

    it("--all restores everything currently trapped and skips nothing silently", async () => {
      const first = await trapOldPlan();
      await restore(repo, { trapId: first.trapId }, { config });
      // re-scan so the restored file is judged again, then trap both files
      await persistScanResult(await scan(repo, config));
      await trap(repo, "docs/old-plan.md", { config, now: () => LATER_TRAP_NOW });
      await trap(repo, "assets/unused-diagram.png", { config, now: () => LATER_TRAP_NOW });

      const result = await restore(repo, { all: true }, { config });
      // only the two currently-trapped receipts; the long-restored one is not touched
      expect(result.restored).toHaveLength(2);
      expect(result.alreadyRestored).toEqual([]);
      expect(existsSync(path.join(repo, "docs", "old-plan.md"))).toBe(true);
      expect(existsSync(path.join(repo, "assets", "unused-diagram.png"))).toBe(true);
    });

    it("--all refuses when nothing is trapped (nothing to panic about)", async () => {
      await expect(restore(repo, { all: true }, { config })).rejects.toBeInstanceOf(GunkError);
    });

    it("a multi-restore skips an occupied path with a warning entry and restores the rest", async () => {
      const batchId = "2026-07-11T14-22-05Z-bust";
      const blocked = await trapOldPlan(batchId);
      await trap(repo, "assets/unused-diagram.png", {
        config,
        now: () => LATER_TRAP_NOW,
        batchId,
      });
      await writeFile(path.join(repo, "docs", "old-plan.md"), "squatter\n");

      const result = await restore(repo, { batchId }, { config });
      expect(result.restored).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.trapId).toBe(blocked.trapId);
      expect(result.skipped[0]?.reason).toMatch(/force/i);
      expect(existsSync(path.join(repo, "assets", "unused-diagram.png"))).toBe(true);
      expect((await readInRepoReceipt(blocked.trapId)).status).toBe("trapped");
    });
  });

  describe("loadReceipts(repoRoot)", () => {
    it("returns an empty list when no receipt has ever been written", async () => {
      expect(await loadReceipts(repo)).toEqual([]);
    });

    it("parses every receipt in .gunk-buster/receipts/", async () => {
      const receipt = await trapOldPlan();
      const receipts = await loadReceipts(repo);
      expect(receipts).toEqual([receipt]);
    });
  });
});
