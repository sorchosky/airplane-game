# Kickoff prompts

Paste one of these into a fresh Claude Code web session on this repo.

## Run the next ticket (default — just say this)

Use this every time. It picks the ticket itself, so you never track issue numbers.

```
Run the next ticket in sorchosky/airplane-game.

1. List open issues labeled agent-ready (exclude epics and anything still labeled needs-human).
2. For each candidate, read its "Depends on" line and confirm every issue it names is closed.
   Use docs/roadmap.md for the intended order and to break ties.
3. Pick the lowest-numbered unblocked ticket. If none are unblocked, say so and stop —
   don't guess at scope or start something not filed as a ticket.
4. Read CLAUDE.md and follow its session protocol exactly for that issue.
5. Stay within the issue's scope. Run `npm run check` before pushing.
6. Open a PR that closes the issue, using the PR template, and include handoff notes.
7. If a decision only the owner can make blocks you, comment on the issue with options
   and a recommendation, label it needs-human, and stop.

At the end, state which issue you worked and its PR link.
```

## Run a specific ticket

Use this when you want a particular issue done next (e.g. jumping ahead to an art ticket to check the look). Replace `<N>`.

```
Work on GitHub issue #<N> in sorchosky/airplane-game.
Read CLAUDE.md first and follow its session protocol exactly.
Stay within the issue's scope. Run `npm run check` before pushing.
Open a PR that closes the issue, using the PR template, and include handoff notes.
If a decision only I can make blocks you, comment on the issue with options and a recommendation, label it needs-human, and stop.
```

## Tips for stretching a Pro plan

- Start a fresh session per ticket. Do not continue a long session into the next ticket, and don't ask a session to run more than one ticket in the "next ticket" loop — one and done, every time.
- Run "next ticket" back to back. M1 and M2 don't depend on each other past #9, so the picker will naturally interleave them once both are unblocked.
- A ticket still labeled `needs-human` is skipped by the picker until you resolve its owner step and remove the label (or close it as not needed). Check `docs/roadmap.md` for what each one needs from you.
- `size:S` tickets are good candidates for a lighter model. Keep `size:M` and art tickets on the stronger one.
- Review at milestone ends, not every PR. Open the Vercel preview on your phone, cast it, and play.
