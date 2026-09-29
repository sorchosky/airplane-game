# AGENTS.md

Follow `CLAUDE.md` exactly. It is the single source of truth for every agent working in this repo. This file only covers where a Codex cloud sandbox can't follow that protocol, and what to do instead.

## Codex: sandbox differences

Your checkout has no git remote and no GitHub access. You cannot read issues, fetch `main`, comment, label, or open the PR yourself. The Codex UI opens the PR from your branch and final message.

- **The ticket comes from the prompt.** The owner pastes the issue number and body. If the prompt has only a number, look it up in `docs/roadmap.md`. If the acceptance criteria still aren't there, stop and ask for the issue body. Don't guess scope.
- **Blocked on an owner decision?** You can't comment or label, so put the question in your final message as options plus a recommendation, and stop. The owner will add `needs-human` on the issue.
- **Decisions go in new files only.** Add `docs/decisions/<YYYY-MM-DD>-<issue#>-<slug>.md` (see `docs/decisions/README.md`). Never append to `docs/decisions.md` or to any other shared list if a new file will do. A new file can't conflict with PRs merged while yours is open.
- **Keep shared files to minimal, local edits.** For example, add tokens next to related ones, not at the end of the block. Put screenshots in `docs/screenshots/<issue#>-<name>.png`.
- **Don't try to resolve merge conflicts.** Your `main` is a snapshot from task start, so you can't see what GitHub is comparing against. If the owner reports a conflict, say that in one line and stop. The owner resolves it in a Claude Code session or with GitHub's "Update branch".
- **Dependencies** are installed by `scripts/codex-setup.sh`, which runs as the environment setup script. If `node_modules` is missing, say so in your final message rather than retrying without network.
- **Playwright.** `CLAUDE.md`'s "never run `playwright install`" and `/opt/pw-browsers` path are for Claude cloud sessions. Here the setup script installs Chromium. If `npm run e2e` still can't launch a browser, say so under Verification. CI runs e2e on every PR.

## Codex: final message = PR body

Write your final message as the PR body, following `.github/pull_request_template.md` section by section:

- The first line is `Closes #<issue>` so the issue closes on merge.
- Copy the issue's acceptance criteria and check each one off.
- List every command you ran and its result under Verification. `npm run check` must pass.
- Add screenshots for visual changes, or state why you couldn't capture them.
- Under Decisions, name the file you added under `docs/decisions/`, or write "none".
- Handoff notes cover follow-ups and anything outside scope you noticed.
