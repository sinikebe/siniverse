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

## Cloudflare setup

1. In **Workers & Pages → Create application → Connect GitHub**, select the Siniverse repository and its `main` branch. Set **Root directory** to `api`, **Worker name** to `siniverse-api`, **Build command** to `node --test`, and leave the default **Deploy command** `npx wrangler deploy`. Set the **build environment variable** `NODE_VERSION=24` so the SQLite-based tests run with the supported Node version. Cloudflare runs these commands in its build service; no local `npx` is required. A failing test prevents deployment. `wrangler.jsonc` declares a D1 binding named `DB` with automatic database provisioning (Wrangler 4.45 or later). After the first deployment, verify `GET /health` at its `workers.dev` URL and locate the provisioned D1 database in the Cloudflare dashboard.
2. Open **D1 → the database bound to `siniverse-api` → Console**. Paste the full contents of [`migrations/0001_sessions.sql`](migrations/0001_sessions.sql) and click **Execute**. Run `SELECT name FROM sqlite_master WHERE type = 'table';` to confirm `oauth_states` and `sessions` exist. This initial migration is idempotent. For subsequent migrations, use Wrangler's `d1 migrations apply DB --remote` in CI or apply reviewed SQL through the D1 Console; do not run destructive migrations over existing sessions.
3. In **Workers & Pages → siniverse-api → Settings → Variables and Secrets**, add these values as **Secret**, never plaintext variables or repository files:

   | Secret name | Value |
   | --- | --- |
   | `FINAPP_GOOGLE_CLIENT_SECRET` | Secret for FinApp's existing Web OAuth Client ID. |
   | `GARAPP_GOOGLE_CLIENT_SECRET` | Secret for GarApp's existing Web OAuth Client ID. |
   | `TOKEN_ENCRYPTION_KEY` | Base64 encoding of **exactly 32 random bytes** for AES-GCM. |

   Generate the encryption key with `node -p "require('node:crypto').randomBytes(32).toString('base64')"` and enter the result directly in Cloudflare's secret field. Keep a secure backup of this key: replacing it without migrating D1 renders existing encrypted sessions unusable and requires users to reconnect. No real secret belongs in a commit, issue, log, or support message.
4. `wrangler.jsonc` declares the **Custom Domain** `api.siniverse.cc`; during deployment Cloudflare creates its DNS record and TLS certificate automatically. Confirm it appears under **siniverse-api → Settings → Domains & Routes** and that `https://api.siniverse.cc/health` returns `{"ok":true}`. The session endpoint returns a generic `503` while runtime setup is incomplete. Keep the `routes` entry in Git so future deployments continue to attach the API domain. There is no reason to attach the app websites' domains to this API Worker.

Cloudflare's automatic D1 provisioning currently uses a binding-only configuration. If provisioning does not occur in your account, create one D1 database in the dashboard, bind it to `siniverse-api` as `DB`, and replace the binding-only entry in `wrangler.jsonc` with its `database_name` and `database_id` before retrying the build.

If the first deployment cannot attach `api.siniverse.cc` because of an existing DNS record or domain assignment, temporarily remove the `routes` entry, deploy and test `/health` on `workers.dev`, resolve the conflict in the Cloudflare dashboard, then restore the `routes` entry and deploy again **before** enabling the API in the apps.

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

A daily scheduled task at 03:00 UTC deletes expired states and sessions. Deleting a D1 row removes the live record; Cloudflare D1 Time Travel can still restore historical data for up to 30 days. Authentication requests and responses must not be logged with token values or cookies.

## Verification

Run `node --test` from `api/` (Node 24 or later). The tests execute the SQL migration in an in-memory SQLite database and cover valid OAuth consent, state replay, open redirects, cross-app isolation, Origin checks, encrypted tokens, refresh, expired sessions, Google invalidation, local disconnect, and cleanup. Before switching any production UI, test one real GarApp account's ability to **list and read an existing backup** using the Worker-issued token, then create a new backup without removing the previous one. Repeat for FinApp, then check tab close and reopen on a second device.
