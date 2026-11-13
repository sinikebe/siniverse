import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertVersion, githubVersionClient, resolveVersionForSha, tagName, versionTags } from './version.mjs';

const SHA = /^[a-f0-9]{40}$/;
const here = dirname(fileURLToPath(import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const invariant = (value, message) => assert.ok(value, message);

export function loadPolicy() {
  return readJson(join(here, 'apps.json'));
}

export function getProfile(repository, policy = loadPolicy()) {
  invariant(Object.hasOwn(policy.apps, repository), 'Repository is not authorized for Siniverse automation.');
  return policy.apps[repository];
}

export function readJsonc(path) {
  const quotedOrComment = /"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g;
  const text = readFileSync(path, 'utf8').replace(quotedOrComment, (token) => token.startsWith('"') ? token : ' ');
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|,\s*([}\]])/g, (token, closer) => closer || token));
}

export function createContext(env, event, baseResolver = () => '') {
  const policy = loadPolicy();
  const repository = env.GITHUB_REPOSITORY;
  getProfile(repository, policy);
  invariant(event.repository?.private === false && event.repository?.full_name === repository, 'Only the exact public repository may use this pipeline.');
  invariant(SHA.test(env.GITHUB_SHA || ''), 'A full application commit SHA is required.');
  invariant(SHA.test(env.AUTOMATION_REF || ''), 'automation_ref must be a full immutable SHA.');
  invariant(/^\d+$/.test(env.GITHUB_RUN_ID || ''), 'A GitHub run ID is required.');
  invariant(/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT || ''), 'A GitHub run attempt is required.');
  const isPr = env.GITHUB_EVENT_NAME === 'pull_request';
  invariant(!isPr || event.action !== 'closed', 'Closed pull requests do not allocate the CI job.');
  const ref = env.GITHUB_REF || '';
  const sourceBranch = isPr ? event.pull_request?.head?.ref : ref.replace(/^refs\/heads\//, '');
  const target = isPr ? event.pull_request?.base?.ref : ref.replace(/^refs\/heads\//, '');
  const branch = target === 'main' ? 'main' : 'dev';
  const environment = isPr || !['refs/heads/main', 'refs/heads/dev'].includes(ref) ? 'test' :
    branch === 'main' ? 'production' : 'preview';
  invariant(sourceBranch && !/[\0\r\n]/.test(sourceBranch), 'Invalid source branch.');
  const manual = env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.REQUESTED_DEPLOY === 'true';
  invariant(!manual || ['refs/heads/main', 'refs/heads/dev'].includes(ref), 'Manual publication requires an exact main/dev ref.');
  const publishEligible = ['refs/heads/main', 'refs/heads/dev'].includes(ref) &&
    (env.GITHUB_EVENT_NAME === 'push' || manual);
  const suppliedBase = isPr ? event.pull_request?.base?.sha : event.before;
  const baseSha = SHA.test(suppliedBase || '') && !/^0+$/.test(suppliedBase) ? suppliedBase : baseResolver(branch);
  invariant(SHA.test(baseSha || ''), 'A full comparison base SHA is required.');
  return {
    repository, sha: env.GITHUB_SHA, ref, branch, sourceBranch, environment, baseSha,
    eventName: env.GITHUB_EVENT_NAME, manual, publishEligible,
    automationRef: env.AUTOMATION_REF, runId: env.GITHUB_RUN_ID,
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT), toolchain: policy.toolchain
  };
}

export function verifyCallerPin(text, automationRef) {
  const versions = [...text.matchAll(/^\s*uses:\s*sinikebe\/siniverse\/\.github\/workflows\/reusable-version\.yml@([a-f0-9]{40})\s*$/gm)];
  const calls = [...text.matchAll(/^\s*uses:\s*sinikebe\/siniverse\/\.github\/workflows\/reusable-ci\.yml@([a-f0-9]{40})\s*$/gm)];
  const cleanups = [...text.matchAll(/^\s*uses:\s*sinikebe\/siniverse\/\.github\/workflows\/reusable-cleanup\.yml@([a-f0-9]{40})\s*$/gm)];
  const refs = [...text.matchAll(/^\s*automation_ref:\s*['"]?([a-f0-9]{40})['"]?\s*$/gm)];
  invariant(calls.length === 1 && calls[0][1] === automationRef, 'The caller must pin reusable-ci to automation_ref.');
  invariant(versions.length === 1 && versions[0][1] === automationRef, 'The caller must pin reusable-version to the same automation_ref.');
  invariant(cleanups.length === 1 && cleanups[0][1] === automationRef, 'The caller must pin reusable-cleanup to the same automation_ref.');
  invariant(refs.length >= 1 && refs.every((match) => match[1] === automationRef), 'All caller references must use the same automation SHA.');
  invariant(!/secrets:\s*inherit\b/.test(text), 'Secrets must be passed explicitly.');
}

export function renderCaller(automationRef) {
  invariant(SHA.test(automationRef || ''), 'A full immutable automation SHA is required.');
  return readFileSync(join(here, 'caller.yml'), 'utf8').replaceAll('__AUTOMATION_REF__', automationRef);
}

export function renderPagesCaller(automationRef) {
  invariant(SHA.test(automationRef || ''), 'A full immutable automation SHA is required.');
  return readFileSync(join(here, 'pages-caller.yml'), 'utf8').replaceAll('__AUTOMATION_SHA__', automationRef);
}

export function validateSiteConfig(config, appDir, profile) {
  invariant(config.name === profile.worker, 'Unexpected Worker name.');
  invariant(config.workers_dev === false && config.preview_urls === false, 'workers.dev and Preview URLs must stay disabled.');
  invariant(!Object.hasOwn(config, 'route') && !Object.hasOwn(config, 'routes'), 'Domains are managed in the Cloudflare dashboard.');
  invariant(!config.env, 'Named Worker environments must not retarget the existing Worker.');
  const allowed = new Set(['$schema', 'name', 'account_id', 'compatibility_date', 'compatibility_flags',
    'workers_dev', 'preview_urls', 'keep_vars', 'assets', 'previews', 'send_metrics', 'observability', 'limits']);
  invariant(Object.keys(config).every((key) => allowed.has(key)), 'Sites must be asset-only without main/site or resource bindings.');
  assert.deepEqual(config.previews, {}, 'Static sites require an empty local previews block.');
  if (config.account_id) invariant(config.account_id === loadPolicy().accountId, 'Unexpected configured Cloudflare account.');
  invariant(!config.assets?.binding, 'The static asset-only site does not need a resource binding.');
  invariant(resolve(appDir, config.assets?.directory || '') === resolve(appDir, 'dist'), 'Only dist/ may be published.');
  const production = new URL(profile.productionUrl);
  const preview = new URL(profile.previewUrl);
  invariant(production.protocol === 'https:' && preview.protocol === 'https:', 'HTTPS is mandatory.');
  invariant(production.origin !== preview.origin, 'Preview must not use the production origin.');
}

export function validateApiConfig(config, api) {
  invariant(config.name === api.worker, 'Unexpected API Worker name.');
  invariant(config.workers_dev === false && config.preview_urls === false, 'The API workers.dev settings must stay disabled.');
  invariant(!config.route && !config.routes && !config.env, 'API domains are dashboard-managed.');
  assert.deepEqual(config.d1_databases, [{ binding: api.binding, database_id: api.databaseId }], 'The existing D1 binding must not change.');
}

export function assertDistRoot(dist) {
  const root = lstatSync(dist);
  invariant(root.isDirectory() && !root.isSymbolicLink(), 'dist/ itself must be a real directory.');
}

export function preparePreviewHeaders(context, dist) {
  assertDistRoot(dist);
  if (context.branch !== 'dev') return;
  const path = join(dist, '_headers');
  if (existsSync(path)) invariant(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'Unsafe Preview headers file.');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileSync(path, existing + '\n# Siniverse Preview indexing policy\n/*\n  X-Robots-Tag: noindex, nofollow\n');
}

export function artifactDigest(dist) {
  assertDistRoot(dist);
  const entries = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const local = relative(dist, path).split(sep).join('/');
      const info = lstatSync(path);
      invariant(!info.isSymbolicLink(), 'Symbolic links are forbidden in dist/.');
      invariant(!['.git', 'node_modules'].includes(name) && !/^\.env(?:\.|$)|^\.dev\.vars/.test(name), 'Unsafe file in dist/.');
      if (info.isDirectory()) walk(path);
      else {
        invariant(info.isFile(), 'Only regular files may be published.');
        if (local === 'deployment.json') continue;
        entries.push([local, createHash('sha256').update(readFileSync(path)).digest('hex')]);
      }
    }
  };
  invariant(existsSync(join(dist, 'index.html')), 'dist/index.html is required.');
  walk(dist);
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

export function manifestFor(context, appVersion, digest, now = new Date()) {
  return {
    schemaVersion: 1, app: getProfile(context.repository).id,
    repository: context.repository, sha: context.sha, ref: context.ref,
    branch: context.branch, environment: context.environment,
    appVersion, versionTag: context.versionTag || null, automationRef: context.automationRef, runId: context.runId,
    runAttempt: context.runAttempt, builtAt: now.toISOString(),
    toolchain: context.toolchain, artifactSha256: digest
  };
}

export function verifyManifest(manifest, context, appVersion, digest) {
  invariant(typeof manifest.builtAt === 'string' && !Number.isNaN(Date.parse(manifest.builtAt)), 'Invalid build timestamp.');
  assert.deepEqual(manifest, manifestFor(context, appVersion, digest, new Date(manifest.builtAt)), 'The sealed dist does not match this run.');
}

export function publicationPlan(context, profile) {
  invariant(context.publishEligible && context.eventName !== 'pull_request', 'Publication is forbidden for this event.');
  invariant(context.ref === 'refs/heads/' + context.branch, 'Publication requires the exact main/dev ref.');
  if (context.branch === 'dev') {
    return [{ worker: profile.worker, config: 'wrangler.jsonc', preview: true, url: profile.previewUrl }];
  }
  const plan = [{ worker: profile.worker, config: 'wrangler.jsonc', preview: false, url: profile.productionUrl }];
  if (profile.api) plan.push({ ...profile.api, preview: false, url: profile.api.healthUrl, api: true });
  return plan;
}

export function credentialState(context, env, policy = loadPolicy()) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    invariant(!context.manual, 'Manual publication requires both Cloudflare secrets.');
    return false;
  }
  invariant(env.CLOUDFLARE_ACCOUNT_ID === policy.accountId, 'The Cloudflare account does not match the existing Workers.');
  return true;
}

export function wranglerArguments(target, dryRun = false, outdir = '') {
  const args = target.preview && !dryRun ?
    ['preview', '--config', target.config, '--worker-name', target.worker, '--name', 'dev', '--json', '--ignore-base-config'] :
    ['deploy', '--config', target.config, '--name', target.worker, '--no-x-provision', '--keep-vars'];
  if (dryRun) args.push('--dry-run', '--outdir', outdir);
  return args;
}

function run(command, args, { cwd, quiet = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd, env, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32' && command.endsWith('.cmd')
  });
  if (!quiet) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  invariant(!result.error && result.status === 0, 'Command failed: ' + command + ' ' + args.join(' ') +
    (quiet ? '\n' + (result.stderr || '') : ''));
  return (result.stdout || '').trim();
}

function paths(env) {
  const app = resolve(env.APP_DIR || 'app');
  return {
    app, tools: resolve(here, '..'), dist: join(app, 'dist'),
    state: resolve(env.CONTEXT_FILE || join(env.RUNNER_TEMP || app, 'siniverse-context.json'))
  };
}

export function assertCheckouts(context, p) {
  const git = (cwd, args) => run('git', args, { cwd, quiet: true });
  invariant(git(p.app, ['rev-parse', 'HEAD']) === context.sha, 'Application checkout SHA mismatch.');
  invariant(!git(p.app, ['status', '--porcelain', '--untracked-files=no']), 'Tracked application sources were modified after checkout.');
  invariant(git(p.tools, ['rev-parse', 'HEAD']) === context.automationRef, 'Central tools checkout SHA mismatch.');
  invariant(!git(p.tools, ['status', '--porcelain', '--untracked-files=no']), 'Pinned central tools were modified.');
  verifyCallerPin(readFileSync(join(p.app, '.github/workflows/ci.yml'), 'utf8'), context.automationRef);
}

function assertToolchain(p) {
  const policy = loadPolicy();
  const pkg = readJson(join(p.app, 'package.json'));
  invariant(readFileSync(join(p.app, '.node-version'), 'utf8').trim() === policy.toolchain.node, 'Node pin mismatch.');
  invariant(pkg.packageManager === 'npm@' + policy.toolchain.npm, 'npm pin mismatch.');
  invariant(pkg.devDependencies?.wrangler === policy.toolchain.wrangler, 'Wrangler must be pinned exactly.');
  invariant(readJson(join(p.app, 'node_modules/wrangler/package.json')).version === policy.toolchain.wrangler, 'Installed Wrangler mismatch.');
  invariant(process.versions.node === policy.toolchain.node, 'The runner must use the pinned Node version.');
  invariant(run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { quiet: true }) === policy.toolchain.npm, 'Installed npm mismatch.');
}

function validateConfigs(context, p) {
  const profile = getProfile(context.repository);
  validateSiteConfig(readJsonc(join(p.app, 'wrangler.jsonc')), p.app, profile);
  if (profile.api) validateApiConfig(readJsonc(join(p.app, profile.api.config)), profile.api);
}

function writeState(p, state) {
  writeFileSync(p.state, JSON.stringify(state, null, 2) + '\n');
}

function readState(p) {
  return readJson(p.state);
}

export async function buildVersion(context, fallback, env, request) {
  assertVersion(fallback);
  if (context.publishEligible) {
    assertVersion(env.SINIVERSE_VERSION);
    invariant(env.SINIVERSE_VERSION_TAG === tagName(context.branch, env.SINIVERSE_VERSION), 'Publication requires its exact version tag.');
  }
  if (context.environment !== 'test' && request) {
    const catalog = await versionTags(context.repository, request);
    const exists = catalog.some(tag => tag.name.startsWith('siniverse-version/' + context.branch + '/') && tag.commit.sha === context.sha);
    if (exists || context.publishEligible) {
      const release = await resolveVersionForSha(context.repository, context.branch, context.sha, request, catalog);
      if (env.SINIVERSE_VERSION) invariant(release.version === env.SINIVERSE_VERSION, 'Assigned version differs from its immutable source tag.');
      if (env.SINIVERSE_VERSION_TAG) invariant(release.name === env.SINIVERSE_VERSION_TAG, 'Assigned version tag differs from its immutable source tag.');
      return { appVersion: release.version, versionTag: release.name };
    }
  }
  invariant(!context.publishEligible, 'An exact immutable version must be verified before publication.');
  return { appVersion: assertVersion(env.SINIVERSE_VERSION || fallback), versionTag: null };
}

export async function githubHead(context, token, fetcher = fetch) {
  invariant(token, 'A read-only GitHub token is required to revalidate publication.');
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const endpoint = 'https://api.github.com/repos/' + context.repository;
  const metadata = await fetcher(endpoint, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
  invariant(metadata.ok, 'Unable to verify the repository identity.');
  const repository = await metadata.json();
  invariant(repository.full_name === context.repository && repository.owner?.login === 'sinikebe' && repository.private === false && !repository.fork, 'Unexpected or nonpublic repository identity.');
  const response = await fetcher(endpoint + '/git/ref/heads/' + context.branch, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
  invariant(response.ok, 'Unable to read the current remote branch head.');
  invariant((await response.json()).object?.sha === context.sha, 'Publication refused: this SHA is no longer the remote branch head.');
}

export async function probe(target, expected, fetcher = fetch, pause = (ms) => new Promise((done) => setTimeout(done, ms))) {
  const url = new URL(target.api ? target.url : 'deployment.json', target.url);
  invariant(url.protocol === 'https:', 'Only HTTPS probes are permitted.');
  url.searchParams.set('deployment', expected.sha);
  let lastError;
  for (const delay of [0, 2000, 4000, 8000, 16000]) {
    if (delay) await pause(delay);
    try {
      const response = await fetcher(url.href, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      invariant(response.ok, 'HTTPS probe returned HTTP ' + response.status);
      if (target.preview) invariant(/\bnoindex\b/i.test(response.headers?.get('x-robots-tag') || ''), 'Preview indexing protection is missing.');
      const value = await response.json();
      if (target.api) invariant(value.ok === true, 'The API health probe did not return ok=true.');
      else assert.deepEqual(value, expected, 'The published deployment marker does not match the sealed dist.');
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error('HTTPS probe failed for ' + url.origin + url.pathname + ': ' + lastError.message);
}

export async function main(command, env = process.env) {
  if (command === 'caller') {
    process.stdout.write(renderCaller(process.argv[3]));
    return;
  }
  if (command === 'pages-caller') {
    process.stdout.write(renderPagesCaller(process.argv[3]));
    return;
  }
  const p = paths(env);
  if (command === 'context') {
    const event = readJson(env.GITHUB_EVENT_PATH);
    const context = createContext(env, event, (branch) => {
      if (branch === 'dev') {
        try { return run('git', ['merge-base', env.GITHUB_SHA, 'origin/main'], { cwd: p.app, quiet: true }); } catch { /* Initial repository: use the parent below. */ }
      }
      try { return run('git', ['rev-parse', env.GITHUB_SHA + '^'], { cwd: p.app, quiet: true }); } catch { return env.GITHUB_SHA; }
    });
    Object.assign(context, await buildVersion(context, readJson(join(p.app, 'package.json')).version, env,
      context.environment !== 'test' ? githubVersionClient(context.repository, env.GH_TOKEN) : null));
    assertCheckouts(context, p);
    assertToolchain(p);
    validateConfigs(context, p);
    writeState(p, { context });
    const vars = {
      SINIVERSE_REPOSITORY: context.repository, SINIVERSE_SHA: context.sha, SINIVERSE_REF: context.ref,
      SINIVERSE_BRANCH: context.branch, SINIVERSE_SOURCE_BRANCH: context.sourceBranch,
      SINIVERSE_ENVIRONMENT: context.environment, SINIVERSE_BASE_SHA: context.baseSha,
      SINIVERSE_VERSION: context.appVersion
    };
    for (const [key, value] of Object.entries(vars)) appendFileSync(env.GITHUB_ENV, key + '=' + value + '\n');
    appendFileSync(env.GITHUB_OUTPUT, 'chromium=' + getProfile(context.repository).chromium + '\npublish=' + context.publishEligible + '\n');
    return;
  }
  if (command === 'summary') {
    const state = existsSync(p.state) ? readState(p) : {};
    const context = state.context;
    const lines = ['## Siniverse CI', '', '| Field | Value |', '| --- | --- |',
      '| Repository | ' + (context?.repository || env.GITHUB_REPOSITORY || '') + ' |',
      '| Commit | ' + (context?.sha || env.GITHUB_SHA || '') + ' |',
      '| Automation | ' + (context?.automationRef || env.AUTOMATION_REF || '') + ' |',
      '| Version | ' + (context?.appVersion || '') + ' |',
      '| Version tag | ' + (context?.versionTag || 'Local/PR fallback') + ' |',
      '| Result | ' + (env.CI_JOB_STATUS || 'unknown') + ' |',
      '| Publication | ' + (state.publication?.outcome || 'Validation only') + ' |'];
    for (const result of state.publication?.targets || []) lines.push('| ' + result.worker + ' | ' + result.url + ' |');
    appendFileSync(env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    return;
  }
  const state = readState(p);
  const context = state.context;
  assertCheckouts(context, p);
  validateConfigs(context, p);
  const profile = getProfile(context.repository);
  if (command === 'seal') {
    invariant(!existsSync(join(p.dist, 'deployment.json')), 'Only the central controller may create deployment.json.');
    preparePreviewHeaders(context, p.dist);
    const manifest = manifestFor(context, context.appVersion, artifactDigest(p.dist));
    writeFileSync(join(p.dist, 'deployment.json'), JSON.stringify(manifest, null, 2) + '\n');
    state.manifest = manifest;
    writeState(p, state);
    return;
  }
  verifyManifest(readJson(join(p.dist, 'deployment.json')), context, context.appVersion, artifactDigest(p.dist));
  const cli = join(p.app, 'node_modules/wrangler/bin/wrangler.js');
  if (command === 'dry-run') {
    const targets = [{ worker: profile.worker, config: 'wrangler.jsonc' }];
    if (profile.api) targets.push({ ...profile.api, api: true });
    for (const target of targets) run(process.execPath, [cli, ...wranglerArguments(target, true, join(env.RUNNER_TEMP || p.app, 'siniverse-dry-run', target.worker))], { cwd: p.app });
    return;
  }
  invariant(command === 'publish', 'Unknown central CI command.');
  const plan = publicationPlan(context, profile);
  if (!credentialState(context, env)) {
    process.stdout.write('::notice::Publication skipped: Cloudflare credentials are not configured.\n');
    state.publication = { outcome: 'Skipped: missing Cloudflare credentials', targets: [] };
    writeState(p, state);
    return;
  }
  state.publication = { outcome: 'Publishing', targets: [] };
  writeState(p, state);
  for (const target of plan) {
    verifyManifest(readJson(join(p.dist, 'deployment.json')), context, context.appVersion, artifactDigest(p.dist));
    await githubHead(context, env.GH_TOKEN);
    await buildVersion(context, context.appVersion, { SINIVERSE_VERSION: context.appVersion, SINIVERSE_VERSION_TAG: context.versionTag },
      githubVersionClient(context.repository, env.GH_TOKEN));
    run(process.execPath, [cli, ...wranglerArguments(target)], { cwd: p.app });
    await probe(target, state.manifest);
    state.publication.targets.push({ worker: target.worker, url: target.url });
    writeState(p, state);
  }
  state.publication.outcome = 'Published and HTTPS probes passed';
  writeState(p, state);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((error) => {
    process.stderr.write('::error::' + error.message.replace(/[\r\n]+/g, ' ') + '\n');
    process.exitCode = 1;
  });
}
