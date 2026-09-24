# Kickoff prompt

Paste this into a fresh Claude Code web session on this repo. Replace `<N>` with the issue number.

```
Work on GitHub issue #<N> in sorchosky/airplane-game.
Read CLAUDE.md first and follow its session protocol exactly.
Stay within the issue's scope. Run `npm run check` before pushing.
Open a PR that closes the issue, using the PR template, and include handoff notes.
If a decision only I can make blocks you, comment on the issue with options and a recommendation, label it needs-human, and stop.
```

## Tips for stretching a Pro plan

- Start a fresh session per ticket. Do not continue a long session into the next ticket.
- Pick the lowest-numbered open `agent-ready` ticket whose dependencies are merged. `docs/roadmap.md` shows the order.
- `size:S` tickets are good candidates for a lighter model. Keep `size:M` and art tickets on the stronger one.
- Review at milestone ends, not every PR. Open the Vercel preview on your phone, cast it, and play.
