import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactName, assertTrigger, githubClient, planPages, verifyArtifact } from './pages.mjs';

const repository = 'sinikebe/finapp';
const main = 'a'.repeat(40), dev = 'b'.repeat(40);
const policy = { apps: { [repository]: { pages: { enabled: true } }, 'sinikebe/Garapp': { pages: { enabled: true } } } };
const publicRepository = { full_name: repository, private: false, visibility: 'public' };
const event = { repository: publicRepository, workflow_run: { name: 'CI', event: 'push', status: 'completed',
  conclusion: 'success', head_repository: { full_name: repository }, head_branch: 'main', head_sha: main } };
const clone = value => structuredClone(value);

function fixture() {
  const calls = [];
  const request = async path => {
    calls.push(path);
    if (path === `/repos/${repository}`) return clone(publicRepository);
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha: main } };
    if (path.endsWith('/git/ref/heads/dev')) return { object: { sha: dev } };
    if (path.includes('/actions/workflows/ci.yml/runs?')) {
      const branch = path.includes('branch=main&') ? 'main' : 'dev';
      return { workflow_runs: [{ event: 'push', status: 'completed', conclusion: 'success',
        head_sha: branch === 'main' ? main : dev, head_branch: branch, head_repository: { full_name: repository } }] };
    }
    if (path.endsWith('/pages')) return { build_type: 'workflow' };
    throw new Error(`Unexpected fixture request: ${path}`);
  };
  return { request, calls };
}

test('Pages authorizes only public application repositories and successful internal CI triggers', () => {
  assert.deepEqual(assertTrigger(repository, 'workflow_run', event, policy), { branch: 'main', sha: main });
  assert.equal(assertTrigger(repository, 'workflow_dispatch', { repository: publicRepository }, policy), null);
  assert.equal(assertTrigger('sinikebe/Garapp', 'workflow_dispatch', {
    repository: { full_name: 'sinikebe/Garapp', private: false, visibility: 'public' },
  }, policy), null);
  for (const change of [
    value => { value.repository.private = true; value.repository.visibility = 'private'; },
    value => { value.workflow_run.head_repository.full_name = 'someone/finapp'; },
    value => { value.workflow_run.event = 'pull_request'; },
    value => { value.workflow_run.conclusion = 'failure'; },
    value => { value.workflow_run.head_branch = 'feature'; },
    value => { value.workflow_run.head_sha = 'invalid'; },
  ]) {
    const value = clone(event); change(value);
    assert.throws(() => assertTrigger(repository, 'workflow_run', value, policy));
  }
  assert.throws(() => assertTrigger(repository, 'pull_request_target', event, policy));
  assert.throws(() => assertTrigger('sinikebe/branchlab', 'workflow_dispatch', event, { apps: { 'sinikebe/branchlab': { pages: { enabled: true } } } }));
  assert.throws(() => assertTrigger(repository, 'workflow_dispatch', event, { apps: {} }));
});

test('selection requires successful push CI for both current heads and ignores an obsolete event', async () => {
  const state = fixture();
  assert.deepEqual(await planPages({ repository, eventName: 'workflow_run', event, policy, request: state.request }), { deploy: true, main, dev });
  assert.equal(state.calls.filter(path => path.includes('/actions/workflows/ci.yml/runs?')).length, 2);
  const stale = clone(event); stale.workflow_run.head_sha = 'c'.repeat(40);
  const superseded = fixture();
  assert.deepEqual(await planPages({ repository, eventName: 'workflow_run', event: stale, policy, request: superseded.request }), { deploy: false });
  assert.equal(superseded.calls.some(path => path.includes('/actions/')), false);
});

test('missing, forked or wrong-head CI is retried with a strict six-read bound', async () => {
  const state = fixture(); let reads = 0, waits = 0;
  const request = async path => {
    if (path.includes('/actions/workflows/')) {
      reads++;
      return { workflow_runs: [{ event: 'push', status: 'completed', conclusion: 'success', head_sha: dev,
        head_branch: 'main', head_repository: { full_name: 'someone/finapp' } }] };
    }
    return state.request(path);
  };
  await assert.rejects(planPages({ repository, eventName: 'workflow_run', event, policy, request,
    pause: async () => { waits++; } }), /No successful push CI/);
  assert.equal(reads, 6); assert.equal(waits, 5);
});

test('artifact verification waits for one exact current-run unexpired artifact, then checks source freshness', async () => {
  const state = fixture(); let reads = 0, waits = 0;
  const name = artifactName('123', '2');
  const request = async path => {
    if (path.includes('/artifacts?')) {
      reads++;
      return { artifacts: [{ name: 'github-pages-122-2', expired: false }, { name, expired: true },
        ...(reads === 6 ? [{ name, expired: false, id: 17 }] : [])] };
    }
    return state.request(path);
  };
  assert.deepEqual(await verifyArtifact({ repository, policy, request, runId: '123', attempt: '2', main, dev,
    pause: async () => { waits++; } }), { name, id: 17 });
  assert.equal(reads, 6); assert.equal(waits, 5);
  assert.ok(state.calls.includes(`/repos/${repository}/git/ref/heads/dev`));
});

test('duplicate, absent, private or stale Pages deployments fail instead of bypassing checks', async () => {
  for (const failure of ['duplicate', 'absent', 'private', 'stale']) {
    const state = fixture(); let reads = 0;
    const name = artifactName('123', '2');
    const request = async path => {
      if (path.includes('/artifacts?')) {
        reads++;
        return { artifacts: failure === 'absent' ? [] : [{ name, expired: false, id: 1 },
          ...(failure === 'duplicate' ? [{ name, expired: false, id: 2 }] : [])] };
      }
      if (failure === 'private' && path === `/repos/${repository}`) return { ...publicRepository, private: true, visibility: 'private' };
      if (failure === 'stale' && path.endsWith('/git/ref/heads/dev')) return { object: { sha: 'c'.repeat(40) } };
      return state.request(path);
    };
    await assert.rejects(verifyArtifact({ repository, policy, request, runId: '123', attempt: '2', main, dev, pause: async () => {} }));
    assert.equal(reads, failure === 'absent' ? 6 : 1);
  }
});

test('a deploy-only retry verifies the original successful build attempt artifact', async () => {
  const state = fixture();
  const name = artifactName('123', '1');
  const request = async path => path.includes('/artifacts?')
    ? { artifacts: [{ name, expired: false, id: 9 }] } : state.request(path);
  assert.deepEqual(await verifyArtifact({ repository, policy, request, runId: '123', attempt: '2',
    name, main, dev }), { name, id: 9 });
});

test('API errors do not reveal the token and artifact names reject untrusted identifiers', async () => {
  const token = 'fixture-secret-never-log';
  const request = githubClient(token, async () => { throw new Error(token); });
  await assert.rejects(request(`/repos/${repository}`), error => !error.message.includes(token));
  assert.throws(() => artifactName('123\nother=value', '1'));
  assert.throws(() => artifactName('123', '0'));
});

test('an incomplete artifact API page is refused instead of assuming uniqueness', async () => {
  const name = artifactName('123', '2');
  await assert.rejects(verifyArtifact({ repository, policy, runId: '123', attempt: '2', main, dev,
    request: async () => ({ total_count: 101, artifacts: [{ name, expired: false, id: 1 }] }) }), /incomplete artifact listing/);
});
