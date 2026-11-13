import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHA = /^(?!0{40}$)[a-f0-9]{40}$/i;
const skipped = (reason) => ({ status: 'skipped', reason });

function validBranch(branch) {
  return (
    typeof branch === 'string' &&
    branch.length > 0 &&
    branch.length <= 255 &&
    !branch.startsWith('-') &&
    !branch.endsWith('.') &&
    !branch.includes('..') &&
    !branch.includes('@{') &&
    !/[\x00-\x20\x7f~^:?*[\\]/.test(branch) &&
    branch.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.lock'))
  );
}

function publicRepository(repo, expected) {
  return repo?.full_name === expected && repo.private === false && repo.visibility === 'public';
}

export function cleanupTarget({ eventName, event, repository, apps }) {
  if (!Object.hasOwn(apps ?? {}, repository ?? '')) return skipped('Repository is not registered.');
  if (eventName !== 'pull_request' || event?.action !== 'closed')
    return skipped('Only a closed pull request can request cleanup.');
  const pr = event.pull_request;
  if (pr?.merged !== true || pr.state !== 'closed') return skipped('Pull request was not merged.');
  if (!publicRepository(event.repository, repository))
    return skipped('Repository visibility is not confirmed public.');
  if (pr.head?.repo?.full_name !== repository || pr.base?.repo?.full_name !== repository)
    return skipped('Fork branches are preserved.');
  const branch = pr.head.ref;
  if (!validBranch(branch) || !SHA.test(pr.head.sha ?? ''))
    return skipped('Source branch or revision is invalid.');
  if (!Number.isSafeInteger(pr.number) || pr.number <= 0)
    return skipped('Pull request number is invalid.');
  if (!validBranch(event.repository.default_branch))
    return skipped('Default branch could not be established.');
  if (['main', 'dev', event.repository.default_branch].includes(branch))
    return skipped('Permanent or default branches are preserved.');
  return { repository, branch, sha: pr.head.sha, number: pr.number };
}

function checkPr(pr, target) {
  if (
    pr?.number !== target.number ||
    pr.state !== 'closed' ||
    pr.merged !== true ||
    pr.head?.repo?.full_name !== target.repository ||
    pr.base?.repo?.full_name !== target.repository ||
    pr.head?.ref !== target.branch ||
    pr.head?.sha !== target.sha
  )
    return skipped('Fresh pull request metadata no longer matches the merged source.');
}

async function snapshot(target, api) {
  const prefix = `/repos/${target.repository}`;
  const branchPath = encodeURIComponent(target.branch);
  const repo = await api(prefix);
  if (!publicRepository(repo, target.repository)) return skipped('Repository is no longer public.');
  if (!validBranch(repo.default_branch) || ['main', 'dev', repo.default_branch].includes(target.branch))
    return skipped('Permanent or default branches are preserved.');
  const invalidPr = checkPr(await api(`${prefix}/pulls/${target.number}`), target);
  if (invalidPr) return invalidPr;
  const branch = await api(`${prefix}/branches/${branchPath}`);
  if (!branch) return skipped('Source branch is already absent.');
  if (branch.name !== target.branch || branch.protected !== false)
    return skipped('Protected branches, or an unknown protection state, are preserved.');
  if (branch.commit?.sha !== target.sha) return skipped('Source branch advanced; new work is preserved.');
  const ref = await api(`${prefix}/git/ref/heads/${branchPath}`);
  if (!ref) return skipped('Source ref is already absent.');
  if (ref.ref !== `refs/heads/${target.branch}` || ref.object?.type !== 'commit' || ref.object.sha !== target.sha)
    return skipped('Source ref changed; new work is preserved.');
  return { status: 'ready' };
}

export function deleteWithLease({ repository, branch, sha, token, cwd, execute = spawnSync }) {
  // The server compares the expected old SHA atomically. A REST DELETE cannot do this.
  const nullFile = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const result = execute(
    'git',
    [
      'push',
      '--porcelain',
      `--force-with-lease=refs/heads/${branch}:${sha}`,
      '--',
      `https://github.com/${repository}.git`,
      `:refs/heads/${branch}`,
    ],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: nullFile,
        GIT_CONFIG_COUNT: '4',
        GIT_CONFIG_KEY_0: 'credential.helper',
        GIT_CONFIG_VALUE_0: '',
        GIT_CONFIG_KEY_1: 'core.hooksPath',
        GIT_CONFIG_VALUE_1: nullFile,
        GIT_CONFIG_KEY_2: 'http.https://github.com/.extraheader',
        GIT_CONFIG_VALUE_2: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
        GIT_CONFIG_KEY_3: 'http.followRedirects',
        GIT_CONFIG_VALUE_3: 'false',
        GIT_TRACE: '0',
        GIT_TRACE_SETUP: '0',
        GIT_TRACE_PACKET: '0',
        GIT_TRACE_CURL: '0',
        GIT_CURL_VERBOSE: '0',
        GIT_TRACE2: '0',
        GIT_TRACE2_EVENT: '0',
        GIT_TRACE2_PERF: '0',
      },
    },
  );
  // Never forward Git's captured output, which can contain authentication diagnostics.
  return result.status === 0 && !result.error;
}

export async function cleanupMergedBranch({ eventName, event, repository, apps, api, remove, token, cwd }) {
  const target = cleanupTarget({ eventName, event, repository, apps });
  if (target.status === 'skipped') return target;
  if (!token) return skipped('GITHUB_TOKEN is unavailable; no deletion attempted.');
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = await snapshot(target, api);
    if (state.status !== 'ready') return state;
  }
  const deleted = await remove({ ...target, token, cwd });
  if (deleted) return { status: 'deleted', reason: `Deleted ${target.branch} at merged revision ${target.sha}.` };
  const latest = await snapshot(target, api);
  if (latest.status !== 'ready') return latest;
  return { status: 'failed', reason: 'Conditional deletion was refused; no unguarded fallback was attempted.' };
}

export function githubApi(token, fetcher = fetch) {
  return async (path) => {
    if (!token) throw new Error('GITHUB_TOKEN is required to revalidate branch cleanup.');
    const response = await fetcher(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'siniverse-branch-cleanup',
        'Cache-Control': 'no-cache',
      },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub metadata request failed (HTTP ${response.status}); no deletion authorized.`);
    return response.json();
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { apps } = JSON.parse(readFileSync(new URL('./apps.json', import.meta.url), 'utf8'));
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const result = await cleanupMergedBranch({
      eventName: process.env.GITHUB_EVENT_NAME,
      repository: process.env.GITHUB_REPOSITORY,
      event,
      apps,
      api: githubApi(process.env.GITHUB_TOKEN),
      remove: deleteWithLease,
      token: process.env.GITHUB_TOKEN,
      cwd: fileURLToPath(new URL('../', import.meta.url)),
    });
    const message = `Branch cleanup: ${result.status}. ${result.reason}`;
    process.stdout.write(`${message}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
    if (result.status === 'failed') process.exitCode = 1;
  } catch (error) {
    // Fetch errors are controlled messages; Git output and token values are never printed.
    process.stderr.write(`Branch cleanup stopped safely: ${error.message}\n`);
    process.exitCode = 1;
  }
}
