---
inclusion: always
---

# Working on PetalPal

Several agents (Claude Code, Kiro) take turns on this repository. These notes let each one pick
up where the last stopped. [AGENTS.md](../../AGENTS.md) and [WARNING.md](../../WARNING.md) still
take precedence.

## Before you start

1. Check where things stand: `git status -sb` and `git log --oneline -8` on the branch you were
   given.
2. Read the handoff notes for the work you were given in [docs/handoff/](../../docs/handoff/). The
   Garden pet wardrobe is in `docs/handoff/garden-pet-wardrobe.md`: its state, next steps and the
   owner's rules for the art and the pets.
3. To find code, ask the code graph before reading many files: the `graphify` MCP tools
   (`query_graph`, `get_neighbors`, `shortest_path`), or `graphify query "<question>"`. It is built
   from this checkout's code. If it looks out of date, `graphify update .` rebuilds it (no model
   calls).

## When you stop

Update the handoff notes in the same commit as the work: what is now done, what is next, anything
the next agent must not undo. A piece of work is not finished until the notes say where it stands.

## Git and safety

- Work on a branch and commit there. The owner pushes, opens and merges pull requests, runs
  database migrations and deploys. Never push, merge, rebase, cherry-pick, force, or reset onto
  someone else's commits, and never edit a branch on GitHub's website.
- Never read `.env` files, keys or tokens, and never print one.
- Paid image and video generation runs only on the owner's Mac (`~/dev/petalpal-motion`): never ask
  for its keys. Ask the owner when new art is needed.

## Talking to the owner

Reply in Chinese, short and plain.
