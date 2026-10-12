import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const accessCookieName = 'australia2050_access';
const sessionLifetimeSeconds = 8 * 60 * 60;

function configuredPasswordHash() {
  return (process.env.SITE_PASSWORD_HASH ?? '').trim().toLowerCase();
}

function configuredSessionSecret() {
  return process.env.SESSION_SECRET ?? '';
}

function safelyEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload) {
  return createHmac('sha256', configuredSessionSecret()).update(payload).digest('base64url');
}

export function isAccessConfigured() {
  return /^[a-f0-9]{64}$/.test(configuredPasswordHash()) && configuredSessionSecret().length >= 32;
}

export function isPasswordValid(password) {
  if (!isAccessConfigured() || typeof password !== 'string' || password.length > 200) return false;
  const submittedHash = createHash('sha256').update(password.normalize('NFKC')).digest('hex');
  return safelyEqual(submittedHash, configuredPasswordHash());
}

export function createAccessToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ expiresAt: now + sessionLifetimeSeconds * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function isAccessTokenValid(token, now = Date.now()) {
  if (!isAccessConfigured() || typeof token !== 'string') return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !safelyEqual(signature, sign(payload))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(session.expiresAt) && session.expiresAt > now;
  } catch {
    return false;
  }
}

export function readAccessToken(cookieHeader = '') {
  const header = typeof cookieHeader === 'string' ? cookieHeader : '';
  const cookie = header
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${accessCookieName}=`));
  if (!cookie) return '';
  try {
    return decodeURIComponent(cookie.slice(accessCookieName.length + 1));
  } catch {
    return '';
  }
}

export function hasValidAccess(cookieHeader) {
  return isAccessTokenValid(readAccessToken(cookieHeader));
}

export function createAccessCookie(token, secure = true) {
  const attributes = [
    `${accessCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${sessionLifetimeSeconds}`,
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function clearAccessCookie(secure = true) {
  const attributes = [
    `${accessCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}
