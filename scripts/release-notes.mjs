// Builds release notes from Conventional Commit subjects since the previous tag.
// Usage: node scripts/release-notes.mjs v1.2.0 > notes.md
// The extension shows these notes in its "Update available" and "What's new" cards.
import { execFileSync } from 'node:child_process';

const tag = process.argv[2];
if (!tag) {
  console.error('Usage: node scripts/release-notes.mjs <tag>');
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

let prev = '';
try {
  prev = git('describe', '--tags', '--abbrev=0', `${tag}^`);
} catch {
  // first release: take every commit
}

const SEP = '\u001f';
const log = git('log', '--no-merges', `--format=%s${SEP}%b${SEP}%h`, prev ? `${prev}..${tag}` : tag, '-z');
const commits = log.split('\0').filter(Boolean).map((entry) => {
  const [subject, body, hash] = entry.split(SEP);
  return { subject: subject.trim(), body: body ?? '', hash: (hash ?? '').trim() };
});

const GROUPS = [
  { title: 'Breaking changes', test: (c) => c.breaking },
  { title: 'New', test: (c) => c.type === 'feat' },
  { title: 'Fixes', test: (c) => c.type === 'fix' },
  { title: 'Improvements', test: (c) => c.type === 'perf' },
];

const parsed = [];
for (const c of commits) {
  const m = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(c.subject);
  if (!m) continue; // not a conventional commit
  const [, type, scope, bang, desc] = m;
  const breaking = !!bang || /^BREAKING[ -]CHANGE:/m.test(c.body);
  const text = desc.charAt(0).toUpperCase() + desc.slice(1);
  const label = scope ? `**${scope.charAt(0).toUpperCase()}${scope.slice(1)}:** ` : '';
  parsed.push({ type, breaking, line: `- ${label}${text}` });
}

const out = [];
for (const g of GROUPS) {
  const lines = parsed.filter((c) => g.test(c) && !GROUPS.slice(0, GROUPS.indexOf(g)).some((p) => p.test(c))).map((c) => c.line);
  if (lines.length) out.push(`## ${g.title}`, ...lines, '');
}
if (!out.length) out.push('Maintenance release: internal changes only.', '');

const repo = process.env.GITHUB_REPOSITORY ?? 'jewdev/glassgram';
out.push(`**Full Changelog**: https://github.com/${repo}/${prev ? `compare/${prev}...${tag}` : `commits/${tag}`}`);
process.stdout.write(`${out.join('\n')}\n`);
