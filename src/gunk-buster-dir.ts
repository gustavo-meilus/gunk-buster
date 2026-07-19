/**
 * The shared internal `.gitignore` content for `.gunk-buster/` (#9):
 * scan.json and radar.json are ephemeral/per-machine and must never become
 * context gunk themselves; `receipts/`, `keeps.json`, and claim exceptions stay git-tracked —
 * the audit trail the Chief commits. Every writer of `.gunk-buster/.gitignore`
 * (scan, radar, trap, keeps) shares this one constant so whichever runs
 * first never clobbers another's coverage.
 */
export const GUNK_BUSTER_GITIGNORE = "scan.json\nradar.json\nreports/\n";
