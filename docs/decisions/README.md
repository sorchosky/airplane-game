# Decisions (one file per decision)

Every decision made from 2026-09-29 on lives here, one file each. `../decisions.md` holds everything earlier and is frozen.

- **File name:** `YYYY-MM-DD-<issue#>-<short-slug>.md`, e.g. `2026-10-02-82-seated-deadzones.md`. Use `0` for the issue number when there is none. Date prefixes keep `ls` in chronological order.
- **Contents:** exactly one line in the log format, `- YYYY-MM-DD · area · decision · why`. Reuse an area name from `CLAUDE.md`.
- **Superseding:** add a new file that says which decision it replaces. Don't edit old entries.
- **Search:** `grep -rhE '· (flight|controls) ·' docs/decisions.md docs/decisions/`

Why separate files: every PR used to append to the end of one file, so any two open PRs conflicted there, and sandboxed agents without access to the latest `main` couldn't resolve it. New files never conflict.
