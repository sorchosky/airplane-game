# airplane-game

Fly a cel-shaded bush plane through a Breath of the Wild inspired world using your body as the controller. Prop your phone up, cast it to the TV, spread your arms like wings, and tilt to fly.

- **Start here (agents and humans):** [`CLAUDE.md`](CLAUDE.md)
- **Roadmap and ticket order:** [`docs/roadmap.md`](docs/roadmap.md)
- **Settled decisions:** [`docs/decisions.md`](docs/decisions.md)
- **Starting a ticket session:** [`docs/kickoff-prompt.md`](docs/kickoff-prompt.md)

## CI and previews

Every PR runs `npm run check` (typecheck, lint, unit tests) and `npm run build` in GitHub Actions (`.github/workflows/ci.yml`). Once the repo is connected in Vercel (see #7), every PR also gets a preview deployment, posted as a comment on the PR by the Vercel GitHub bot.

The camera API requires HTTPS, so testing gesture control on a phone means using the preview URL, not `localhost`:

1. Open the PR on GitHub and find the Vercel bot's comment (or check the deployment status below the PR's checks).
2. Open that preview URL on your phone.
3. Grant camera access when prompted, then follow the on-screen calibration flow.
