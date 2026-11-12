const API_ORIGIN = 'https://api.siniverse.cc';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const STATE_SECONDS = 10 * 60;
const APPS = Object.freeze({
  finapp: {
    origin: 'https://finapp.siniverse.cc',
    clientId: '123276017189-hh455oasahqvtj6ev2u1put07jd1hbb2.apps.googleusercontent.com',
    secret: 'FINAPP_GOOGLE_CLIENT_SECRET',
  },
  garapp: {
    origin: 'https://garapp.siniverse.cc',
    clientId: '186397627683-4bclnsk16qu9vr8fio5e8vi28lnrj9oj.apps.googleusercontent.com',
    secret: 'GARAPP_GOOGLE_CLIENT_SECRET',
  },
});

const encoder = new TextEncoder();

function encoded(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decoded(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function randomId() {
  return encoded(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return encoded(new Uint8Array(bytes));
}

function sameValue(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function cookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  return header.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

function sessionCookieName(app) {
  return `__Host-siniverse_${app}`;
}

function stateCookieName(app) {
  return `__Host-siniverse_oauth_${app}`;
}

function setCookie(name, value, seconds) {
  return `${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
}

function baseHeaders() {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
}

function cors(headers, app, request) {
  if (request.headers.get('Origin') === APPS[app].origin) {
    headers.set('Access-Control-Allow-Origin', APPS[app].origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return headers;
}

function json(body, status = 200, app, request, extra = {}) {
  const headers = new Headers({ ...baseHeaders(), 'Content-Type': 'application/json; charset=utf-8', ...extra });
  if (app && request) cors(headers, app, request);
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location, cookieValue) {
  const headers = new Headers({ ...baseHeaders(), Location: location });
  if (cookieValue) headers.append('Set-Cookie', cookieValue);
  return new Response(null, { status: 302, headers });
}

function validReturnUrl(value, app) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.origin !== APPS[app].origin || url.username || url.password || url.hash ||
        url.port || url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function encryptionKey(env) {
  if (!env?.DB || typeof env.TOKEN_ENCRYPTION_KEY !== 'string') return null;
  try {
    const bytes = decoded(env.TOKEN_ENCRYPTION_KEY);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

async function encrypt(keyBytes, app, sessionHash, kind, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv,
    additionalData: encoder.encode(`${app}:${sessionHash}:${kind}`),
  }, key, encoder.encode(value));
  return { iv: encoded(iv), value: encoded(new Uint8Array(data)) };
}

async function decrypt(keyBytes, app, sessionHash, kind, iv, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const data = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: decoded(iv),
    additionalData: encoder.encode(`${app}:${sessionHash}:${kind}`),
  }, key, decoded(value));
  return new TextDecoder().decode(data);
}

async function exchange(fetchImpl, params) {
  const result = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await result.json().catch(() => ({}));
  return { ok: result.ok, data: data && typeof data === 'object' ? data : {} };
}

function isToken(data, requireRefresh = false) {
  return typeof data.access_token === 'string' && data.access_token.length > 0 &&
    Number.isFinite(Number(data.expires_in)) && Number(data.expires_in) > 0 &&
    (!requireRefresh || (typeof data.refresh_token === 'string' && data.refresh_token.length > 0));
}

function grantedDrive(data) {
  return typeof data.scope === 'string' && data.scope.split(' ').includes(DRIVE_SCOPE);
}

async function findSession(env, app, request, now) {
  const value = cookie(request, sessionCookieName(app));
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const hash = await digest(value);
  const row = await env.DB.prepare(`
    SELECT session_hash, refresh_iv, refresh_ciphertext, refresh_expires_at,
      access_iv, access_ciphertext, access_expires_at
    FROM sessions
    WHERE session_hash = ? AND app = ? AND expires_at > ?
      AND (refresh_expires_at IS NULL OR refresh_expires_at > ?)
  `).bind(hash, app, now, now).first();
  return row ? { ...row, value } : null;
}

async function extendSession(env, app, session, now) {
  await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE session_hash = ? AND app = ?')
    .bind(now + SESSION_SECONDS, session.session_hash, app).run();
  return setCookie(sessionCookieName(app), session.value, SESSION_SECONDS);
}

function failedRedirect(returnTo, clearedState) {
  const location = new URL(returnTo);
  location.searchParams.set('drive_auth', 'failed');
  return redirect(location.href, clearedState);
}

async function connect(request, env, app, now) {
  const returnTo = validReturnUrl(new URL(request.url).searchParams.get('return_to'), app);
  if (!returnTo) return json({ error: 'invalid_return_url' }, 400, app, request);

  const state = randomId();
  await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('INSERT INTO oauth_states (state_hash, app, return_to, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await digest(state), app, returnTo, now + STATE_SECONDS).run();

  const destination = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  destination.search = new URLSearchParams({
    client_id: APPS[app].clientId,
    redirect_uri: `${API_ORIGIN}/v1/${app}/callback`,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'select_account consent',
    state,
  }).toString();
  return redirect(destination.href, setCookie(stateCookieName(app), state, STATE_SECONDS));
}

async function callback(request, env, app, keyBytes, fetchImpl, now) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const stateCookie = cookie(request, stateCookieName(app));
  const clearedState = setCookie(stateCookieName(app), '', 0);
  if (!/^[A-Za-z0-9_-]{43}$/.test(stateCookie) || !sameValue(state, stateCookie)) {
    return json({ error: 'invalid_oauth_state' }, 400, app, request, { 'Set-Cookie': clearedState });
  }

  // The authorization code cannot be replayed: each state is consumed atomically.
  const pending = await env.DB.prepare(`
    DELETE FROM oauth_states WHERE state_hash = ? AND app = ? AND expires_at > ?
    RETURNING return_to
  `).bind(await digest(state), app, now).first();
  if (!pending) return json({ error: 'expired_oauth_state' }, 400, app, request, { 'Set-Cookie': clearedState });
  if (url.searchParams.has('error') || !url.searchParams.get('code')) {
    return failedRedirect(pending.return_to, clearedState);
  }

  let auth;
  try {
    auth = await exchange(fetchImpl, {
      code: url.searchParams.get('code'),
      client_id: APPS[app].clientId,
      client_secret: env[APPS[app].secret],
      redirect_uri: `${API_ORIGIN}/v1/${app}/callback`,
      grant_type: 'authorization_code',
    });
  } catch {
    return failedRedirect(pending.return_to, clearedState);
  }
  if (!auth.ok || !isToken(auth.data, true) || !grantedDrive(auth.data)) {
    return failedRedirect(pending.return_to, clearedState);
  }

  const newSession = randomId();
  const hash = await digest(newSession);
  const refresh = await encrypt(keyBytes, app, hash, 'refresh', auth.data.refresh_token);
  const access = await encrypt(keyBytes, app, hash, 'access', auth.data.access_token);
  const ttl = Number(auth.data.refresh_token_expires_in);
  const refreshExpiry = Number.isFinite(ttl) && ttl > 0 ? now + Math.floor(ttl) : null;

  const statements = [env.DB.prepare(`
    INSERT INTO sessions (session_hash, app, refresh_iv, refresh_ciphertext,
      refresh_expires_at, access_iv, access_ciphertext, access_expires_at,
      expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(hash, app, refresh.iv, refresh.value, refreshExpiry,
    access.iv, access.value, now + Math.floor(Number(auth.data.expires_in)),
    now + SESSION_SECONDS, now)];
  // Both writes commit or roll back together, preserving the old session if creation fails.
  const oldSession = cookie(request, sessionCookieName(app));
  if (/^[A-Za-z0-9_-]{43}$/.test(oldSession)) {
    statements.push(env.DB.prepare('DELETE FROM sessions WHERE session_hash = ? AND app = ?')
      .bind(await digest(oldSession), app));
  }
  await env.DB.batch(statements);

  const response = redirect(pending.return_to);
  response.headers.append('Set-Cookie', clearedState);
  response.headers.append('Set-Cookie', setCookie(sessionCookieName(app), newSession, SESSION_SECONDS));
  return response;
}

async function session(request, env, app, now) {
  const found = await findSession(env, app, request, now);
  if (!found) return json({ connected: false }, 200, app, request);
  const sessionCookie = await extendSession(env, app, found, now);
  return json({ connected: true }, 200, app, request, { 'Set-Cookie': sessionCookie });
}

async function token(request, env, app, keyBytes, fetchImpl, now) {
  const found = await findSession(env, app, request, now);
  if (!found) return json({ error: 'not_connected' }, 401, app, request);

  let accessToken;
  let expiry = found.access_expires_at;
  if (expiry && expiry > now + 60 && found.access_iv && found.access_ciphertext) {
    accessToken = await decrypt(keyBytes, app, found.session_hash, 'access', found.access_iv, found.access_ciphertext);
  } else {
    const refresh = await decrypt(keyBytes, app, found.session_hash, 'refresh', found.refresh_iv, found.refresh_ciphertext);
    const auth = await exchange(fetchImpl, {
      client_id: APPS[app].clientId,
      client_secret: env[APPS[app].secret],
      refresh_token: refresh,
      grant_type: 'refresh_token',
    });
    if (!auth.ok) {
      if (auth.data.error === 'invalid_grant') {
        await env.DB.prepare('DELETE FROM sessions WHERE session_hash = ? AND app = ? AND refresh_ciphertext = ?')
          .bind(found.session_hash, app, found.refresh_ciphertext).run();
        return json({ error: 'not_connected' }, 401, app, request);
      }
      return json({ error: 'temporarily_unavailable' }, 503, app, request);
    }
    if (!isToken(auth.data) || (auth.data.scope && !grantedDrive(auth.data))) {
      return json({ error: 'temporarily_unavailable' }, 503, app, request);
    }
    accessToken = auth.data.access_token;
    expiry = now + Math.floor(Number(auth.data.expires_in));
    const access = await encrypt(keyBytes, app, found.session_hash, 'access', accessToken);
    const refreshed = auth.data.refresh_token
      ? await encrypt(keyBytes, app, found.session_hash, 'refresh', auth.data.refresh_token)
      : null;
    const lifetime = Number(auth.data.refresh_token_expires_in);
    const refreshExpiry = Number.isFinite(lifetime) && lifetime > 0
      ? now + Math.floor(lifetime) : null;
    const updated = await env.DB.prepare(`
      UPDATE sessions SET access_iv = ?, access_ciphertext = ?, access_expires_at = ?,
        refresh_iv = COALESCE(?, refresh_iv), refresh_ciphertext = COALESCE(?, refresh_ciphertext),
        refresh_expires_at = CASE WHEN ? = 1 THEN ? ELSE refresh_expires_at END
      WHERE session_hash = ? AND app = ? AND refresh_ciphertext = ?
    `).bind(access.iv, access.value, expiry, refreshed?.iv || null, refreshed?.value || null,
      refreshed ? 1 : 0, refreshExpiry, found.session_hash, app, found.refresh_ciphertext).run();
    if (updated.meta?.changes === 0) return json({ error: 'temporarily_unavailable' }, 503, app, request);
  }
  const sessionCookie = await extendSession(env, app, found, now);
  return json({ access_token: accessToken, expires_in: Math.max(1, expiry - now) },
    200, app, request, { 'Set-Cookie': sessionCookie });
}

async function disconnect(request, env, app, now) {
  const found = await findSession(env, app, request, now);
  if (found) {
    await env.DB.prepare('DELETE FROM sessions WHERE session_hash = ? AND app = ?')
      .bind(found.session_hash, app).run();
  }
  const headers = cors(new Headers({
    ...baseHeaders(), 'Set-Cookie': setCookie(sessionCookieName(app), '', 0),
  }), app, request);
  return new Response(null, { status: 204, headers });
}

export function createWorker({ fetchImpl = fetch, clock = () => Date.now() } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true });
      }
      const path = /^\/v1\/(finapp|garapp)\/(session|token|connect|callback|disconnect)$/.exec(url.pathname);
      if (url.origin !== API_ORIGIN || !path) return json({ error: 'not_found' }, 404);
      const [, app, operation] = path;
      const origin = request.headers.get('Origin');

      if (request.method === 'OPTIONS' && ['session', 'token', 'disconnect'].includes(operation)) {
        if (origin !== APPS[app].origin) return json({ error: 'forbidden_origin' }, 403);
        const headers = cors(new Headers({ ...baseHeaders(),
          'Access-Control-Allow-Methods': operation === 'disconnect' ? 'POST, OPTIONS' : 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '300',
        }), app, request);
        return new Response(null, { status: 204, headers });
      }
      if (['session', 'token', 'disconnect'].includes(operation) && origin !== APPS[app].origin) {
        return json({ error: 'forbidden_origin' }, 403);
      }
      if (operation === 'disconnect' ? request.method !== 'POST' : request.method !== 'GET') {
        return json({ error: 'method_not_allowed' }, 405, app, request);
      }
      const keyBytes = encryptionKey(env);
      if (!keyBytes || typeof env[APPS[app].secret] !== 'string' || !env[APPS[app].secret]) {
        return json({ error: 'temporarily_unavailable' }, 503, app, request);
      }
      const now = Math.floor(clock() / 1000);
      try {
        switch (operation) {
          case 'connect': return await connect(request, env, app, now);
          case 'callback': return await callback(request, env, app, keyBytes, fetchImpl, now);
          case 'session': return await session(request, env, app, now);
          case 'token': return await token(request, env, app, keyBytes, fetchImpl, now);
          case 'disconnect': return await disconnect(request, env, app, now);
          default: return json({ error: 'not_found' }, 404);
        }
      } catch {
        return json({ error: 'temporarily_unavailable' }, 503, app, request);
      }
    },
    async scheduled(_event, env) {
      if (!env?.DB) return;
      const now = Math.floor(clock() / 1000);
      try {
        await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now).run();
        await env.DB.prepare(`
          DELETE FROM sessions WHERE expires_at <= ? OR
            (refresh_expires_at IS NOT NULL AND refresh_expires_at <= ?)
        `).bind(now, now).run();
      } catch {
        // Schema creation and outages are handled by the next scheduled run.
      }
    },
  };
}

export default createWorker();
