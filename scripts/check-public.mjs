// Check the exact Git index that would be committed, not ignored local backups.
import { execFileSync } from 'node:child_process';
import { root } from './validate.mjs';

const git = process.env.GIT_BIN || 'git';
const run = (...args) => execFileSync(git, args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const files = run('ls-files', '--cached', '-z').split('\0').filter(Boolean);
if (!files.length) { console.log('No staged/tracked files yet. Stage the reviewed public files, then rerun.'); process.exit(0); }
const prohibited = /(^|\/)(legacy-private|node_modules|dist|\.local|\.aws|\.codex|\.agents)(\/|$)|(^|\/)\.env(?:\.|$)|\.(php|sql|sqlite\d*|db|pem|key|p12|pfx|zip|bak)$/i;
const secrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
  /https?:\/\/[^\s/@]+:[^\s/@]+@/,
  /^\s*(?:\$?(?:db_?)?(?:password|passwd)|(?:api_?key|client_secret|access_token))\s*[:=]\s*["'][^"']{6,}["']/im,
];
const violations = [];
for (const file of files) {
  if (prohibited.test(file)) { violations.push(`${file}: prohibited public path`); continue; }
  const content = run('show', `:${file}`);
  if (secrets.some((pattern) => pattern.test(content))) violations.push(`${file}: potential secret (value withheld)`);
}
if (violations.length) { console.error(violations.join('\n')); process.exit(1); }
console.log(`Checked ${files.length} indexed files: no prohibited paths or common secret patterns detected. This is a focused check, not a guarantee; review changes before pushing.`);
