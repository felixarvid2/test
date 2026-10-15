# Working in this repository

Several projects live here: `ashfall/` (the main one: a TypeScript/Three.js action RPG with its own
docs in `ashfall/docs/`), `rune/`, `natverksspel/`, `cisco-analyzer/`, and the asset library in
`assets/`.

## Who does what

Work is split by model; the subagents live in `.claude/agents/`.

| Work | Who | Model |
|---|---|---|
| Finding files and symbols, reading code, answering "where/how" | `Explore` | Haiku |
| Simple mechanical edits that are already fully specified (renames, strings, data values, the same small change in many places) | `mechanic` | Haiku |
| Regular coding: implementing a specified feature or fix, tests, planned refactors | `implementer` | Sonnet |
| Architecture, trade-offs, hard bugs with an unknown cause, risk review | the main session, or `architect` when the main session runs a smaller model | Opus |

- Delegate search and reading to `Explore` instead of reading many files yourself, and pass it the
  question, not a file list to dump.
- Hand `implementer` a clear spec (what, where, how to verify); hand `mechanic` the exact change.
  Run independent pieces in parallel.
- Keep decisions here: choosing an approach, reviewing what subagents return, and anything that
  spans several systems. Check their results (the diff and the test output) before committing.
- In `ashfall/`, nothing is done until `npx tsc --noEmit -p .` and `npx vitest run` pass.
