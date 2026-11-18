// Google Play transport. Tokens and service-account keys are never logged or persisted.
const fs = require('node:fs');
const crypto = require('node:crypto');
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const TOKEN = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function assertion(credentials, now = Math.floor(Date.now() / 1000)) {
  if (credentials.type !== 'service_account' || credentials.token_uri !== TOKEN ||
      !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(credentials.client_email || '') ||
      !credentials.private_key || !credentials.private_key_id) {
    throw new Error('Expected a Google service-account credential with the official token endpoint.');
  }
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', typ: 'JWT', kid: credentials.private_key_id })}.${encode({
    iss: credentials.client_email, scope: SCOPE, aud: TOKEN, iat: now, exp: now + 3600 })}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), credentials.private_key).toString('base64url')}`;
}

async function parseResponse(response) {
  if (!response.ok) {
    // Do not echo a server body, request headers or credential into console/CI logs.
    const error = new Error(`Google Play request failed (HTTP ${response.status}). No automatic retry performed.`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? {} : response.json();
}

async function serviceToken(file, fetcher = fetch) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077))) {
    throw new Error('The service-account credential must be a private regular file (mode 600).');
  }
  const jwt = assertion(JSON.parse(fs.readFileSync(file, 'utf8')));
  const result = await parseResponse(await fetcher(TOKEN, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  }));
  if (result.token_type !== 'Bearer' || !result.access_token || /\s/.test(result.access_token)) {
    throw new Error('Google did not return a valid access token.');
  }
  return result.access_token;
}

function client(token, fetcher = fetch) {
  if (!token || /\s/.test(token)) throw new Error('Missing or invalid access token.');
  const request = async (method, route, body, upload = false) => {
    if (!route.startsWith('/applications/') || route.includes('..') || /[\r\n#]/.test(route)) {
      throw new Error('Invalid Google Play request path.');
    }
    const prefix = upload ? 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3' : API;
    return parseResponse(await fetcher(prefix + route, {
      method, redirect: 'error', signal: AbortSignal.timeout(upload ? 180000 : 30000),
      headers: { Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': upload ? 'application/octet-stream' : 'application/json' }) },
      body: body === undefined ? undefined : upload ? body : JSON.stringify(body),
    }));
  };
  return { request, releases: (pkg, track = 'alpha') =>
    request('GET', `/applications/${encodeURIComponent(pkg)}/tracks/${encodeURIComponent(track)}/releases`) };
}
module.exports = { assertion, serviceToken, client, digest };
