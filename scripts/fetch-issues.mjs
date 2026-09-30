#!/usr/bin/env node
// Mirrors open GitHub issues into docs/issues/<number>.md so agents without
// GitHub access (Codex) can read a ticket from its number alone. Run by
// .github/workflows/sync-issues.yml on every issue change. Uses curl rather
// than fetch() so sandbox HTTPS proxies apply. Set GITHUB_TOKEN to avoid the
// 60 requests/hour unauthenticated limit.
//
//   node scripts/fetch-issues.mjs        mirror every open issue, drop closed ones
//   node scripts/fetch-issues.mjs 129    mirror #129 and print it
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'sorchosky/airplane-game'
const OUT_DIR = join('docs', 'issues')
const ISSUE_FILE = /^\d+\.md$/

function getJson(path) {
  const headers = ['-H', 'Accept: application/vnd.github+json']
  if (process.env.GITHUB_TOKEN) {
    headers.push('-H', `Authorization: Bearer ${process.env.GITHUB_TOKEN}`)
  }
  const out = execFileSync(
    'curl',
    ['-fsSL', '--retry', '3', ...headers, `https://api.github.com${path}`],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  return JSON.parse(out)
}

function toMarkdown(issue) {
  const labels = issue.labels.map((l) => (typeof l === 'string' ? l : l.name)).join(', ')
  return [
    `# #${issue.number} ${issue.title}`,
    '',
    `State: ${issue.state} · Labels: ${labels || 'none'} · ${issue.html_url}`,
    '',
    issue.body ?? '',
    '',
  ].join('\n')
}

function save(issue) {
  writeFileSync(join(OUT_DIR, `${issue.number}.md`), toMarkdown(issue))
}

mkdirSync(OUT_DIR, { recursive: true })
const arg = process.argv[2]

if (arg) {
  const issue = getJson(`/repos/${REPO}/issues/${Number(arg)}`)
  save(issue)
  process.stdout.write(toMarkdown(issue))
} else {
  // Fetch everything before touching disk, so a failed request leaves the
  // existing mirror intact.
  const issues = []
  for (let page = 1; ; page++) {
    const batch = getJson(`/repos/${REPO}/issues?state=open&per_page=100&page=${page}`)
    // The issues endpoint also returns pull requests; skip them.
    issues.push(...batch.filter((issue) => !issue.pull_request))
    if (batch.length < 100) break
  }
  for (const file of readdirSync(OUT_DIR)) {
    if (ISSUE_FILE.test(file)) rmSync(join(OUT_DIR, file))
  }
  issues.forEach(save)
  console.log(`Mirrored ${issues.length} open issues in ${OUT_DIR}/`)
}
