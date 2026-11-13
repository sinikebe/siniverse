import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignVersion, assertVersion, bumpVersion, classifyPullRequest, compareVersions, EPOCH,
  githubVersionClient, resolveVersionForSha, tagName, validateRecord, versionContext } from './version.mjs';

const repository = 'sinikebe/siniverse';
const sha = digit => digit.repeat(40);
const base = sha('a'), head = sha('b'), automationRef = sha('f');
const publicRepository = { full_name: repository, private: false, visibility: 'public', owner: { login: 'sinikebe' }, fork: false };
const context = (overrides = {}) => ({ repository, channel: 'dev', sha: head, automationRef, runId: '42', ...overrides });
const record = (channel, version, target, overrides = {}) => ({ schemaVersion: 1, epoch: EPOCH, repository, channel,
  version, sha: target, bump: version === '0.0.1' ? 'reset' : 'patch', pullRequest: null,
  priorTag: version === '0.0.1' ? null : tagName(channel, '0.0.1'), source: null, automationRef, runId: '41', ...overrides });
const pr = (number, target, overrides = {}) => ({ number, merge_commit_sha: target, merged_at: '2026-11-13T00:00:00Z',
  base: { ref: 'dev', repo: { full_name: repository } }, head: { ref: 'feature', sha: target, repo: { full_name: repository } },
  title: 'fix: a correction', body: '', labels: [], ...overrides });

function fixture({ current = head, seed = [], commits = { [head]: base }, prs = [] } = {}) {
  const refs = new Map(), objects = new Map(), calls = [];
  let nextObject = 1;
  const objectId = () => (nextObject++).toString(16).padStart(40, '0');
  const add = value => {
    const name = tagName(value.channel, value.version), id = objectId();
    objects.set(id, { sha: id, tag: name, object: { type: 'commit', sha: value.sha }, message: JSON.stringify(value) });
    refs.set(name, id);
  };
  seed.forEach(add);
  const state = { current, refs, objects, calls, failCreateRef: false };
  state.request = async (path, options = {}) => {
    calls.push({ path, ...options });
    const prefix = '/repos/' + repository;
    if (options.method === 'POST') {
      if (path === prefix + '/git/tags') {
        const id = objectId(), body = options.body;
        objects.set(id, { sha: id, tag: body.tag, object: { type: body.type, sha: body.object }, message: body.message });
        return { sha: id };
      }
      if (path === prefix + '/git/refs') {
        const name = options.body.ref.slice('refs/tags/'.length);
        if (state.failCreateRef || refs.has(name)) throw new Error('HTTP 422 tag collision');
        refs.set(name, options.body.sha);
        return {};
      }
      throw new Error('Unexpected write ' + path);
    }
    if (path === prefix) return structuredClone(publicRepository);
    if (path.startsWith(prefix + '/git/ref/heads/')) return { object: { sha: state.current } };
    if (path.startsWith(prefix + '/tags?')) {
      const page = Number(new URL('https://api.github.com' + path).searchParams.get('page'));
      return [...refs].map(([name, id]) => ({ name, commit: { sha: objects.get(id).object.sha } })).slice((page - 1) * 100, page * 100);
    }
    if (path.startsWith(prefix + '/pulls?')) {
      const page = Number(new URL('https://api.github.com' + path).searchParams.get('page'));
      return structuredClone(prs.slice((page - 1) * 100, page * 100));
    }
    if (path.startsWith(prefix + '/git/ref/tags/')) {
      const name = path.slice((prefix + '/git/ref/tags/').length);
      return { ref: 'refs/tags/' + name, object: { type: 'tag', sha: refs.get(name) } };
    }
    if (path.startsWith(prefix + '/git/tags/')) return structuredClone(objects.get(path.split('/').at(-1)));
    if (path.startsWith(prefix + '/compare/')) {
      const url = new URL('https://api.github.com' + path), page = Number(url.searchParams.get('page'));
      const [previous, target] = url.pathname.split('/').at(-1).split('...');
      const reachable = start => {
        const result = new Set(), visit = value => {
          if (!value || result.has(value)) return;
          result.add(value);
          const parents = commits[value];
          (Array.isArray(parents) ? parents : parents ? [parents] : []).forEach(visit);
        };
        visit(start); return result;
      };
      const before = reachable(previous), after = reachable(target);
      const range = [...after].filter(value => !before.has(value)).reverse();
      return { status: after.has(previous) ? 'ahead' : 'diverged', behind_by: after.has(previous) ? 0 : 1,
        base_commit: { sha: previous }, merge_base_commit: { sha: after.has(previous) ? previous : null },
        total_commits: range.length, ahead_by: range.length,
        commits: range.slice((page - 1) * 100, page * 100).map(sha => ({ sha })) };
    }
    throw new Error('Unexpected request ' + path);
  };
  state.assigned = () => [...refs].map(([name, id]) => ({ name, ...JSON.parse(objects.get(id).message) }));
  return state;
}

test('strict SemVer increments and precedence have no lexical or numeric overflow ambiguity', () => {
  assert.equal(bumpVersion('0.0.1', 'patch'), '0.0.2');
  assert.equal(bumpVersion('0.9.8', 'minor'), '0.10.0');
  assert.equal(bumpVersion('0.9.8', 'major'), '1.0.0');
  assert.equal(compareVersions('0.10.0', '0.9.99'), 1);
  assert.equal(bumpVersion('0.0.9007199254740992', 'patch'), '0.0.9007199254740993');
  for (const value of ['v0.0.1', '01.0.0', '0.1', '1.0.0\n', '1.2.3-dev', '1.2.3+sha', '1.2.3<script>']) assert.throws(() => assertVersion(value));
});

test('one semver label overrides breaking and feat; otherwise explicit breaking, feat and default patch apply', () => {
  assert.deepEqual(classifyPullRequest({ title: 'feat!: incompatible', labels: [{ name: 'semver:patch' }] }), { level: 'patch', explicit: true });
  assert.deepEqual(classifyPullRequest({ title: 'feat(ui): new screen' }), { level: 'minor', explicit: false });
  assert.deepEqual(classifyPullRequest({ title: 'fix!: migration' }), { level: 'major', explicit: true });
  assert.deepEqual(classifyPullRequest({ body: 'Details\nBREAKING CHANGE: incompatible' }), { level: 'major', explicit: true });
  assert.deepEqual(classifyPullRequest({ title: 'docs: instructions' }), { level: 'patch', explicit: false });
  assert.throws(() => classifyPullRequest({ labels: [{ name: 'semver:major' }, { name: 'semver:patch' }] }), /exactly one/);
  assert.throws(() => classifyPullRequest({ labels: [{ name: 'semver:automatic' }] }), /exactly one/);
});

test('the trusted context rejects private/fork/foreign repositories, PRs, invalid refs and Cloudflare credentials', () => {
  const env = { GITHUB_REPOSITORY: repository, GITHUB_SHA: head, AUTOMATION_REF: automationRef,
    GITHUB_RUN_ID: '42', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/dev' };
  assert.equal(versionContext(env, { repository: publicRepository }).channel, 'dev');
  for (const change of [
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/feature/dev' }, { AUTOMATION_REF: 'main' },
    { CLOUDFLARE_API_TOKEN: 'must-not-enter' }, { CLOUDFLARE_ACCOUNT_ID: 'must-not-enter' },
    { GITHUB_EVENT_NAME: 'workflow_dispatch', REQUESTED_DEPLOY: 'false' },
  ]) assert.throws(() => versionContext({ ...env, ...change }, { repository: publicRepository }));
  for (const change of [{ private: true }, { visibility: 'private' }, { fork: true }, { full_name: 'another/repo' }])
    assert.throws(() => versionContext(env, { repository: { ...publicRepository, ...change } }));
});

test('bootstrap assigns exactly 0.0.1 even for a feature reset, and a rerun reuses its exact SHA without writing', async () => {
  const state = fixture({ prs: [pr(1, head, { title: 'feat: reset versioning' })] });
  const first = await assignVersion(context(), state.request);
  assert.equal(first.version, '0.0.1'); assert.equal(first.bump, 'reset'); assert.equal(first.pullRequest, 1);
  const writes = state.calls.filter(call => call.method === 'POST').length;
  const second = await assignVersion(context({ runId: '43' }), state.request);
  assert.equal(second.version, first.version); assert.equal(second.runId, '42');
  assert.equal(state.calls.filter(call => call.method === 'POST').length, writes);
});

test('a coalesced run replays every exact merged PR through paginated lists and patches only the direct tip', async () => {
  const c = sha('c'), d = sha('d'), e = sha('e');
  const filler = Array.from({ length: 100 }, (_, index) => ({ number: index + 100, merged_at: null }));
  const state = fixture({ current: e, seed: [record('dev', '0.0.1', base)],
    commits: { [e]: d, [d]: c, [c]: head, [head]: base },
    prs: [...filler, pr(2, head), pr(3, d, { title: 'feat: another screen' }),
      pr(4, c, { base: { ref: 'main', repo: { full_name: repository } } }), pr(80, base), pr(81, base)] });
  const result = await assignVersion(context({ sha: e }), state.request);
  assert.equal(result.version, '0.1.1');
  assert.deepEqual(state.assigned().map(value => [value.sha, value.version]),
    [[base, '0.0.1'], [head, '0.0.2'], [d, '0.1.0'], [e, '0.1.1']]);
  assert(state.calls.some(call => call.path.includes('state=closed&base=dev&per_page=100&page=2')));
  assert(!state.calls.some(call => call.path.includes('/commits/') && call.path.includes('/pulls')));
  assert.equal((await assignVersion(context({ sha: e }), state.request)).version, '0.1.1');
  assert.equal(state.assigned().length, 4);
});

test('stale queued events never assign old SHAs, and rewritten history fails closed', async () => {
  const state = fixture({ current: sha('c') });
  assert.deepEqual(await assignVersion(context(), state.request), { current: false });
  assert.equal(state.calls.filter(call => call.method === 'POST').length, 0);
  const rewritten = fixture({ seed: [record('dev', '0.0.1', sha('d'))] });
  await assert.rejects(() => assignVersion(context(), rewritten.request), /rewritten history/);
  assert.equal(rewritten.calls.filter(call => call.method === 'POST').length, 0);
});

test('fast-forwarding dev to a main promotion accepts its prior version through the merge second parent', async () => {
  const mainBase = sha('c'), dev = sha('d'), merge = sha('e');
  const state = fixture({ current: merge, seed: [record('dev', '0.1.0', dev), record('main', '0.1.0', merge)],
    commits: { [merge]: [mainBase, dev], [dev]: base, [mainBase]: base },
    prs: [pr(9, merge, { base: { ref: 'main', repo: { full_name: repository } } })] });
  const result = await assignVersion(context({ sha: merge }), state.request);
  assert.equal(result.version, '0.1.1'); assert.equal(result.pullRequest, null);
  assert.equal(result.priorTag, tagName('dev', '0.1.0'));
});

test('a comparison longer than one API page is complete and does not bump each direct commit', async () => {
  const commits = {}, targets = Array.from({ length: 102 }, (_, index) => (index + 100).toString(16).padStart(40, '0'));
  targets.forEach((target, index) => { commits[target] = index ? targets[index - 1] : base; });
  const target = targets.at(-1), state = fixture({ current: target, seed: [record('dev', '0.0.1', base)], commits });
  assert.equal((await assignVersion(context({ sha: target }), state.request)).version, '0.0.2');
  assert.equal(state.assigned().length, 2);
  assert(state.calls.some(call => call.path.includes('/compare/') && call.path.endsWith('page=2')));
});

test('dev promotion reuses a higher exact dev version without a second bump; a main hotfix still advances', async () => {
  for (const [mainVersion, devVersion, expected, bump] of [['0.0.2', '0.1.0', '0.1.0', 'promotion'], ['0.2.0', '0.1.0', '0.2.1', 'patch']]) {
    const dev = sha('d');
    const state = fixture({ seed: [record('main', mainVersion, base), record('dev', devVersion, dev)],
      prs: [pr(7, head, { base: { ref: 'main', repo: { full_name: repository } }, head: { ref: 'dev', sha: dev, repo: { full_name: repository } }, title: 'chore: promote dev' })] });
    const result = await assignVersion(context({ channel: 'main' }), state.request);
    assert.equal(result.version, expected); assert.equal(result.bump, bump); assert.equal(result.source.sha, dev);
  }
});

test('an explicit promotion override or breaking marker takes max(dev, bumped main)', async () => {
  for (const [labels, title, devVersion, expected] of [
    [[{ name: 'semver:major' }], 'chore: promote', '0.2.0', '1.0.0'],
    [[{ name: 'semver:patch' }], 'feat!: promote', '0.3.0', '0.3.0'],
    [[], 'feat!: promote', '0.3.0', '1.0.0'],
  ]) {
    const dev = sha('d');
    const state = fixture({ seed: [record('main', '0.1.0', base), record('dev', devVersion, dev)],
      prs: [pr(7, head, { base: { ref: 'main', repo: { full_name: repository } }, head: { ref: 'dev', sha: dev, repo: { full_name: repository } }, title, labels })] });
    assert.equal((await assignVersion(context({ channel: 'main' }), state.request)).version, expected);
  }
});

test('untagged dev promotion fails immediately without writes or waiting, and is retryable once dev assigns its exact SHA', async () => {
  const dev = sha('d'), promotion = pr(7, head, { base: { ref: 'main', repo: { full_name: repository } },
    head: { ref: 'dev', sha: dev, repo: { full_name: repository } } });
  const state = fixture({ seed: [record('main', '0.0.1', base)], prs: [promotion] });
  await assert.rejects(() => assignVersion(context({ channel: 'main' }), state.request), /No exact dev version tag/);
  assert.equal(state.calls.filter(call => call.method === 'POST').length, 0);
  const ready = fixture({ seed: [record('main', '0.0.1', base), record('dev', '0.0.2', dev)], prs: [promotion] });
  assert.equal((await assignVersion(context({ channel: 'main' }), ready.request)).version, '0.0.2');
});

test('tag ref collisions fail without force, deletion, branch writes or silently adopting a conflicting tag', async () => {
  const state = fixture(); state.failCreateRef = true;
  await assert.rejects(() => assignVersion(context(), state.request), /collision/);
  assert.equal(state.refs.size, 0);
  assert(state.calls.filter(call => call.method).every(call => call.method === 'POST'
    && (call.path.endsWith('/git/tags') || call.body.ref.startsWith('refs/tags/siniverse-version/'))));
});

test('exact SHA resolution refuses missing/ambiguous, lightweight, moved or malformed provenance', async () => {
  const state = fixture({ seed: [record('dev', '0.0.1', head)] });
  assert.equal((await resolveVersionForSha(repository, 'dev', head, state.request)).version, '0.0.1');
  await assert.rejects(() => resolveVersionForSha(repository, 'main', head, state.request), /No exact/);
  const duplicate = fixture({ seed: [record('dev', '0.0.1', head), record('dev', '0.0.2', head)] });
  await assert.rejects(() => resolveVersionForSha(repository, 'dev', head, duplicate.request), /More than one/);
  const id = [...state.refs.values()][0]; state.objects.get(id).message = JSON.stringify({ ...record('dev', '0.0.1', head), sha: base });
  await assert.rejects(() => resolveVersionForSha(repository, 'dev', head, state.request), /metadata/);
  const lightweight = async path => path.includes('/git/ref/tags/') ? { object: { type: 'commit', sha: head } } : state.request(path);
  await assert.rejects(() => resolveVersionForSha(repository, 'dev', head, lightweight), /annotated/);
  assert.throws(() => validateRecord({ ...record('dev', '0.0.2', head), priorTag: tagName('dev', '0.1.0') }, tagName('dev', '0.0.2'), repository, head), /advance/);
});

test('GitHub version API authentication cannot escape the repository, mutate branches, follow redirects or leak its token', async () => {
  const calls = [];
  const client = githubVersionClient(repository, 'fake-secret', async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => ({}) };
  });
  await client('/repos/' + repository);
  assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers.authorization, 'Bearer fake-secret');
  await assert.rejects(() => client('/repos/attacker/repo'), /exact repository/);
  await assert.rejects(() => client('/repos/' + repository + '/git/refs', { method: 'POST', body: { ref: 'refs/heads/main' } }), /Only version/);
  await assert.rejects(() => client('/repos/' + repository, { method: 'DELETE' }), /only read/);
  await assert.rejects(() => githubVersionClient(repository, 'never-print', async () => { throw new Error('never-print'); })('/repos/' + repository),
    error => !error.message.includes('never-print'));
});

test('the write job runs pinned central code only, queues by repository, and never receives application or Cloudflare secrets', () => {
  const workflow = readFileSync(new URL('../.github/workflows/reusable-version.yml', import.meta.url), 'utf8');
  assert.match(workflow, /github\.event\.repository\.private == false/);
  assert.match(workflow, /contents: write/); assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /group: siniverse-version-\$\{\{ github.repository \}\}/);
  assert.match(workflow, /queue: max/); assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /repository: sinikebe\/siniverse/);
  assert.doesNotMatch(workflow, /CLOUDFLARE|npm (?:ci|run)|path: app|secrets:/);
});
