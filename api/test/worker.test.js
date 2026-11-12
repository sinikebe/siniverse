import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createWorker } from '../src/worker.js';

const API = 'https://api.siniverse.cc';
const ORIGINS = {
  finapp: 'https://finapp.siniverse.cc',
  garapp: 'https://garapp.siniverse.cc',
};
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

class D1Memory {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(readFileSync(new URL('../migrations/0001_sessions.sql', import.meta.url), 'utf8'));
  }

  prepare(sql) {
    const statement = this.database.prepare(sql);
    return {
      bind(...values) {
        return {
          async first() { return statement.get(...values) || null; },
          async run() {
            const result = statement.run(...values);
            return { meta: { changes: Number(result.changes) } };
          },
        };
      },
    };
  }

  async batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function fixture() {
  const db = new D1Memory();
  const env = {
    DB: db,
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64'),
    FINAPP_GOOGLE_CLIENT_SECRET: 'finapp-secret-for-test',
    GARAPP_GOOGLE_CLIENT_SECRET: 'garapp-secret-for-test',
  };
  let seconds = 1_800_000_000;
  let refreshFailure = null;
  let consentScope = DRIVE_SCOPE;
  let exchanges = 0;
  const calls = [];
  const fetchImpl = async (address, options) => {
    calls.push({ address, params: Object.fromEntries(options.body.entries()) });
    assert.equal(address, 'https://oauth2.googleapis.com/token');
    if (options.body.get('grant_type') === 'authorization_code') {
      exchanges += 1;
      return Response.json({
        access_token: `first-access-${exchanges}`,
        refresh_token: `secret-refresh-${exchanges}`,
        expires_in: 3600,
        scope: consentScope,
      });
    }
    if (refreshFailure) return Response.json({ error: refreshFailure }, { status: 400 });
    exchanges += 1;
    return Response.json({
      access_token: `refreshed-access-${exchanges}`,
      expires_in: 3600,
      scope: DRIVE_SCOPE,
    });
  };
  const worker = createWorker({ fetchImpl, clock: () => seconds * 1000 });
  const advance = (by) => { seconds += by; };
  const failRefresh = (error) => { refreshFailure = error; };
  const setConsentScope = (scope) => { consentScope = scope; };
  const call = (app, operation, { method = 'GET', cookie = '', origin = ORIGINS[app], query = '' } = {}) => {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (cookie) headers.Cookie = cookie;
    return worker.fetch(new Request(`${API}/v1/${app}/${operation}${query}`, { method, headers }), env);
  };
  return { env, db, worker, calls, call, advance, failRefresh, setConsentScope };
}

function cookieFrom(response, prefix) {
  const record = response.headers.getSetCookie().find((value) => value.startsWith(prefix));
  assert.ok(record, `Cookie ${prefix} was not set`);
  return record.split(';')[0];
}

async function authorize(f, app, returnTo = `${ORIGINS[app]}/`) {
  const start = await f.call(app, 'connect', {
    origin: null,
    query: `?return_to=${encodeURIComponent(returnTo)}`,
  });
  assert.equal(start.status, 302);
  const googleUrl = new URL(start.headers.get('Location'));
  assert.equal(googleUrl.origin, 'https://accounts.google.com');
  assert.equal(googleUrl.searchParams.get('scope'), DRIVE_SCOPE);
  assert.equal(googleUrl.searchParams.get('access_type'), 'offline');
  assert.equal(googleUrl.searchParams.get('prompt'), 'select_account consent');
  assert.equal(googleUrl.searchParams.get('redirect_uri'), `${API}/v1/${app}/callback`);
  assert.ok(!start.headers.get('Location').includes(returnTo));
  const state = googleUrl.searchParams.get('state');
  const stateCookie = cookieFrom(start, `__Host-siniverse_oauth_${app}=`);
  const end = await f.call(app, 'callback', {
    cookie: stateCookie,
    origin: null,
    query: `?code=google-code&state=${state}`,
  });
  assert.equal(end.status, 302);
  assert.equal(end.headers.get('Location'), returnTo);
  assert.ok(end.headers.getSetCookie().some((value) => value.startsWith(`__Host-siniverse_oauth_${app}=`) && value.includes('Max-Age=0')));
  return { sessionCookie: cookieFrom(end, `__Host-siniverse_${app}=`), state, stateCookie };
}

test('unconfigured API stays unavailable without a leaked secret; health works on previews', async () => {
  const f = fixture();
  const env = { ...f.env, TOKEN_ENCRYPTION_KEY: undefined };
  const session = await f.worker.fetch(new Request(`${API}/v1/finapp/session`, {
    headers: { Origin: ORIGINS.finapp },
  }), env);
  assert.equal(session.status, 503);
  assert.deepEqual(await session.json(), { error: 'temporarily_unavailable' });
  const health = await f.worker.fetch(new Request('https://siniverse-api.example.workers.dev/health'), {});
  assert.deepEqual(await health.json(), { ok: true });
  const blocked = await f.worker.fetch(new Request('https://siniverse-api.example.workers.dev/v1/finapp/session'), f.env);
  assert.equal(blocked.status, 404);
});

test('reject open redirects and nonproduction origins before creating OAuth state', async () => {
  const f = fixture();
  for (const url of [
    'http://finapp.siniverse.cc/',
    'https://finapp.siniverse.cc.evil.test/',
    'https://finapp.siniverse.cc:444/',
    'https://garapp.siniverse.cc/',
    'https://finapp.siniverse.cc/#hash',
    'javascript:alert(1)',
  ]) {
    const answer = await f.call('finapp', 'connect', {
      query: `?return_to=${encodeURIComponent(url)}`, origin: null,
    });
    assert.equal(answer.status, 400, url);
  }
  assert.equal(f.db.database.prepare('SELECT COUNT(*) AS total FROM oauth_states').get().total, 0);
});

test('one-time state tied to browser cookie blocks replay and login CSRF', async () => {
  const f = fixture();
  const start = await f.call('finapp', 'connect', {
    origin: null, query: `?return_to=${encodeURIComponent(`${ORIGINS.finapp}/`)}`,
  });
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const stateCookie = cookieFrom(start, '__Host-siniverse_oauth_finapp=');
  const otherApp = await f.call('garapp', 'callback', {
    origin: null, cookie: stateCookie, query: `?code=x&state=${state}`,
  });
  assert.equal(otherApp.status, 400);
  assert.equal((await f.call('finapp', 'callback', {
    origin: null, cookie: '__Host-siniverse_oauth_finapp=wrong', query: `?code=x&state=${state}`,
  })).status, 400);
  const first = await f.call('finapp', 'callback', {
    origin: null, cookie: stateCookie, query: `?code=x&state=${state}`,
  });
  assert.equal(first.status, 302);
  const second = await f.call('finapp', 'callback', {
    origin: null, cookie: stateCookie, query: `?code=x&state=${state}`,
  });
  assert.equal(second.status, 400);
  assert.equal(f.calls.length, 1);
});

test('a failed replacement cannot destroy a previously working session', async () => {
  const f = fixture();
  const original = await authorize(f, 'finapp');
  f.db.database.exec(`
    CREATE TRIGGER reject_next_session BEFORE INSERT ON sessions
    BEGIN SELECT RAISE(ABORT, 'database write failed'); END;
  `);
  const start = await f.call('finapp', 'connect', {
    origin: null, query: `?return_to=${encodeURIComponent(`${ORIGINS.finapp}/`)}`,
  });
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const stateCookie = cookieFrom(start, '__Host-siniverse_oauth_finapp=');
  const replacement = await f.call('finapp', 'callback', {
    origin: null,
    cookie: `${stateCookie}; ${original.sessionCookie}`,
    query: `?code=another-code&state=${state}`,
  });
  assert.equal(replacement.status, 503);
  assert.deepEqual(await (await f.call('finapp', 'session', { cookie: original.sessionCookie })).json(), { connected: true });
});

test('a stale session read never clears a newer cookie from another tab', async () => {
  const f = fixture();
  const missing = '__Host-siniverse_finapp=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const session = await f.call('finapp', 'session', { cookie: missing });
  assert.deepEqual(await session.json(), { connected: false });
  assert.equal(session.headers.get('Set-Cookie'), null);
  const token = await f.call('finapp', 'token', { cookie: missing });
  assert.equal(token.status, 401);
  assert.equal(token.headers.get('Set-Cookie'), null);
});

test('sessions stay isolated per app, persist across visits and never expose refresh tokens', async () => {
  const f = fixture();
  const finapp = await authorize(f, 'finapp', `${ORIGINS.finapp}/settings?tab=drive`);
  const garapp = await authorize(f, 'garapp');
  const finappSession = await f.call('finapp', 'session', { cookie: finapp.sessionCookie });
  assert.deepEqual(await finappSession.json(), { connected: true });
  assert.match(finappSession.headers.get('Set-Cookie'), /Max-Age=2592000; Secure; HttpOnly; SameSite=Lax/);
  const token = await f.call('garapp', 'token', { cookie: finapp.sessionCookie });
  assert.equal(token.status, 401);
  assert.equal((await f.call('garapp', 'session', { cookie: garapp.sessionCookie })).status, 200);
  const cached = await f.call('finapp', 'token', { cookie: finapp.sessionCookie });
  assert.equal((await cached.json()).access_token, 'first-access-1');
  assert.equal(cached.headers.get('Cache-Control'), 'no-store');
  const stored = f.db.database.prepare('SELECT refresh_ciphertext FROM sessions WHERE app = ?').get('finapp');
  assert.ok(stored?.refresh_ciphertext && !stored.refresh_ciphertext.includes('secret-refresh'));
  assert.equal(f.calls.length, 2, 'cached access tokens avoid extra Google requests');
});

test('origin checks prevent cross-app reads and cross-site writes even with a valid cookie', async () => {
  const f = fixture();
  const auth = await authorize(f, 'finapp');
  const denied = await f.call('finapp', 'token', {
    cookie: auth.sessionCookie, origin: ORIGINS.garapp,
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  const logout = await f.call('finapp', 'disconnect', {
    cookie: auth.sessionCookie, origin: 'https://evil.siniverse.cc', method: 'POST',
  });
  assert.equal(logout.status, 403);
  assert.deepEqual(await (await f.call('finapp', 'session', { cookie: auth.sessionCookie })).json(), { connected: true });
  const allowed = await f.call('finapp', 'session', { method: 'OPTIONS' });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');
});

test('refresh expiration and Google revocation clear only the affected session', async () => {
  const f = fixture();
  const finapp = await authorize(f, 'finapp');
  const garapp = await authorize(f, 'garapp');
  f.advance(3600);
  const refreshed = await f.call('finapp', 'token', { cookie: finapp.sessionCookie });
  assert.equal((await refreshed.json()).access_token, 'refreshed-access-3');
  assert.equal(f.calls.at(-1).params.grant_type, 'refresh_token');
  f.failRefresh('invalid_grant');
  f.advance(3600);
  const revoked = await f.call('finapp', 'token', { cookie: finapp.sessionCookie });
  assert.equal(revoked.status, 401);
  assert.deepEqual(await (await f.call('finapp', 'session', { cookie: finapp.sessionCookie })).json(), { connected: false });
  assert.deepEqual(await (await f.call('garapp', 'session', { cookie: garapp.sessionCookie })).json(), { connected: true });
});

test('Google denying the Drive scope never creates a session', async () => {
  const f = fixture();
  f.setConsentScope('openid email');
  const start = await f.call('finapp', 'connect', {
    origin: null, query: `?return_to=${encodeURIComponent(`${ORIGINS.finapp}/`)}`,
  });
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const stateCookie = cookieFrom(start, '__Host-siniverse_oauth_finapp=');
  const callback = await f.call('finapp', 'callback', {
    cookie: stateCookie, origin: null, query: `?state=${state}&code=valid-code`,
  });
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('Location'), `${ORIGINS.finapp}/?drive_auth=failed`);
  assert.equal(f.db.database.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 0);
});

test('temporary refresh errors preserve the session for retry', async () => {
  const f = fixture();
  const connected = await authorize(f, 'garapp');
  f.advance(3600);
  f.failRefresh('temporarily_unavailable');
  assert.equal((await f.call('garapp', 'token', { cookie: connected.sessionCookie })).status, 503);
  assert.deepEqual(await (await f.call('garapp', 'session', { cookie: connected.sessionCookie })).json(), { connected: true });
  f.failRefresh(null);
  assert.equal((await f.call('garapp', 'token', { cookie: connected.sessionCookie })).status, 200);
});

test('disconnect removes only this browser session and scheduled cleanup expires abandoned records', async () => {
  const f = fixture();
  const finapp = await authorize(f, 'finapp');
  const garapp = await authorize(f, 'garapp');
  const answer = await f.call('finapp', 'disconnect', {
    cookie: finapp.sessionCookie, method: 'POST',
  });
  assert.equal(answer.status, 204);
  assert.match(answer.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.deepEqual(await (await f.call('finapp', 'session', { cookie: finapp.sessionCookie })).json(), { connected: false });
  assert.deepEqual(await (await f.call('garapp', 'session', { cookie: garapp.sessionCookie })).json(), { connected: true });
  assert.equal(f.calls.length, 2, 'local logout must not revoke other devices at Google');
  f.advance(31 * 24 * 60 * 60);
  await f.worker.scheduled(null, f.env);
  assert.equal(f.db.database.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 0);
});
