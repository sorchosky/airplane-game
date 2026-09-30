#!/usr/bin/env node
// Caches GitHub issues as Markdown so agents without GitHub access (Codex)
// can read a ticket from its number alone. The repo is public, so no token
// is needed. Uses curl rather than fetch() so sandbox HTTPS proxies apply.
//
//   node scripts/fetch-issues.mjs        cache every open issue
//   node scripts/fetch-issues.mjs 129    cache #129 and print it
//
// Output: .issues/<number>.md (gitignored).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'sorchosky/airplane-game'
const OUT_DIR = '.issues'

function getJson(path) {
  const out = execFileSync(
    'curl',
    [
      '-fsSL',
      '--retry',
      '3',
      '-H',
      'Accept: application/vnd.github+json',
      `https://api.github.com${path}`,
    ],
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
  const file = join(OUT_DIR, `${issue.number}.md`)
  writeFileSync(file, toMarkdown(issue))
  return file
}

mkdirSync(OUT_DIR, { recursive: true })
const arg = process.argv[2]

if (arg) {
  const issue = getJson(`/repos/${REPO}/issues/${Number(arg)}`)
  save(issue)
  process.stdout.write(toMarkdown(issue))
} else {
  let count = 0
  for (let page = 1; ; page++) {
    const batch = getJson(`/repos/${REPO}/issues?state=open&per_page=100&page=${page}`)
    // The issues endpoint also returns pull requests; skip them.
    for (const issue of batch) {
      if (!issue.pull_request) {
        save(issue)
        count++
      }
    }
    if (batch.length < 100) break
  }
  console.log(`Cached ${count} open issues in ${OUT_DIR}/`)
}
