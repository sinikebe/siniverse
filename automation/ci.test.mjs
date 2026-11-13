import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  artifactDigest, assertCheckouts, createContext, credentialState, getProfile, githubHead, loadPolicy, preparePreviewHeaders,
  manifestFor, probe, publicationPlan, readJsonc, renderCaller, validateApiConfig,
  validateSiteConfig, verifyCallerPin, verifyManifest, wranglerArguments
} from './ci.mjs';

const policy = loadPolicy();
const sha = 'a'.repeat(40);
const automationRef = 'b'.repeat(40);
const previous = 'c'.repeat(40);
const env = (overrides = {}) => ({
  GITHUB_REPOSITORY: 'sinikebe/siniverse', GITHUB_SHA: sha,
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push',
  GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1', AUTOMATION_REF: automationRef,
  REQUESTED_DEPLOY: 'false', ...overrides
});
const event = (overrides = {}) => ({
  repository: { full_name: 'sinikebe/siniverse', private: false },
  before: previous, ...overrides
});
const context = (overrides = {}) => createContext(env(overrides), event());
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: new Headers({ 'x-robots-tag': 'noindex, nofollow' }), json: async () => value });

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'siniverse-core-test-'));
  t.after(() => {
    const target = resolve(directory);
    assert(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith('siniverse-core-test-'));
    rmSync(target, { recursive: true, force: true });
  });
  return directory;
}

test('the registry contains exactly the four authorized repositories and short existing URLs', () => {
  assert.equal(Object.keys(policy.apps).length, 4);
  assert.equal(getProfile('sinikebe/Garapp').previewUrl, 'https://dev.garapp.siniverse.cc/');
  assert.equal(getProfile('sinikebe/branchlab').chromium, true);
  assert.equal(getProfile('sinikebe/finapp').pages.enabled, true);
  assert.throws(() => getProfile('someone/finapp'), /not authorized/);
  assert.throws(() => getProfile('sinikebe/garapp'), /not authorized/);
});

test('push main and dev select exact targets without confusing the real source branch', () => {
  const main = context();
  assert.equal(main.environment, 'production');
  assert.equal(main.baseSha, previous);
  assert.equal(main.publishEligible, true);
  const dev = context({ GITHUB_REF: 'refs/heads/dev' });
  assert.equal(dev.environment, 'preview');
  assert.equal(dev.branch, 'dev');
  assert.equal(dev.sourceBranch, 'dev');
});

test('PR validation uses its packaging target and base without publication or secrets', () => {
  const pr = createContext(env({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/7/merge', REQUESTED_DEPLOY: 'true' }),
    event({ action: 'synchronize', pull_request: { base: { ref: 'main', sha: previous }, head: { ref: 'feature/new' } } }));
  assert.equal(pr.branch, 'main');
  assert.equal(pr.sourceBranch, 'feature/new');
  assert.equal(pr.environment, 'test');
  assert.equal(pr.publishEligible, false);
  assert.throws(() => publicationPlan({ ...pr, publishEligible: true }, getProfile(pr.repository)), /forbidden/);
});

test('manual publication is opt-in and limited to exact main/dev', () => {
  assert.equal(context({ GITHUB_EVENT_NAME: 'workflow_dispatch' }).publishEligible, false);
  assert.equal(context({ GITHUB_EVENT_NAME: 'workflow_dispatch', REQUESTED_DEPLOY: 'true' }).publishEligible, true);
  assert.throws(() => context({ GITHUB_EVENT_NAME: 'workflow_dispatch', REQUESTED_DEPLOY: 'true', GITHUB_REF: 'refs/heads/feature/main' }), /exact main\/dev/);
  const feature = context({ GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/feature/main' });
  assert.equal(feature.publishEligible, false);
  assert.equal(feature.branch, 'dev');
  assert.equal(feature.environment, 'test');
});

test('private repositories, forks with a different identity, closed PRs and malformed hashes fail closed', () => {
  assert.throws(() => createContext(env(), event({ repository: { full_name: 'sinikebe/siniverse', private: true } })), /public/);
  assert.throws(() => createContext(env(), event({ repository: { full_name: 'attacker/siniverse', private: false } })), /exact public/);
  assert.throws(() => createContext(env({ GITHUB_EVENT_NAME: 'pull_request' }), event({ action: 'closed' })), /Closed/);
  assert.throws(() => createContext(env({ AUTOMATION_REF: 'main' }), event()), /immutable SHA/);
  assert.throws(() => createContext(env({ GITHUB_SHA: 'HEAD' }), event()), /commit SHA/);
});

test('initial branches and manual checks use the resolved baseline, never the zero push SHA', () => {
  const ctx = createContext(env(), event({ before: '0'.repeat(40) }), () => previous);
  assert.equal(ctx.baseSha, previous);
  assert.throws(() => createContext(env(), event({ before: '' }), () => ''), /comparison base/);
});

test('the caller is byte-identical for all apps and pins every central workflow to one SHA', () => {
  const text = renderCaller(automationRef);
  verifyCallerPin(text, automationRef);
  assert(!text.includes('__AUTOMATION_REF__'));
  assert.match(text, /name: CI/);
  assert.match(text, /types: \[opened, synchronize, reopened, closed\]/);
  assert.match(text, /contents: write/);
  assert.throws(() => verifyCallerPin(text.replace('automation_ref: ' + automationRef, 'automation_ref: ' + sha), automationRef), /same automation/);
  assert.throws(() => verifyCallerPin(text + '\nsecrets: inherit\n', automationRef), /explicitly/);
  assert.throws(() => verifyCallerPin(text.replace('reusable-cleanup.yml@' + automationRef, 'reusable-cleanup.yml@' + sha), automationRef), /reusable-cleanup/);
  assert.throws(() => renderCaller('main'), /immutable/);
});

test('JSONC parsing keeps URL/comment characters and commas inside strings intact', (t) => {
  const file = join(temporary(t), 'config.jsonc');
  writeFileSync(file, '{ /* comment */ "url":"https://a.test/x,}", // line\n "escaped":"quote \\" // preserved", "items":[1,2,], }');
  assert.deepEqual(readJsonc(file), { url: 'https://a.test/x,}', escaped: 'quote " // preserved', items: [1, 2] });
});

test('site configuration cannot re-enable workers.dev or overwrite dashboard routes', (t) => {
  const app = temporary(t);
  const profile = getProfile('sinikebe/siniverse');
  const config = { name: profile.worker, workers_dev: false, preview_urls: false, assets: { directory: './dist' }, previews: {} };
  validateSiteConfig(config, app, profile);
  assert.throws(() => validateSiteConfig({ ...config, routes: [] }, app, profile), /dashboard/);
  assert.throws(() => validateSiteConfig({ ...config, preview_urls: true }, app, profile), /disabled/);
  assert.throws(() => validateSiteConfig({ ...config, assets: { directory: './public' } }, app, profile), /dist/);
  assert.throws(() => validateSiteConfig(config, app, { ...profile, previewUrl: profile.productionUrl }), /production origin/);
  assert.throws(() => validateSiteConfig({ ...config, main: './worker.js' }, app, profile), /asset-only/);
  assert.throws(() => validateSiteConfig({ ...config, d1_databases: [] }, app, profile), /asset-only/);
  assert.throws(() => validateSiteConfig({ ...config, previews: { vars: { remote: true } } }, app, profile), /empty local/);
});

test('the API configuration references only the existing D1, with dashboard domains preserved', () => {
  const api = getProfile('sinikebe/siniverse').api;
  const config = { name: api.worker, workers_dev: false, preview_urls: false, d1_databases: [{ binding: api.binding, database_id: api.databaseId }] };
  validateApiConfig(config, api);
  assert.throws(() => validateApiConfig({ ...config, d1_databases: [{ binding: 'DB' }] }, api), /existing D1/);
  assert.throws(() => validateApiConfig({ ...config, routes: [] }, api), /dashboard/);
});

test('the manifest seals unchanged asset bytes and detects later tampering', (t) => {
  const dist = temporary(t);
  writeFileSync(join(dist, 'index.html'), '<!doctype html><h1>Existing site</h1>');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets/a.css'), 'body { color: black; }');
  const digest = artifactDigest(dist);
  const ctx = context();
  const manifest = manifestFor(ctx, '1.0.0', digest, new Date('2026-11-13T12:00:00.000Z'));
  writeFileSync(join(dist, 'deployment.json'), JSON.stringify(manifest));
  assert.equal(artifactDigest(dist), digest);
  verifyManifest(manifest, ctx, '1.0.0', digest);
  assert.throws(() => verifyManifest({ ...manifest, automationRef: sha }, ctx, '1.0.0', digest), /sealed dist/);
  writeFileSync(join(dist, 'assets/a.css'), 'changed');
  assert.throws(() => verifyManifest(manifest, ctx, '1.0.0', artifactDigest(dist)), /sealed dist/);
});

test('unsafe directories and local secret files cannot enter the sealed dist', (t) => {
  const dist = temporary(t);
  writeFileSync(join(dist, 'index.html'), 'site');
  writeFileSync(join(dist, '.dev.vars'), 'LOCAL_PLACEHOLDER=value');
  assert.throws(() => artifactDigest(dist), /Unsafe file/);
});

test('Preview headers preserve application rules and never modify production headers', (t) => {
  const dist = temporary(t);
  const path = join(dist, '_headers');
  const application = '/*\n  Content-Security-Policy: default-src self\n';
  writeFileSync(path, application);
  preparePreviewHeaders(context(), dist);
  assert.equal(readFileSync(path, 'utf8'), application);
  preparePreviewHeaders(context({ GITHUB_REF: 'refs/heads/dev' }), dist);
  assert(readFileSync(path, 'utf8').startsWith(application));
  assert.match(readFileSync(path, 'utf8'), /X-Robots-Tag: noindex, nofollow/);
});

test('dist itself cannot be a symbolic link or Windows junction', (t) => {
  const root = temporary(t);
  const target = join(root, 'actual');
  mkdirSync(target);
  writeFileSync(join(target, 'index.html'), 'site');
  const dist = join(root, 'dist');
  try { symlinkSync(target, dist, process.platform === 'win32' ? 'junction' : 'dir'); } catch (error) {
    if (error.code === 'EPERM') { t.skip('This Windows sandbox cannot create directory links.'); return; }
    throw error;
  }
  assert.throws(() => artifactDigest(dist), /real directory/);
  assert.throws(() => preparePreviewHeaders(context({ GITHUB_REF: 'refs/heads/dev' }), dist), /real directory/);
});

test('dist cannot be a regular file', (t) => {
  const path = join(temporary(t), 'dist');
  writeFileSync(path, 'not a directory');
  assert.throws(() => artifactDigest(path), /real directory/);
});

test('symbolic links cannot escape the artifact', (t) => {
  const root = temporary(t);
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), 'site');
  writeFileSync(join(root, 'outside'), 'outside');
  try { symlinkSync(join(root, 'outside'), join(root, 'dist/link')); } catch (error) {
    if (error.code === 'EPERM') { t.skip('This Windows host cannot create file symlinks.'); return; }
    throw error;
  }
  assert.throws(() => artifactDigest(join(root, 'dist')), /Symbolic links/);
});

test('main publishes the existing site/API while dev can only publish the stable site Preview', () => {
  const profile = getProfile('sinikebe/siniverse');
  assert.deepEqual(publicationPlan(context(), profile).map((entry) => entry.worker), ['siniverse', 'siniverse-api']);
  const dev = publicationPlan(context({ GITHUB_REF: 'refs/heads/dev' }), profile);
  assert.equal(dev.length, 1);
  assert.equal(dev[0].preview, true);
  assert.equal(dev[0].url, 'https://dev.siniverse.cc/');
  assert.throws(() => publicationPlan({ ...context(), ref: 'refs/heads/main-extra' }, profile), /exact/);
});

test('missing secrets skip pushes, reject explicit manual requests, and wrong accounts fail before publishing', () => {
  assert.equal(credentialState(context(), {}), false);
  const manual = context({ GITHUB_EVENT_NAME: 'workflow_dispatch', REQUESTED_DEPLOY: 'true' });
  assert.throws(() => credentialState(manual, {}), /both Cloudflare/);
  assert.throws(() => credentialState(context(), { CLOUDFLARE_API_TOKEN: 'placeholder', CLOUDFLARE_ACCOUNT_ID: 'wrong' }), /account/);
  assert.equal(credentialState(context(), { CLOUDFLARE_API_TOKEN: 'placeholder', CLOUDFLARE_ACCOUNT_ID: policy.accountId }), true);
});

test('Wrangler uses the same config/dist without creating environments, databases or migrations', () => {
  const profile = getProfile('sinikebe/siniverse');
  const production = wranglerArguments(publicationPlan(context(), profile)[1]);
  assert(production.includes('--keep-vars') && production.includes('--no-x-provision'));
  assert(production.includes('api/wrangler.jsonc'));
  const preview = wranglerArguments(publicationPlan(context({ GITHUB_REF: 'refs/heads/dev' }), profile)[0]);
  assert.deepEqual(preview.slice(0, 9), ['preview', '--config', 'wrangler.jsonc', '--worker-name', 'siniverse', '--name', 'dev', '--json', '--ignore-base-config']);
  assert(!preview.includes('--no-x-provision'));
  assert(!preview.includes('--env'));
  assert(!production.includes('migrations'));
});

test('a build cannot mutate tracked app sources or pinned central tools unnoticed', (t) => {
  const root = temporary(t);
  const app = join(root, 'app');
  const tools = join(root, 'tools');
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  const initialize = (cwd) => {
    mkdirSync(cwd);
    git(cwd, ['init', '-q']);
    git(cwd, ['config', 'core.autocrlf', 'false']);
  };
  const commit = (cwd) => {
    git(cwd, ['add', '.']);
    git(cwd, ['-c', 'user.name=AutomationTest', '-c', 'user.email=test@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture']);
    return git(cwd, ['rev-parse', 'HEAD']);
  };
  initialize(tools);
  writeFileSync(join(tools, 'marker'), 'trusted tools');
  const pinned = commit(tools);
  initialize(app);
  mkdirSync(join(app, '.github/workflows'), { recursive: true });
  writeFileSync(join(app, '.github/workflows/ci.yml'), renderCaller(pinned));
  writeFileSync(join(app, 'source.txt'), 'tested source');
  const tested = commit(app);
  const identity = { sha: tested, automationRef: pinned };
  assertCheckouts(identity, { app, tools });
  writeFileSync(join(app, 'source.txt'), 'modified after checks');
  assert.throws(() => assertCheckouts(identity, { app, tools }), /Tracked application sources/);
  writeFileSync(join(app, 'source.txt'), 'tested source');
  writeFileSync(join(tools, 'marker'), 'modified tools');
  assert.throws(() => assertCheckouts(identity, { app, tools }), /central tools were modified/);
});

test('publication rereads repository visibility and exact branch head using only the GitHub token', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return response(url.endsWith('/siniverse') ?
      { full_name: 'sinikebe/siniverse', owner: { login: 'sinikebe' }, private: false, fork: false } : { object: { sha } });
  };
  await githubHead(context(), 'readonly-placeholder', fetcher);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.redirect, 'error');
  await assert.rejects(() => githubHead(context(), '', fetcher), /read-only/);
  await assert.rejects(() => githubHead(context(), 'placeholder', async () => response({ private: true })), /nonpublic/);
  await assert.rejects(() => githubHead(context(), 'placeholder', async (url) => response(url.endsWith('/siniverse') ?
    { full_name: 'sinikebe/siniverse', owner: { login: 'sinikebe' }, private: false } : { object: { sha: previous } })), /remote branch head/);
});

test('HTTPS probe requires the exact deployed manifest and handles bounded propagation', async () => {
  const expected = manifestFor(context(), '1.0.0', 'digest');
  const target = { url: 'https://dev.siniverse.cc/', preview: true };
  let attempts = 0;
  await probe(target, expected, async (url, options) => {
    assert.match(url, /^https:\/\/dev\.siniverse\.cc\/deployment\.json\?deployment=/);
    assert.equal(options.redirect, 'error');
    attempts++;
    return response(attempts < 3 ? { ...expected, sha: previous } : expected);
  }, async () => {});
  assert.equal(attempts, 3);
  await assert.rejects(() => probe(target, expected, async () => response({}, 404), async () => {}), /probe failed/);
  await assert.rejects(() => probe({ url: 'http://example.test/' }, expected), /HTTPS/);
  await probe({ url: 'https://api.siniverse.cc/health', api: true }, expected, async () => response({ ok: true }), async () => {});
});

test('the reusable core has one runner job, public guard, no persistent cache/artifacts, and secrets only on publication', () => {
  const workflow = readFileSync(new URL('../.github/workflows/reusable-ci.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/^  app:/gm) || []).length, 1);
  assert.match(workflow, /if: github\.event\.repository\.private == false/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /package-manager-cache: false/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /actions\/(?:upload-artifact|download-artifact|cache)@/);
  const beforePublish = workflow.slice(0, workflow.indexOf('- name: Publish the sealed dist'));
  assert.doesNotMatch(beforePublish, /secrets\.CLOUDFLARE_/);
  for (const repository of Object.keys(policy.apps)) assert(workflow.includes('"' + repository + '"'));
});
