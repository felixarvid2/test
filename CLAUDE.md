# Working in this repository

Several projects live here: `rune/`, `natverksspel/`, `cisco-analyzer/`, `tiny-dungeon/`, `vlan-tool-rs/`, `and-code/`,
and the asset library in `assets/`.

`and-code/` is a copy of https://github.com/yuga-hashimoto/and-code (MIT, `main` at f0c0806), without its git history.
Its `.github/workflows/` do not run from a subdirectory.

Ashfall (the TypeScript/Three.js action RPG) moved to https://github.com/felixarvid2/Ashfall.
`assets/ashfall-ai/` stays here as its asset library.

FamilyChat moved to https://github.com/felixarvid2/swahn-chatt and is now called Swahn Chat.

Thor Survivors (ASHFALL: Lumen Tide) moved to https://github.com/felixarvid2/thor-survivors; its build tools
read `assets/` here as the shared asset library.

## Who does what

Work is split by model; the subagents live in `.claude/agents/`.

| Work | Who | Model |
|---|---|---|
| Finding files and symbols, reading code, answering "where/how" | `Explore` | Haiku |
| Simple mechanical edits that are already fully specified (renames, strings, data values, the same small change in many places) | `mechanic` | Haiku |
| Regular coding: implementing a specified feature or fix, tests, planned refactors | `implementer` | Sonnet |
| Running a project's checks (tests, build, lint) and reporting only the verdict and failures | `verifier` | Haiku |
| Docs from a short summary: READMEs, notes, commit and PR bodies | `scribe` | Haiku |
| Shipping: commit, push, PR (merge only after the user approves) | `shipper` | Haiku |
| Architecture, trade-offs, hard bugs with an unknown cause, risk review | the main session, or `architect` when the main session runs a smaller model | Opus |

- Delegate search and reading to `Explore` instead of reading many files yourself, and pass it the
  question, not a file list to dump.
- Hand `implementer` a clear spec (what, where, how to verify); hand `mechanic` the exact change.
  Run independent pieces in parallel.
- Keep decisions here: choosing an approach, reviewing what subagents return, and anything that
  spans several systems. Check their results (the diff and the verifier's verdict) before committing.
- Hand `verifier` the project to check; hand `scribe` the facts. `shipper` merges a pull request
  only when told that the user approved that merge.
- Standing approval from the user: after each change, once the checks pass, merge its pull request
  into `main` (merge commit) without asking first.
