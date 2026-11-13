/** Immutable CI versions. This module never checks out or executes application code. */
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EPOCH = 'siniverse-reset-0.0.1-v1';
export const PREFIX = 'siniverse-version/';
const SHA = /^[a-f0-9]{40}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const channels = new Set(['main', 'dev']);
const here = dirname(fileURLToPath(import.meta.url));
const invariant = (condition, message) => assert.ok(condition, message);
const policy = () => JSON.parse(readFileSync(resolve(here, 'apps.json'), 'utf8'));

export function assertVersion(version) {
  invariant(typeof version === 'string' && SEMVER.test(version), 'A plain major.minor.patch version is required.');
  return version;
}

export function compareVersions(a, b) {
  const left = assertVersion(a).split('.').map(BigInt), right = assertVersion(b).split('.').map(BigInt);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  return 0;
}

export function bumpVersion(version, level) {
  const parts = assertVersion(version).split('.').map(BigInt);
  const index = ['major', 'minor', 'patch'].indexOf(level);
  invariant(index >= 0, 'Unknown version increment.');
  parts[index]++;
  for (let next = index + 1; next < 3; next++) parts[next] = 0n;
  return parts.join('.');
}

export function tagName(channel, version) {
  invariant(channels.has(channel), 'Only main/dev version channels are allowed.');
  return PREFIX + channel + '/v' + assertVersion(version);
}

export function parseTag(name) {
  const match = /^siniverse-version\/(main|dev)\/v(.+)$/.exec(name || '');
  invariant(match, 'Invalid Siniverse version tag.');
  return { channel: match[1], version: assertVersion(match[2]) };
}

export function classifyPullRequest(pr) {
  if (!pr) return { level: 'patch', explicit: false };
  const labels = (pr.labels || []).map(label => typeof label === 'string' ? label : label.name)
    .filter(name => typeof name === 'string' && name.startsWith('semver:'));
  invariant(labels.length <= 1 && labels.every(name => /^semver:(major|minor|patch)$/.test(name)),
    'Use exactly one valid semver:major/minor/patch override, or none.');
  if (labels.length) return { level: labels[0].slice('semver:'.length), explicit: true };
  const title = pr.title || '', body = pr.body || '';
  if (/^[a-z][a-z0-9-]*(?:\([^\r\n)]*\))?!:/i.test(title)
      || /(?:^|\n)BREAKING[ -]CHANGE:\s*\S/i.test(body)) return { level: 'major', explicit: true };
  return { level: /^feat(?:\([^\r\n)]*\))?:/i.test(title) ? 'minor' : 'patch', explicit: false };
}

export function assertPublicRepository(repository, value) {
  invariant(Object.hasOwn(policy().apps, repository), 'Repository is not authorized for version automation.');
  invariant(value?.full_name === repository && value?.private === false && value?.visibility === 'public'
    && value?.owner?.login === 'sinikebe' && value?.fork === false, 'Version automation requires the exact public upstream repository.');
}

export function versionContext(env, event) {
  assertPublicRepository(env.GITHUB_REPOSITORY, event.repository);
  invariant(SHA.test(env.GITHUB_SHA || '') && SHA.test(env.AUTOMATION_REF || ''), 'Exact application/automation SHAs are required.');
  invariant(['refs/heads/main', 'refs/heads/dev'].includes(env.GITHUB_REF), 'Version assignment requires an exact main/dev ref.');
  invariant(env.GITHUB_EVENT_NAME === 'push' || (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.REQUESTED_DEPLOY === 'true'),
    'PRs and validation-only requests must not assign versions.');
  invariant(/^[1-9]\d*$/.test(env.GITHUB_RUN_ID || ''), 'A GitHub run ID is required.');
  invariant(!env.CLOUDFLARE_API_TOKEN && !env.CLOUDFLARE_ACCOUNT_ID, 'Cloudflare credentials must never enter the version job.');
  return { repository: env.GITHUB_REPOSITORY, channel: env.GITHUB_REF.slice('refs/heads/'.length),
    sha: env.GITHUB_SHA, automationRef: env.AUTOMATION_REF, runId: env.GITHUB_RUN_ID };
}

export function githubVersionClient(repository, token, fetcher = fetch) {
  invariant(Object.hasOwn(policy().apps, repository) && token, 'An authorized repository and GitHub token are required.');
  const prefix = '/repos/' + repository;
  return async (path, { method = 'GET', body } = {}) => {
    invariant(path === prefix || path.startsWith(prefix + '/'), 'Version API requests must stay in the exact repository.');
    invariant(method === 'GET' || (method === 'POST' && [prefix + '/git/tags', prefix + '/git/refs'].includes(path)),
      'Version automation may only read repository metadata or create immutable tags.');
    if (method === 'POST' && path.endsWith('/git/refs')) {
      invariant(typeof body?.ref === 'string' && body.ref.startsWith('refs/tags/' + PREFIX), 'Only version tag refs may be created.');
      parseTag(body.ref.slice('refs/tags/'.length));
    }
    let response;
    try {
      response = await fetcher('https://api.github.com' + path, { method, redirect: 'error', cache: 'no-store',
        headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    } catch { throw new Error('Version GitHub API request failed.'); }
    invariant(response.ok, 'Version GitHub API request failed with HTTP ' + response.status + '; no existing tag is changed.');
    return response.json();
  };
}

async function paginate(path, request) {
  const values = [];
  for (let page = 1; page <= 1000; page++) {
    const items = await request(path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
    invariant(Array.isArray(items) && items.length <= 100, 'An exact paginated GitHub list is required.');
    values.push(...items);
    if (items.length < 100) return values;
  }
  throw new Error('Version metadata pagination exceeded its safety bound.');
}

export async function versionTags(repository, request) {
  const values = await paginate('/repos/' + repository + '/tags', request);
  const tags = values.filter(value => value.name?.startsWith(PREFIX));
  for (const tag of tags) { parseTag(tag.name); invariant(SHA.test(tag.commit?.sha || ''), 'Version tag must target an exact commit.'); }
  invariant(new Set(tags.map(tag => tag.name)).size === tags.length, 'Duplicate version tag names.');
  return tags;
}

export function validateRecord(record, name, repository, sha) {
  const parsed = parseTag(name);
  invariant(record?.schemaVersion === 1 && record.epoch === EPOCH && record.repository === repository
    && record.channel === parsed.channel && record.version === parsed.version && record.sha === sha && SHA.test(sha || ''),
  'Version tag metadata does not match its immutable name, repository, channel and commit.');
  invariant(SHA.test(record.automationRef || '') && /^[1-9]\d*$/.test(record.runId || ''), 'Version tag provenance is incomplete.');
  invariant(['reset', 'major', 'minor', 'patch', 'promotion'].includes(record.bump), 'Invalid recorded version increment.');
  invariant(record.pullRequest === null || (Number.isSafeInteger(record.pullRequest) && record.pullRequest > 0), 'Invalid recorded pull request.');
  if (record.priorTag === null) invariant(record.version === '0.0.1' && record.bump === 'reset', 'Only the reset may start a version channel.');
  else {
    const previous = parseTag(record.priorTag);
    invariant(previous.channel === record.channel && compareVersions(previous.version, record.version) < 0 && record.bump !== 'reset',
      'Version history must advance within the same channel.');
  }
  if (record.source !== null) {
    const source = parseTag(record.source?.tag);
    invariant(record.channel === 'main' && source.channel === 'dev' && source.version === record.source.version
      && SHA.test(record.source.sha || ''), 'Invalid exact dev promotion provenance.');
  }
  return record;
}

export async function readVersionRecord(repository, tag, request) {
  const ref = await request('/repos/' + repository + '/git/ref/tags/' + tag.name);
  invariant(ref.ref === 'refs/tags/' + tag.name && ref.object?.type === 'tag' && SHA.test(ref.object.sha || ''),
    'Version refs must be annotated tags, never branches or lightweight tags.');
  const object = await request('/repos/' + repository + '/git/tags/' + ref.object.sha);
  invariant(object.sha === ref.object.sha && object.tag === tag.name && object.object?.type === 'commit'
    && object.object.sha === tag.commit.sha, 'An existing version tag moved or targets an unexpected object.');
  let record;
  try { record = JSON.parse(object.message); } catch { throw new Error('Version tag annotation must contain its JSON provenance.'); }
  return validateRecord(record, tag.name, repository, tag.commit.sha);
}

export async function resolveVersionForSha(repository, channel, sha, request, catalog) {
  invariant(channels.has(channel) && SHA.test(sha || ''), 'An exact channel and source SHA are required to resolve a version.');
  const tags = catalog ?? await versionTags(repository, request);
  const matches = tags.filter(tag => parseTag(tag.name).channel === channel && tag.commit.sha === sha);
  invariant(matches.length === 1, matches.length ? 'More than one version is assigned to the same channel/SHA.'
    : 'No exact ' + channel + ' version tag exists for ' + sha + '; rerun after that channel assigns its version.');
  return { name: matches[0].name, ...await readVersionRecord(repository, matches[0], request) };
}

async function assertCurrent(context, request) {
  assertPublicRepository(context.repository, await request('/repos/' + context.repository));
  const ref = await request('/repos/' + context.repository + '/git/ref/heads/' + context.channel);
  invariant(SHA.test(ref.object?.sha || ''), 'The current channel head is unavailable.');
  return ref.object.sha === context.sha;
}

async function ancestorRange(repository, head, previous, request) {
  const pending = [], visited = new Set();
  let total;
  for (let page = 1; page <= 1000; page++) {
    const comparison = await request('/repos/' + repository + '/compare/' + previous + '...' + head + '?per_page=100&page=' + page);
    invariant(comparison.status === 'ahead' && comparison.behind_by === 0 && comparison.merge_base_commit?.sha === previous
      && comparison.base_commit?.sha === previous, 'Version history must descend from its previous anchor; rewritten history is refused.');
    invariant(Number.isSafeInteger(comparison.total_commits) && comparison.total_commits > 0
      && comparison.total_commits === comparison.ahead_by && (total === undefined || comparison.total_commits === total),
    'The complete version comparison must remain stable across pages.');
    total = comparison.total_commits;
    invariant(Array.isArray(comparison.commits) && comparison.commits.length > 0 && comparison.commits.length <= 100,
      'An exact paginated commit range is required.');
    for (const commit of comparison.commits) {
      invariant(SHA.test(commit.sha || '') && !visited.has(commit.sha) && commit.sha !== previous, 'Invalid or duplicate commit in the version range.');
      visited.add(commit.sha); pending.push(commit.sha);
    }
    if (pending.length === total) {
      invariant(visited.has(head), 'The version range does not contain its source tip.');
      return pending;
    }
    invariant(pending.length < total && comparison.commits.length === 100, 'The version comparison omitted commits.');
  }
  throw new Error('Version comparison pagination exceeded its safety bound.');
}

export function selectVersion(previous, pr, dev) {
  const classification = classifyPullRequest(pr);
  const bumped = bumpVersion(previous, classification.level);
  if (!dev) return { version: bumped, bump: classification.level, source: null };
  const useDev = compareVersions(dev.version, previous) > 0 && !classification.explicit;
  return { version: useDev ? dev.version : compareVersions(dev.version, bumped) > 0 ? dev.version : bumped,
    bump: useDev ? 'promotion' : classification.level,
    source: { tag: dev.name, sha: dev.sha, version: dev.version } };
}

async function createVersionTag(context, record, request) {
  invariant(await assertCurrent(context, request), 'The branch advanced during version assignment; use its next natural CI run.');
  const name = tagName(record.channel, record.version);
  validateRecord(record, name, context.repository, record.sha);
  const tag = await request('/repos/' + context.repository + '/git/tags', { method: 'POST', body: {
    tag: name, message: JSON.stringify(record), object: record.sha, type: 'commit',
    tagger: { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }
  } });
  invariant(SHA.test(tag.sha || ''), 'GitHub did not create an annotated tag object.');
  // Ref creation is atomic. Collisions fail; there is no PATCH, force, DELETE or fallback.
  await request('/repos/' + context.repository + '/git/refs', { method: 'POST', body: { ref: 'refs/tags/' + name, sha: tag.sha } });
  return { name, ...record };
}

export async function assignVersion(context, request) {
  invariant(channels.has(context.channel) && SHA.test(context.sha || ''), 'Invalid version assignment ref.');
  if (!await assertCurrent(context, request)) return { current: false };
  const catalog = await versionTags(context.repository, request);
  const exact = catalog.filter(tag => parseTag(tag.name).channel === context.channel && tag.commit.sha === context.sha);
  if (exact.length) return { current: true, ...await resolveVersionForSha(context.repository, context.channel, context.sha, request, catalog) };
  const channelTags = catalog.filter(tag => parseTag(tag.name).channel === context.channel)
    .sort((a, b) => compareVersions(parseTag(b.name).version, parseTag(a.name).version));
  let previous = channelTags.length ? { name: channelTags[0].name, ...await readVersionRecord(context.repository, channelTags[0], request) } : null;
  const pending = previous ? await ancestorRange(context.repository, context.sha, previous.sha, request) : [context.sha];
  const pendingSet = new Set(pending);
  const pullRequests = (await paginate('/repos/' + context.repository + '/pulls?state=closed&base=' + context.channel, request))
    .filter(pr => pr.merged_at && pr.base?.ref === context.channel && pr.base?.repo?.full_name === context.repository && pendingSet.has(pr.merge_commit_sha));
  const byCommit = new Map();
  for (const pr of pullRequests) {
    invariant(!byCommit.has(pr.merge_commit_sha), 'Ambiguous merged pull requests for a source SHA.');
    byCommit.set(pr.merge_commit_sha, pr);
  }
  // Replay every merged PR, then one direct-push tip, never each intermediate direct commit.
  const points = [...pending.filter(sha => byCommit.has(sha) && sha !== context.sha), context.sha];
  for (const sha of points) {
    const pr = byCommit.get(sha) || null;
    let selection = { version: '0.0.1', bump: 'reset', source: null };
    if (previous) {
      let dev = null;
      if (context.channel === 'main' && pr?.head?.ref === 'dev' && pr.head.repo?.full_name === context.repository) {
        dev = await resolveVersionForSha(context.repository, 'dev', pr.head.sha, request, catalog);
      }
      selection = selectVersion(previous.version, pr, dev);
    } else classifyPullRequest(pr);
    const record = { schemaVersion: 1, epoch: EPOCH, repository: context.repository, channel: context.channel,
      sha, version: selection.version, bump: selection.bump, pullRequest: pr?.number ?? null,
      priorTag: previous?.name ?? null, source: selection.source, automationRef: context.automationRef, runId: context.runId };
    previous = await createVersionTag(context, record, request);
    catalog.push({ name: previous.name, commit: { sha } });
  }
  invariant(previous?.sha === context.sha, 'No version was assigned to the current source SHA.');
  return { current: await assertCurrent(context, request), ...previous };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const context = versionContext(process.env, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(here, '..'), encoding: 'utf8' }).trim();
  invariant(actual === context.automationRef, 'The central version implementation must match automation_ref.');
  const result = await assignVersion(context, githubVersionClient(context.repository, process.env.GITHUB_TOKEN));
  for (const [key, value] of Object.entries({ current: String(result.current), version: result.version || '', tag: result.name || '', sha: context.sha })) {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, key + '=' + value + '\n');
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    result.current ? 'Version v' + result.version + ': ' + result.name + ' → ' + context.sha + '.\n'
      : 'Version assignment skipped: this event is no longer the branch head.\n');
}
