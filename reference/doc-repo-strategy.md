> **RAW MATERIAL — NOT AUTHORITATIVE.** Part of the original idea mesh for Gunk Buster.
> Decisions live in `CONTEXT.md`, `ROADMAP.md`, `docs/adr/`, and `docs/specs/`. Where this file disagrees with those, this file is wrong.

# Gunk Buster as a high-impact GitHub repository

## Core thesis

After comparing the official documentation for Claude Code, Codex, and GitHub Copilot with the reference repositories you cited, the best way to turn **Gunk Buster** into a successful repo is not to launch it as “just another skills pack.” The winning format is **a deterministic CLI + MCP core**, with **skills, subagents, plugins, and hooks serving only as distribution and orchestration surfaces**. This follows the current ecosystem direction exactly: skills exist to load instructions progressively on demand, while plugins are the distributable package that bundles skills, agents, hooks, and MCP.

The category opportunity is also real. Adjacent tools already address “context rot,” stale `AGENTS.md` files, tech debt, and generic cleanup, but none clearly owns the space of **“AI context safety for repositories.”** At the same time, recent research shows that context files only help somewhat when written by humans and may actually **hurt performance and increase cost** when automatically generated or bloated; in one benchmark, LLM-generated context files reduced average performance and increased costs by more than 20%. This strengthens your core thesis: the problem is not “mess,” but **plausible yet misleading context** that the agent reads before acting.

In other words, the strongest pitch is not “clean up your repo.” It is something more specific and memorable, such as: **“Gunk Buster finds hallucination bait in your repository before your agent eats stale junk.”** This framing is more defensible because it differentiates the product from generic cleaners and matches the real behavior of modern agents, which load instructions, memories, rules, and skills from the repository itself.

## What the platforms already validate

The current ecosystem validates almost everything your design proposes. In Claude Code, skills are reusable instructions in `SKILL.md`, including custom commands; subagents run in **separate context windows**, with their own prompts, permissions, and tools; hooks provide **deterministic control** at lifecycle points; and plugins package commands, agents, hooks, and MCP into one distributable artifact. In addition, Claude loads `CLAUDE.md` at the beginning of every session, and its own documentation recommends using skills or scoped rules when the content becomes too large.

This matters directly for Gunk Buster’s design for two reasons. First, Claude already has built-in agents such as **Explore** and **Plan**, both focused on research and reading, and Explore is explicitly **read-only**. Second, the documentation recommends keeping `CLAUDE.md` concise, targeting fewer than 200 lines, precisely because it enters startup context and consumes tokens. This is almost an informal specification of what your **Gunk Radar** should inspect.

In Codex, the fit is even more direct for your idea of “instruction layers.” Codex reads `AGENTS.md` before starting work, traverses from the root to the current directory, concatenates files in order, and lets the files closest to the work **override** broader guidance; it also has a default combined instruction-size limit. Skills follow the open `SKILL.md` standard and progressive disclosure; plugins bundle skills, apps, and MCP; hooks may come from plugins; and subagents are created only when you **explicitly request them**, making Codex an excellent target for a hygiene and auditing product with an explicit workflow.

In GitHub Copilot, the risk surface is the most fragmented—and that is precisely why **Gunk Radar** can become a differentiator. Copilot distinguishes repository instructions in `.github/copilot-instructions.md`, path-specific instructions in `.github/instructions/**/*.instructions.md`, and agent instructions such as `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md`, depending on the surface. In the CLI, skills live in directories such as `.github/skills`, `.claude/skills`, and `.agents/skills`; custom agents can run as subagents with a **separate context window**; plugins can package skills, agents, hooks, and MCP; and hooks are shell commands triggered at strategic moments in the agent workflow.

The practical conclusion is simple: **Gunk Radar cannot inspect only docs and “old” files**. It must audit every surface agents actually consume: `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, path-specific rules, skills, and any local imports or overrides. This is not a nice-to-have feature; it is the very layer where agent behavior is shaped.

## Positioning and narrative that sell

The reference repositories show a very strong pattern: the most successful ones do not sell only a feature; they sell a **way of working**. Superpowers is not “a pile of skills,” but a methodology involving brainstorming, design, planning, TDD, subagent execution, review, and branch closing. Its README makes this explicit and even describes a mandatory workflow. This is the best strategic lesson to borrow for Gunk Buster: rather than selling “scan files,” sell an **operational ritual**.

The ritual you proposed is already very close to ideal: **Scan → Pile → Ask Chief → Trap → Verify → Report → Guard**. It works because it turns a tedious hygiene task into a workflow with semantics, safety, and memory. It also matches what helped Caveman and Ponytail spread: both have a short promise, a clear persona, and an easy-to-repeat metric. Caveman promises to “say less without getting dumber,” preserving code, commands, and errors byte-for-byte, and publishes benchmarks showing average output reduction. Ponytail sells “the lazy senior developer” and supports that with real numbers on smaller diffs and less over-engineering.

For that reason, I would position Gunk Buster’s marketing around three persistent phrases throughout the README, releases, and demos:

| Element   | Recommended wording                                                |
| --------- | ------------------------------------------------------------------ |
| Category  | **AI Context Gunk Control**                                        |
| Pitch     | **Find stale repo residue before your coding agent eats it**       |
| Guarantee | **Nothing deleted by default. Everything trapped with a receipt.** |

That final line is especially important. Because Claude and Codex load startup instructions and files closer to the working directory, and because Copilot combines global, path-specific, and agent instructions, leaving “old files” inside the repository in folders such as `archive/`, `.old/`, or `deprecated/` still leaves potentially readable material for the agent. Therefore, the product’s strongest strategy is **external quarantine with a receipt**, not “move it into a repository subdirectory.” This is an architectural inference, but it is strongly supported by how these clients discover instruction and context files.

The competitive space also favors this choice. `agents-lint` and Agent Lint already discuss stale references, context rot, and alignment between `AGENTS.md`, rules, and the codebase; Copilot ecosystem’s “Universal Janitor” sells simplification and tech-debt removal; but none of these repos frames the proposition as a **protection layer against “hallucination bait” in repositories**. That is your exclusive lane. I would avoid calling Gunk Buster a “repo cleanup tool” altogether, because that pushes it into competition with generic janitors. The positioning should be **repo-context safety**, with cleanup as a secondary outcome.

On GitHub itself, there are four simple but important levers. The README must explain why the project is useful and how to use it; **topics** improve discovery; **releases** help distribute iterations and binaries; and a **social preview** significantly improves click-through when someone shares the repository. If you want to form a community around heuristics, edge cases, and false positives, enabling **Discussions** is also worthwhile.

In practice, the initial README should follow this order: one-line pitch; a short “before/after” transcript; the “nothing deleted by default” safety block; a real `gunk radar` example; an agent-support table; a 30-second quickstart; reproducible benchmarks and fixtures; a concise architecture overview; and only then extensive documentation. This follows the immediate-clarity pattern seen in the Superpowers, Caveman, and Ponytail READMEs.

## Code architecture that supports the product

The recommended MVP architecture is **TypeScript + Node.js + pnpm**, but the important point is not the language itself: it is the fit with the distribution ecosystem. Claude Code is installed through npm; Ponytail relies on small Node hooks in Claude and Codex; and several adjacent tools in this space are Node CLIs or npm-first. In other words, this stack reduces friction for installation, publishing, and code reuse between the CLI, plugins, and MCP server.

The internal architecture should not be “a scanner that deletes files.” It should be a decision pipeline with evidence, reversibility, and verification:

| Layer      | Responsibility                                                                      |
| ---------- | ----------------------------------------------------------------------------------- |
| `scan`     | Index files, Git metadata, links, imports, scripts, workflows, and context surfaces |
| `radar`    | Audit files agents read before acting                                               |
| `classify` | Label and score findings with human-readable explanations                           |
| `policy`   | Block auto-trap for protected files and ambiguous cases                             |
| `trap`     | Move content to an external vault, preserve structure, issue a receipt              |
| `verify`   | Check imports, links, scripts, CI, and Git status                                   |
| `report`   | Generate human output and JSON, plus PR comments                                    |
| `mcp`      | Expose deterministic tools to agents                                                |

This separation is the best way to keep the product reliable and auditable, and it matches what the platforms themselves encourage: small and progressive instructions through skills, subagents focused on subtasks, and MCP as the standardized path for external tools.

Your **Gunk Radar** deserves to be treated as a product within the product. Claude reads `CLAUDE.md` at the start of the session and recommends keeping it short and specific; Claude also does not read `AGENTS.md` directly unless it is imported. Codex builds an `AGENTS.md` chain from the root to the current directory, with local overrides and a byte limit. Copilot may combine `.github/copilot-instructions.md`, path-specific files, and `AGENTS.md` or equivalent files. Therefore, “stale repo residue” for agents is not just old documentation: it is also **package-manager drift, dead paths, outdated commands, architecture contradicted by the code, duplicated rules, and leakage from tool-specific instructions**.

The **external trap** strategy is, in my view, the best decision in your design. Because these agents read the repository and in many cases automatically load instructions or memories, moving “junk” inside the repository improves human organization but does not necessarily reduce semantic exposure for the agent. An external vault with versioned receipts inside the repository is better because it preserves reversibility while removing the object from the agent’s discovery surface. This is an architectural inference rather than a rule explicitly stated in the docs, but it follows directly from the context-loading model described by Claude, Codex, and Copilot.

I would also keep your scoring **explainable** and conservative. Claude’s documentation makes clear that long instructions consume context and contradictory rules reduce adherence; the context-files paper shows higher costs and limited benefits when context is poor; and tools such as agents-lint already demonstrate that stale paths, dead scripts, and conflicting files are real problems. This suggests Gunk Buster should prioritize a **low false-positive rate** over aggressive removal. Your “trap, not delete” threshold is correct; I would treat any file with a startup, compliance, build, infrastructure, or migration role as **protected by default**.

Finally, the repo needs to prove its safety through tests, not only text. Caveman and Ponytail gain credibility because they show reproducible measurements and clearly explain what their numbers mean. Gunk Buster should do the same with **fixtures**: `stale-agent-files`, `dead-paths`, `package-manager-drift`, `superseded-docs`, `generated-dumps`, and `false-positive-protected-files`. Every fixture should have an expected benchmark, score, label, and restore test. This turns the proposition into something verifiable and shareable.

## Cross-platform distribution without losing focus

The golden rule is: **one core, several shells**. The core is the CLI and MCP server. Everything else must stay thin. This is exactly what the Agent Skills pattern and the platforms suggest: skills load instructions on demand; plugins are the distributable package; MCP connects the agent to external tools; subagents isolate subtasks without polluting the main context.

That leads to a very objective distribution design:

| Surface   | Role in Gunk Buster                                              | What it should not do                                |
| --------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| CLI       | Scanner, classifier, trap, restore, verify, report               | Improvise behavior through prompts                   |
| MCP       | Expose `scan`, `findings`, `explain`, `trap`, `restore`, `guard` | Execute ad hoc shell operations outside the contract |
| Skills    | Teach when to call the engine and how to interpret output        | Contain heavy scanning logic                         |
| Subagents | Separate scan/radar/review into isolated contexts                | Perform implicit destructive mutations               |
| Hooks     | Warn, validate, block dangerous patterns                         | Be required for core functionality                   |
| Plugins   | Distribution and installation in each ecosystem                  | Become the “main product”                            |

This distribution also solves a common risk in agent-first repositories: bloating skills with logic that should belong in the executable. Matt Pocock is explicit that a skill’s description is its invocation trigger and that every new skill costs context. The Agent Skills pattern is also explicit about progressive disclosure: name and description first, full content only when needed. In practical terms, this is a strong argument against one huge skill and in favor of small skills such as `gunk-scan`, `gunk-radar`, `gunk-trap`, `gunk-restore`, `gunk-guard`, and `gunk-report`.

For subagents, I would follow a highly conservative model. In Claude, Explore and Plan already demonstrate the right approach: research in separate context, preferably read-only. In Copilot, custom agents also run in a separate window. In Codex, there are built-ins such as `explorer`, and subagents are only created on explicit request. Therefore, I would make `gunk-scanner` and `gunk-radar-agent` **read-only by default**, give `gunk-trap-agent` narrow and explicit permission, and orient `gunk-guard-agent` toward PR review and CI. This reduces risk and reinforces the “scan before bust” narrative.

With hooks, the best path is to treat the feature as **deterministic but non-essential**. Anthropic and GitHub describe hooks precisely as shell commands at strategic points in the lifecycle; Codex requires review and trust for unmanaged hooks; and Ponytail shows in practice that users need to review and trust lifecycle hooks. In other words, hooks are excellent for **session warnings**, `PreToolUse` checks that prevent unauthorized destruction, or verification reminders. But the MVP must work fully without them, because trusting and installing hooks adds friction.

Among the three platforms, I would prioritize them this way: **Claude Code first, Codex next, Copilot afterward**. Claude is currently the richest target for plugin bundles with skills, agents, hooks, and MCP, alongside an official plugin and marketplace ecosystem. Codex is second-best because it aligns extremely well with AGENTS files, skills, subagents, plugins, and MCP, but tends toward more explicit workflows. Copilot is strategically important because of its reach, but its surface is much more distributed across GitHub.com, CLI, and IDEs, so the finishing cost is higher. This ordering is my recommendation, but it is consistent with the level of officially documented integration.

## Launch plan and metrics

The launch should not begin by trying to “support every agent in the world.” Repositories that go viral in this space make one clear promise, provide an obvious installation path, and show concrete evidence quickly. The best plan is to launch in layers, with each layer reinforcing the previous one.

I would follow this sequence:

| Phase  | Main delivery                                                   | Repository goal                                                      |
| ------ | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `v0.1` | `gunk scan`, `gunk radar`, `gunk report`, fixtures, JSON output | Prove the problem and generate shareable screenshots and transcripts |
| `v0.2` | `gunk trap`, `gunk restore`, receipts, verify                   | Prove reversible safety                                              |
| `v0.3` | MCP server + Claude plugin + initial skill set                  | Gain adoption among agent power users                                |
| `v0.4` | Codex plugin + GitHub Action `gunk guard`                       | Enter CI and PR workflows                                            |
| `v0.5` | More polished Copilot support + comparative documentation       | Expand discovery and distribution                                    |

On the GitHub repository’s landing page, I would focus early on five public metrics: **Gunk Score**, **AI Context Risk**, **BAIT/MOLD/GHOST items detected**, **token waste estimate**, and **trap receipts generated**. Caveman and Ponytail clearly show how simple, repeatable metrics help transform a concept into a shareable artifact; the research on context files also provides a basis for treating context cost as part of the problem, not merely “organization.”

It is also worth incorporating GitHub-native mechanics from the beginning. Add specific topics for discovery; publish releases from the start, even small ones; use a social preview image that shows the contrast between a “normal repo” and a “repo full of hallucination bait”; and enable Discussions to collect real false-positive cases and strange agent-file patterns. These features exist specifically to make repositories easier to find, understand, and adopt.

The product’s main private operational metric should be **user-perceived false positives**. If the scanner appears “smart” but makes too many mistakes, the product will die quickly. I would therefore track internally: the rate of restored traps, the percentage of findings promoted from “Ask Chief” to “Trap,” the number of post-trap verification failures, and the incidence of protected files incorrectly suggested for action. Academic research and context-lint projects reinforce the same point: poor context is not merely noise—it has a real cost and can degrade outcomes. The product will become a category only if it is seen as trustworthy.

The executive summary, then, is this: **keep the name and the idea, but change the center of gravity**. Make Gunk Buster a **deterministic repository context-hygiene engine**, with **external quarantine and receipts** as its safety signature, **Gunk Radar** as its killer feature, and **skills/plugins/subagents** as distribution channels. On GitHub, sell the pain first—“hallucination bait”—and only then the implementation. In architecture, do the reverse: build the reliable implementation first, then the agent-friendly shells. That is what turns a good concept into a repository people will genuinely adopt.
