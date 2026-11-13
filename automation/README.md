# Shared Siniverse automation

The four application repositories use the same generated `CI` caller. All
application differences live in `apps.json`: repository identity, Worker,
existing production/Preview URLs, Chromium and the production-only Siniverse API.

CI versions use immutable annotated tags per channel; see [VERSIONING.md](VERSIONING.md).
The source package version is a local fallback, not the current deployed release.

## Contract

- `ubuntu-24.04`, Node `24.22.2` from the sole `.node-version` file, npm
  `11.19.1` from packageManager, and Wrangler `4.161.0` from each lockfile.
- Caller `uses` and `automation_ref` pin the same immutable central SHA.
  Only the two Cloudflare deployment secrets are passed, explicitly.
- Exact app checkout at `app/`, immutable central tools at `.siniverse-ci/`.
- Registered public repositories only, guarded before runner allocation and
  revalidated through GitHub immediately before publication.
- One runner checks, builds once, seals, dry-runs, publishes and probes the
  same dist. No Workers artifact upload or persistent Actions cache.
  `package-manager-cache: false` is explicit.
- Apps expose `ci:check` and `ci:build`; the latter creates `dist/` only.
  Static Wrangler config uses this dist, the registered Worker, both
  workers.dev flags false, and no route/routes/env declarations.
- Tracked app/tool sources must stay clean. Their checkout SHAs are verified.
  Symbolic links, including a linked dist root, are rejected.

## Adapter environment

| Variable | Meaning |
| --- | --- |
| SINIVERSE_REPOSITORY | Exact registered repository, including case. |
| SINIVERSE_SHA | Full tested application commit; merge commit on PR. |
| SINIVERSE_REF | Original GitHub ref. |
| SINIVERSE_BRANCH | Packaging main/dev: PR base, push branch, or dev for feature validation. |
| SINIVERSE_SOURCE_BRANCH | Actual source branch for diagnostics. |
| SINIVERSE_ENVIRONMENT | production, preview, or test for PR/features. |
| SINIVERSE_BASE_SHA | PR base, nonzero push before, otherwise dev/main merge-base or commit parent. |
| SINIVERSE_VERSION | Exact CI-assigned major.minor.patch version without v; local/PR fallback 0.0.1. |

Application changelog/PWA/history checks remain in ci:check. Their business
rules can require a broader baseline, such as the main merge-base on dev.

## Deployment marker

Only the controller creates dist/deployment.json. Schema version 1 contains
app, repository, sha, ref, branch, environment, injected appVersion, versionTag,
automationRef, runId, runAttempt, builtAt, toolchain and artifactSha256.
The digest covers sorted file paths and SHA256 hashes, excluding this marker.
It is revalidated before each publication.

On dev, the built _headers retains application rules and receives
X-Robots-Tag: noindex, nofollow. Public sources stay unchanged; application builds
render the assigned version before calculating service worker/cache fingerprints.
The Preview HTTPS probe also requires noindex.

## Publication

Push main publishes production; push dev publishes stable Worker Preview dev.
PRs only validate. Manual runs default to validation; deploy=true can publish
only exact main/dev. Secrets are available only in the executing publication
step. Account, repository, caller pin and current remote head are verified.
The head is reread before each Worker update. Missing secrets skip pushes
explicitly and fail explicit manual publication. Concurrency never cancels
a running publication.

Siniverse API is main-only, with its existing D1, no provisioning, keep-vars
and no SQL migration. Sites probe their exact HTTPS deployment marker with
bounded retries. API probes only public /health, never session/user data.

## Pages and cleanup

reusable-pages.yml and pages.mjs centralize the existing Finapp/Garapp legacy
Pages flows. Apps provide ci:pages. The existing Pages artifact is unique to
run/attempt, retained one day; this is separate from artifact-free Workers.
Both current main/dev revisions need successful push CI. Public identity,
source heads and the exact artifact are rechecked before Pages publication.
Both versions are resolved from immutable tags of those exact SHAs and passed
as SINIVERSE_PAGES_MAIN_VERSION and SINIVERSE_PAGES_DEV_VERSION.

reusable-cleanup.yml runs only for merged own-repository PRs in public apps.
Fresh PR/ref/protection metadata is read twice. Permanent, protected and
advanced branches are preserved. Deletion uses an atomic force-with-lease.
No PR code or Cloudflare secrets are used. Cleanup keeps its dedicated write
permissions. The separate trusted version job also receives contents write and
pull-requests read; app check/build/deploy remains contents read.

## Bootstrap and immutable pin updates

Central updates retain the currently pinned functional caller until the new
central commit is reviewed and merged, avoiding its own unknown future hash.
The reset build works with the old pin using source fallback 0.0.1; adoption
of the new pin creates the first channel tags at exactly 0.0.1.
After central review/merge, generate the callers with that immutable source:

    node automation/ci.mjs caller FULL_CENTRAL_SHA > .github/workflows/ci.yml
    node automation/ci.mjs pages-caller FULL_CENTRAL_SHA > .github/workflows/pages.yml

The CI caller is byte-identical in four apps; the Pages caller is identical
in Finapp/Garapp. CI, version assignment, Pages and cleanup use one reviewed SHA. Updates require
a new reviewed pin; callers never follow a moving branch/tag.

Run node --test automation/*.test.mjs and actionlint before a new release.
Natural PR/merge runs provide hosted Linux validation; do not dispatch
unnecessary manual builds.
