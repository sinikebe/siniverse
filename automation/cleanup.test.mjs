import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupMergedBranch, cleanupTarget, deleteWithLease, githubApi } from './cleanup.mjs';

const repository = 'sinikebe/branchlab';
const sha = '17e22fc10185363db297bcc96b6dedab7db67559';
const newer = '3ccebe8e4d85c402324840373af31fc83dc54aba';
const branch = 'feature/central-ci';
const apps = { [repository]: { id: 'branchlab' } };

function fixture() {
  const repo = { full_name: repository, private: false, visibility: 'public', default_branch: 'main' };
  const pr = {
    number: 9,
    state: 'closed',
    merged: true,
    head: { repo: { full_name: repository }, ref: branch, sha },
    base: { repo: { full_name: repository } },
  };
  const state = {
    repo: structuredClone(repo),
    pr: structuredClone(pr),
    branch: { name: branch, protected: false, commit: { sha } },
    ref: { ref: `refs/heads/${branch}`, object: { type: 'commit', sha } },
    reads: [],
    removals: [],
  };
  const event = { action: 'closed', repository: repo, pull_request: pr };
  const api = async (path) => {
    state.reads.push(path);
    if (path.endsWith('/pulls/9')) return structuredClone(state.pr);
    if (path.includes('/branches/')) return structuredClone(state.branch);
    if (path.includes('/git/ref/heads/')) return structuredClone(state.ref);
    assert.equal(path, `/repos/${repository}`);
    return structuredClone(state.repo);
  };
  const options = {
    eventName: 'pull_request', event, repository, apps, api, token: 'test-token', cwd: '/tools',
    remove: async (target) => { state.removals.push(target); return true; },
  };
  return { state, options };
}

test('deletes only the registered public merged source after two fresh API snapshots', async () => {
  const { state, options } = fixture();
  const result = await cleanupMergedBranch(options);
  assert.equal(result.status, 'deleted');
  assert.equal(state.reads.length, 8);
  assert.equal(state.removals.length, 1);
  assert.equal(state.removals[0].sha, sha);
  assert.equal(state.removals[0].branch, branch);
});

test('skips forks, unmerged PRs, foreign/private repos and invalid events without any API or deletion', async () => {
  for (const change of [
    (o) => { o.event.pull_request.head.repo.full_name = 'contributor/branchlab'; },
    (o) => { o.event.pull_request.merged = false; },
    (o) => { o.repository = 'someone/branchlab'; },
    (o) => { o.event.repository.private = true; },
    (o) => { delete o.event.repository.visibility; },
    (o) => { o.eventName = 'push'; },
    (o) => { o.event.action = 'synchronize'; },
    (o) => { o.event.pull_request.head.sha = 'main'; },
    (o) => { o.event.pull_request.head.ref = 'feature/unsafe\nbranch'; },
  ]) {
    const { state, options } = fixture();
    change(options);
    assert.equal((await cleanupMergedBranch(options)).status, 'skipped');
    assert.equal(state.reads.length, 0);
    assert.equal(state.removals.length, 0);
  }
});

test('main, dev and a different default branch are always preserved', () => {
  for (const name of ['main', 'dev', 'stable']) {
    const { options } = fixture();
    options.event.repository.default_branch = 'stable';
    options.event.pull_request.head.ref = name;
    assert.match(cleanupTarget(options).reason, /Permanent or default/);
  }
});

test('skips protected, missing, moved and freshly forked or unmerged sources', async () => {
  for (const change of [
    (s) => { s.branch.protected = true; },
    (s) => { delete s.branch.protected; },
    (s) => { s.branch = null; },
    (s) => { s.ref = null; },
    (s) => { s.branch.commit.sha = newer; },
    (s) => { s.ref.object.sha = newer; },
    (s) => { s.pr.head.repo.full_name = 'contributor/branchlab'; },
    (s) => { s.pr.merged = false; },
    (s) => { s.repo.default_branch = branch; },
  ]) {
    const { state, options } = fixture();
    change(state);
    assert.equal((await cleanupMergedBranch(options)).status, 'skipped');
    assert.equal(state.removals.length, 0);
  }
});

test('a branch that moves between snapshots is preserved', async () => {
  const { state, options } = fixture();
  const read = options.api;
  options.api = async (path) => {
    if (state.reads.length === 4) {
      state.branch.commit.sha = newer;
      state.ref.object.sha = newer;
    }
    return read(path);
  };
  assert.match((await cleanupMergedBranch(options)).reason, /new work is preserved/);
  assert.equal(state.removals.length, 0);
});

test('the atomic lease rejects work pushed after the final API read without any fallback', async () => {
  const { state, options } = fixture();
  let attempts = 0;
  options.remove = async (target) => {
    attempts++;
    // Simulate a push arriving after the final GET, before receive-pack checks the old SHA.
    state.branch.commit.sha = newer;
    state.ref.object.sha = newer;
    return state.ref.object.sha === target.sha;
  };
  const result = await cleanupMergedBranch(options);
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /new work is preserved/);
  assert.equal(attempts, 1);
  assert.equal(state.ref.object.sha, newer);
});

test('Git receives an exact lease and canonical remote; credentials stay outside arguments and logs', () => {
  const token = 'not-a-real-token';
  let executions = 0;
  assert.equal(deleteWithLease({ repository, branch, sha, token, cwd: '/tools', execute: (cmd, args, options) => {
    executions++;
    assert.equal(cmd, 'git');
    assert.deepEqual(args, ['push', '--porcelain', `--force-with-lease=refs/heads/${branch}:${sha}`, '--',
      `https://github.com/${repository}.git`, `:refs/heads/${branch}`]);
    assert.ok(!args.some((arg) => arg.includes(token)));
    assert.equal(options.cwd, '/tools');
    assert.equal(options.env.GIT_CONFIG_KEY_2, 'http.https://github.com/.extraheader');
    assert.equal(options.env.GIT_CONFIG_VALUE_2,
      `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`);
    assert.equal(options.env.GIT_CONFIG_KEY_3, 'http.followRedirects');
    assert.equal(options.env.GIT_CONFIG_VALUE_3, 'false');
    for (const key of ['GIT_TRACE', 'GIT_TRACE_CURL', 'GIT_TRACE_PACKET', 'GIT_TRACE2', 'GIT_CURL_VERBOSE'])
      assert.equal(options.env[key], '0');
    assert.equal(options.env.GIT_CONFIG_VALUE_0, '');
    return { status: 0, stdout: token, stderr: token };
  } }), true);
  assert.equal(executions, 1);
});

test('missing token or unavailable metadata never falls back to deletion', async () => {
  const { state, options } = fixture();
  assert.equal((await cleanupMergedBranch({ ...options, token: '' })).status, 'skipped');
  assert.equal(state.reads.length, 0);
  await assert.rejects(cleanupMergedBranch({ ...options, api: async () => { throw new Error('HTTP 403'); } }), /HTTP 403/);
  assert.equal(state.removals.length, 0);
  assert.equal((await cleanupMergedBranch({ ...options, remove: async () => false })).status, 'failed');
});

test('metadata requests authenticate only to GitHub, reject redirects and fail closed', async () => {
  const api = githubApi('test-token', async (url, options) => {
    assert.equal(url, `https://api.github.com/repos/${repository}`);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    return { status: 404, ok: false };
  });
  assert.equal(await api(`/repos/${repository}`), null);
  await assert.rejects(githubApi('test-token', async () => ({ status: 403, ok: false }))(`/repos/${repository}`), /no deletion authorized/);
  await assert.rejects(githubApi('')(`/repos/${repository}`), /GITHUB_TOKEN is required/);
});
