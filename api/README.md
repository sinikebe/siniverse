# Siniverse Drive session API

This Cloudflare Worker keeps the Google Drive authorization for FinApp and GarApp across browser restarts. The sites continue to call Google Drive directly using a short-lived access token held only in memory. Backup contents never pass through this Worker, and existing Google Drive files keep their current format and location.

## API

| Endpoint | Result |
| --- | --- |
| `GET /health` | `{ "ok": true }`, including on `workers.dev` before setup. |
| `GET /v1/{app}/session` | `{ "connected": true }` or `{ "connected": false }`. |
| `GET /v1/{app}/token` | `{ "access_token": "...", "expires_in": 3600 }` or `401` if disconnected. |
| `GET /v1/{app}/connect?return_to=<URL>` | Starts Google's authorization-code flow and redirects the browser to Google. |
| `GET /v1/{app}/callback` | Google redirects here; the Worker validates and consumes OAuth state, then redirects to `return_to`. |
| `POST /v1/{app}/disconnect` | Deletes this browser's session, returns `204`. |

`{app}` is `finapp` or `garapp`. The session, token and disconnect endpoints require `Origin: https://{app}.siniverse.cc`, and cross-origin browser requests must include `credentials: 'include'`. Only the exact production origins are allowed by CORS. Initiate `/connect` as a top-level navigation, passing a complete HTTPS `return_to` URL at the corresponding app origin, without a fragment. Failed consent redirects to the same origin with `drive_auth=failed` in the query string.

The browser may display the account name, email and avatar by calling Drive `about.get?fields=user(displayName,emailAddress,photoLink)` with the access token. The Worker asks only for `drive.file`, and never stores the profile. Access tokens are also protected with `Cache-Control: no-store`; apps must never save them in localStorage, IndexedDB or a service worker cache.

If the Worker is unreachable, has no D1 schema, or lacks credentials, its auth endpoints fail closed (`503`, or a network error). The sites can temporarily fall back to their existing Google Identity Services flow. OAuth endpoints intentionally return `404` on `workers.dev` hosts: only `https://api.siniverse.cc` can receive a Google authorization callback.

## GitHub Actions deployment

The repository workflow publishes the existing `siniverse-api` Worker from `main`, after the site and API tests pass. A manual run publishes only when `deploy` is explicitly enabled on `main`. The `dev` branch publishes a site Preview only: it never publishes this API or creates an API Preview. Pull requests run tests and packaging checks without Cloudflare credentials.

Use the pinned **Wrangler 4.161.0 at the repository root**, installed with `npm ci`. The workflow runs `npm run deploy:api`, equivalent to `wrangler deploy --config api/wrangler.jsonc --no-x-provision --keep-vars`. It verifies the expected account and current GitHub branch head immediately before publication. Missing credentials skip push publication; an explicit manual publication fails if credentials are absent. See the root README for the two GitHub deployment secrets and the account guard.

The deployment token must cover both `siniverse` and `siniverse-api`. The database already exists, and its ID is pinned in `wrangler.jsonc`: publication does not create a D1 database or execute SQL. Wrangler may need D1 Read for metadata. Worker Editor access is needed for publication; Workers Routes Write for the `siniverse.cc` zone is relevant only if the domain connection needs reconciliation. Runtime OAuth/encryption secrets stay in Cloudflare, are preserved by deployment, and must not be copied into the repository or workflow.

For credential-free local checks, run these commands from the repository root:

```sh
npm ci
npm run check
npm test
npm run build:api
```

## Existing Cloudflare runtime setup

1. Keep the existing Worker `siniverse-api`, its `api.siniverse.cc` domain, daily cron and D1 binding `DB`. The configuration references the same existing database, `fb5227cc-637b-4bab-be6b-3984a0b96d64`; automatic resource provisioning is disabled by the deployment command. Keep its former Workers Builds integration paused so GitHub Actions is the only publisher.
2. Database schema changes remain a separate, reviewed manual operation. If initial setup is still required, open **D1 → the database bound to `siniverse-api` → Console**, review [`migrations/0001_sessions.sql`](migrations/0001_sessions.sql) and apply it there. Run `SELECT name FROM sqlite_master WHERE type = 'table';` to confirm `oauth_states` and `sessions` exist. The initial migration is idempotent. No workflow in this repository runs `d1 migrations apply`, and no destructive migration over existing sessions is part of publication.
3. In **Workers & Pages → siniverse-api → Settings → Variables and Secrets**, add these values as **Secret**, never plaintext variables or repository files:

   | Secret name | Value |
   | --- | --- |
   | `FINAPP_GOOGLE_CLIENT_SECRET` | Secret for FinApp's existing Web OAuth Client ID. |
   | `GARAPP_GOOGLE_CLIENT_SECRET` | Secret for GarApp's existing Web OAuth Client ID. |
   | `TOKEN_ENCRYPTION_KEY` | Base64 encoding of **exactly 32 random bytes** for AES-GCM. |

   Generate the encryption key with `node -p "require('node:crypto').randomBytes(32).toString('base64')"` and enter the result directly in Cloudflare's secret field. Keep a secure backup of this key: replacing it without migrating D1 renders existing encrypted sessions unusable and requires users to reconnect. No real secret belongs in a commit, issue, log, or support message.
4. `wrangler.jsonc` retains the existing **Custom Domain** `api.siniverse.cc`. Confirm it appears under **siniverse-api → Settings → Domains & Routes** and that `https://api.siniverse.cc/health` returns `{"ok":true}`. The session endpoint returns a generic `503` while runtime setup is incomplete. Keep the current route in Git; do not attach the app websites' domains to this API Worker or remove the existing domain as part of the CI migration.

## Google Auth Platform setup

Keep the existing **Web application** OAuth Client IDs in their respective Google Cloud projects:

| App | Existing Client ID | Exact Authorized redirect URI |
| --- | --- | --- |
| FinApp | `123276017189-hh455oasahqvtj6ev2u1put07jd1hbb2.apps.googleusercontent.com` | `https://api.siniverse.cc/v1/finapp/callback` |
| GarApp | `186397627683-4bclnsk16qu9vr8fio5e8vi28lnrj9oj.apps.googleusercontent.com` | `https://api.siniverse.cc/v1/garapp/callback` |

Add each redirect URI to the **existing client** in **Google Auth Platform → Clients**. Use its client secret only in the matching Cloudflare secret above. If an old Web client secret cannot be retrieved, reset that client's secret in Google Cloud rather than changing its Client ID: GarApp's `drive.file` access to existing backups must be tested before changing client credentials. The Worker requests `access_type=offline` and `prompt=select_account consent` so users choose their Google account and the earlier browser-only grant can yield a refresh token.

Set each Google project's **Audience** to **In production** for lasting authorization: an External project in Testing invalidates authorizations and Drive refresh tokens seven days after consent. Keep Google Drive API enabled, the `drive.file` scope declared, the Siniverse homepage and privacy policy publicly accessible, and the authorized domain configured. Google can still invalidate refresh tokens after user revocation or other security events; the frontend must handle `401` by offering reconnection.

## Stored data and session limits

The `oauth_states` table contains a SHA-256 hash of the one-time OAuth state, the app name, a temporary `return_to` URL (including its path and query string), and its expiration. Its browser cookie is `Secure; HttpOnly; SameSite=Lax`; a state expires after ten minutes and is consumed in one atomic operation at callback. Invalid or replayed states never exchange a code.

The `sessions` table contains a SHA-256 hash of a random session ID, the app name, encrypted Google refresh token and IV, encrypted temporary access token and IV, access/refresh expiration if known, session creation and expiration times. AES-GCM authenticates ciphertext with the app and session hash; its 256-bit key exists only in a Cloudflare secret. It contains **no name, email address, avatar, Google user identifier, or backup contents**. Browser cookies are host-only (`__Host-`), `Secure`, `HttpOnly`, `SameSite=Lax`, unique per app, and valid for 30 days since the last successful `/session` or `/token` request. `disconnect` removes only that browser's session and encrypted tokens; it does **not** revoke authorization on other devices. Users can revoke the whole app separately in their Google Account settings.

A daily scheduled task at 03:00 UTC deletes expired states and sessions. Deleting a D1 row removes the live record; Cloudflare D1 Time Travel can still restore historical data for up to 7 days on Workers Free or 30 days on Workers Paid. Authentication requests and responses must not be logged with token values or cookies.

## Verification

Run `node --test` from `api/` (Node 24 or later). The tests execute the SQL migration in an in-memory SQLite database and cover valid OAuth consent, state replay, open redirects, cross-app isolation, Origin checks, encrypted tokens, refresh, expired sessions, Google invalidation, local disconnect, and cleanup. Before switching any production UI, test one real GarApp account's ability to **list and read an existing backup** using the Worker-issued token, then create a new backup without removing the previous one. Repeat for FinApp, then check tab close and reopen on a second device.
