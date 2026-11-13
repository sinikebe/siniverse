/** Shared legacy Pages orchestration. Builders remain in the application repositories. */
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositories = new Set(['sinikebe/finapp', 'sinikebe/Garapp']);
const shaPattern = /^[a-f0-9]{40}$/;
const attempts = 6;
const pauseDefault = () => new Promise(resolve => setTimeout(resolve, 5000));

export function readPolicy() {
  return JSON.parse(readFileSync(new URL('./apps.json', import.meta.url), 'utf8'));
}

export function pagesProfile(repository, policy) {
  const profile = policy?.apps?.[repository];
  if (!repositories.has(repository) || profile?.pages?.enabled !== true) {
    throw new Error('This repository is not authorized for shared legacy Pages publication.');
  }
  return profile;
}

export function assertPublic(repository, value) {
  if (value?.full_name !== repository || value?.private !== false || value?.visibility !== 'public') {
    throw new Error('Legacy Pages publication requires the exact public application repository.');
  }
}

export function assertTrigger(repository, eventName, event, policy) {
  pagesProfile(repository, policy);
  assertPublic(repository, event?.repository);
  if (eventName === 'workflow_dispatch') return null;
  const run = event?.workflow_run;
  if (eventName !== 'workflow_run' || run?.name !== 'CI' || run?.event !== 'push'
      || run?.status !== 'completed' || run?.conclusion !== 'success'
      || run?.head_repository?.full_name !== repository
      || !['main', 'dev'].includes(run?.head_branch) || !shaPattern.test(run?.head_sha ?? '')) {
    throw new Error('Pages requires successful same-repository push CI on main/dev or a manual request.');
  }
  return { branch: run.head_branch, sha: run.head_sha };
}

export function artifactName(runId, attempt) {
  if (!/^[1-9][0-9]*$/.test(String(runId)) || !/^[1-9][0-9]*$/.test(String(attempt))) {
    throw new Error('A numeric workflow run ID and attempt are required.');
  }
  return `github-pages-${runId}-${attempt}`;
}

export function githubClient(token, fetchImpl = fetch) {
  if (!token) throw new Error('The existing read-only GitHub Actions token is required.');
  return async path => {
    if (!path.startsWith('/repos/')) throw new Error('Only repository API reads are supported.');
    let response;
    try {
      response = await fetchImpl(new URL(path, 'https://api.github.com'), {
        redirect: 'error',
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
        signal: AbortSignal.timeout(15000),
      });
    } catch { throw new Error('GitHub Pages API read failed.'); }
    if (!response.ok) throw new Error(`GitHub Pages API read failed with HTTP ${response.status}.`);
    return response.json();
  };
}

async function heads(repository, request) {
  const refs = await Promise.all(['main', 'dev'].map(branch => request(`/repos/${repository}/git/ref/heads/${branch}`)));
  const result = { main: refs[0]?.object?.sha, dev: refs[1]?.object?.sha };
  if (!Object.values(result).every(sha => shaPattern.test(sha ?? ''))) {
    throw new Error('Both main and dev must exist at exact commit revisions.');
  }
  return result;
}

async function requireCI(repository, branch, sha, request, pause) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const data = await request(`/repos/${repository}/actions/workflows/ci.yml/runs?branch=${branch}&event=push&head_sha=${sha}&per_page=30`);
    if (data.workflow_runs?.some(run => run.head_sha === sha && run.head_branch === branch
        && run.head_repository?.full_name === repository && run.event === 'push'
        && run.status === 'completed' && run.conclusion === 'success')) return;
    if (attempt < attempts - 1) await pause();
  }
  throw new Error(`No successful push CI for the current ${branch} revision after bounded waiting.`);
}

export async function planPages({ repository, eventName, event, policy, request, pause = pauseDefault }) {
  const trigger = assertTrigger(repository, eventName, event, policy);
  assertPublic(repository, await request(`/repos/${repository}`));
  const selected = await heads(repository, request);
  if (trigger && selected[trigger.branch] !== trigger.sha) return { deploy: false };
  await requireCI(repository, 'main', selected.main, request, pause);
  await requireCI(repository, 'dev', selected.dev, request, pause);
  const pages = await request(`/repos/${repository}/pages`);
  if (pages.build_type !== 'workflow') throw new Error('Configure GitHub Pages Source as GitHub Actions before publication.');
  return { deploy: true, ...selected };
}

export async function verifyArtifact({ repository, policy, request, runId, attempt, name: selectedName,
  main, dev, pause = pauseDefault }) {
  pagesProfile(repository, policy);
  if (![main, dev].every(sha => shaPattern.test(sha ?? ''))) throw new Error('Exact selected main/dev revisions are required.');
  const name = selectedName ?? artifactName(runId, attempt);
  artifactName(runId, attempt); // Validate the current run identifiers before comparing attempts.
  const selected = /^github-pages-([1-9][0-9]*)-([1-9][0-9]*)$/.exec(name);
  if (!selected || selected[1] !== String(runId) || BigInt(selected[2]) > BigInt(attempt)) {
    throw new Error('The Pages artifact must belong to this run and an existing build attempt.');
  }
  for (let index = 0; index < attempts; index++) {
    const data = await request(`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`);
    if (Number.isInteger(data.total_count) && data.total_count > (data.artifacts?.length ?? 0)) {
      throw new Error('An incomplete artifact listing cannot establish unique Pages publication.');
    }
    const matches = data.artifacts?.filter(artifact => artifact.name === name && artifact.expired === false) ?? [];
    if (matches.length > 1) throw new Error('More than one current-run Pages artifact has the expected name.');
    if (matches.length === 1) {
      assertPublic(repository, await request(`/repos/${repository}`));
      const current = await heads(repository, request);
      if (current.main !== main || current.dev !== dev) throw new Error('A source branch changed after Pages selection; wait for its next successful CI.');
      return { name, id: matches[0].id };
    }
    if (index < attempts - 1) await pause();
  }
  throw new Error('The unique unexpired current-run Pages artifact did not appear after six API reads.');
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const policy = readPolicy();
  const repository = process.env.GITHUB_REPOSITORY;
  const automationRef = process.env.SINIVERSE_AUTOMATION_REF;
  if (!shaPattern.test(automationRef ?? '')) throw new Error('An immutable automation SHA is required.');
  const automationDirectory = fileURLToPath(new URL('../', import.meta.url));
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: automationDirectory, encoding: 'utf8' }).trim();
  if (actual !== automationRef) throw new Error('The automation checkout differs from the requested immutable revision.');
  const request = githubClient(process.env.GITHUB_TOKEN);
  if (process.argv[2] === 'plan') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const plan = await planPages({ repository, eventName: process.env.GITHUB_EVENT_NAME, event, policy, request });
    output('deploy', String(plan.deploy));
    output('artifact_name', artifactName(process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT));
    if (plan.deploy) { output('main_sha', plan.main); output('dev_sha', plan.dev); }
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      plan.deploy ? `Legacy Pages sources: main ${plan.main}, dev ${plan.dev}.\n` : 'No Pages publication: this CI event has been superseded.\n');
  } else if (process.argv[2] === 'verify-artifact') {
    const name = process.env.SINIVERSE_PAGES_ARTIFACT_NAME;
    if (!name) throw new Error('The selected build artifact name is required.');
    await verifyArtifact({ repository, policy, request, runId: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT, name,
      main: process.env.SINIVERSE_PAGES_MAIN_SHA, dev: process.env.SINIVERSE_PAGES_DEV_SHA });
  } else throw new Error('Choose plan or verify-artifact.');
}
