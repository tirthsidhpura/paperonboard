import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function collectContributors(pulls) {
  const people = new Map();
  for (const pull of pulls) {
    if (!pull.merged_at || !pull.user || pull.user.type === 'Bot' || pull.user.login.endsWith('[bot]')) continue;
    const { login } = pull.user;
    if (!/^[a-zA-Z0-9-]+$/.test(login)) throw new Error('Invalid GitHub contributor login');
    const key = login.toLowerCase();
    const person = people.get(key) || { login, mergedPRs: 0 };
    person.mergedPRs++;
    people.set(key, person);
  }
  return [...people.values()].sort((a, b) => b.mergedPRs - a.mergedPRs || a.login.localeCompare(b.login));
}

export async function updateContributors() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository || '')) throw new Error('Set GITHUB_REPOSITORY to owner/repository.');
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required for the contributor sync.');
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const request = async (endpoint) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`GitHub contributor request failed (HTTP ${response.status}); deployment stopped.`);
    return response.json();
  };
  const repo = await request('');
  const pulls = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({ state: 'closed', base: repo.default_branch, per_page: '100', page: String(page), sort: 'created', direction: 'asc' });
    const batch = await request(`/pulls?${params}`);
    if (!Array.isArray(batch)) throw new Error('Unexpected GitHub pull request response');
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  const output = { repository, updatedAt: new Date().toISOString(), contributors: collectContributors(pulls) };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  fs.writeFileSync(path.join(root, 'data/contributors.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Updated ${output.contributors.length} contributors from merged pull requests.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  updateContributors().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
