# CI-assigned application versions

The four applications start a new version epoch at `0.0.1`. Package and lockfile
versions remain `0.0.1` as the local/PR fallback. Previous release and cache
histories are archived, not deleted. Builds receive `SINIVERSE_VERSION` without
`v` and render it before calculating service worker/cache fingerprints. Footers
add `v` for display and work offline, without a runtime version fetch.

## Immutable source of truth

- Production: `siniverse-version/main/vX.Y.Z`.
- Stable development preview: `siniverse-version/dev/vX.Y.Z`.

An annotated Git tag targets the exact tested/deployed application SHA. Its JSON
records schema/epoch, repository, channel, SHA, version, bump, PR, priorTag,
optional exact dev promotion source, automationRef and assigning runId.
New assignments record `versionPolicy: channel-patch-minor-v1`, plus an exact
`productionBase` for dev when production already exists. Legacy annotations remain
readable without reinterpreting or rewriting their assigned versions.
Lightweight tags, malformed metadata, ambiguous SHA mappings and collisions fail.
The implementation creates new tag objects/refs only; no tags are moved/deleted,
and no branch commits, PAT or release service are introduced.

`deployment.json` records injected appVersion, versionTag, source and automation
SHAs. The read-only app job verifies the tag at context creation and again before
publication. Retries reuse the exact channel/SHA mapping without another bump,
including after a failed deployment. A tag records version assignment; actual
publication is established by CI and its HTTPS probe.

## Increment policy

The first dev assignment remains exactly `0.0.1`. Every subsequent integration
on dev increments patch once, regardless of PR titles, breaking markers or
`semver:*` labels. A merge commit counts once; commits imported from its feature
branch are not counted again. Multiple direct commits each receive a patch.

Every same-repository dev-to-main promotion increments the previous production
minor once and resets patch to zero: main `0.1.0` becomes `0.2.0`, including when
the tested dev build is `0.1.12`. The first promotion is `0.1.0`. The exact tested
dev SHA and its assigned version remain recorded as provenance; production need
not display the dev build's version. Neither title nor labels override this rule.

After a newer production version exists, dev increments patch from the higher
of its prior assigned version and that production version. Versions already
assigned by the legacy policy are not reduced or reassigned. Production's minor
counter follows production, independently of historically inflated dev minors.
For example, legacy dev `0.5.0` continues at `0.5.1`, while main `0.0.1` promotes
to `0.1.0`; the old dev tags remain immutable.

An untagged dev source fails immediately with a retry instruction after dev assigns
its version; it never waits while holding the shared queue. A safe main-to-dev
fast-forward is supported when the dev anchor is a merge's second parent.
Actual rewrites losing the prior anchor are refused. Existing exact channel/SHA
mappings, including legacy versions and failed deployment retries, always win
over a new assignment.

## Queue, replay and permissions

Only the separate trusted version job receives tag-write permissions. Public
repository/main/dev guards run before runner allocation. It checks out pinned
central tools only, uses GitHub APIs, never executes application code and never
receives Cloudflare credentials. PRs and validation-only dispatches skip this job.
The app job remains contents-read; existing merged-branch cleanup stays separate.

Assignment is serialized per repository with `queue: max` and
`cancel-in-progress: false`. Replay remains necessary for superseded events and
finite queues. Paginated compare responses prove the previous anchor is an
ancestor and provide the complete range. Paginated closed PR metadata is filtered
by exact merge_commit_sha plus target base.ref before ambiguity checks. Historical
duplicates outside the range are ignored; associated-PR guesses are not used.
Commit parents establish the channel's first-parent integration path. Every
pending dev integration counts once, including intermediate direct commits;
side-branch ancestors imported by merges do not count. Every main integration
must be an exact approved dev-to-main promotion. All comparisons are completed
and validated before any missing assignment is created.

Public identity and current head are re-read before each tag creation. Stale runs
skip assignment/publication; the next current run replays missing merges.
Atomic ref collisions fail without force, deletion or branch writes.
No persistent cache or additional Actions artifact is introduced.

## Legacy Pages

Both selected main/dev heads must have successful CI. Pages resolves their exact
tags and injects `SINIVERSE_PAGES_MAIN_VERSION` and `SINIVERSE_PAGES_DEV_VERSION`
into `ci:pages`. Existing redirects/recovery are preserved. Heads and version
mappings are rechecked before publishing the existing ephemeral Pages artifact.

## Bootstrap and pin rollout

Working PRs always target dev. The owner tests dev before explicitly approving
a dev-to-main promotion from the same repository. Other main PR sources and
direct main pushes cannot assign or publish a production version. No workflow
automatically merges or promotes main. The app job uses contents-read and
pull-requests-read only to recheck that exact production provenance.

1. Review/test central code while retaining the currently pinned caller.
2. Merge the central PR into dev with a merge commit, preserving its reviewed source SHA.
3. Adopt the byte-identical CI caller in four apps and Pages caller in
   Finapp/Garapp, all pinned to that same new immutable SHA.
4. Publish and test dev first. Promote only through an explicitly approved
   same-repository dev-to-main PR, preserving distinct work. Dev begins at `0.0.1`
   and advances by patches; production starts at `0.1.0` and advances by minors.

Normal PR/merge runs validate the rollout. No extra manual dispatch is required.
Permanent main/dev and immutable tags remain; feature branches use safe cleanup.
