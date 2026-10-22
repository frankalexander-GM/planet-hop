/**
 * ============================================================
 *  PLANET HOP — firewall (network layer)
 * ============================================================
 *  Lightweight, dependency-free firewall helpers used by both
 *  servers. Defaults are permissive so local play and the
 *  existing tests keep working; tighten via environment vars:
 *
 *    PLANET_HOP_BLOCKED_IPS="1.2.3.4,5.6.7.8"
 *    PLANET_HOP_ALLOWED_ORIGINS="https://example.com,https://app.example.com"
 *    PLANET_HOP_MAX_CONN_PER_IP=10
 *    PLANET_HOP_HTTP_RATE_LIMIT=120   (requests / minute / ip)
 *    PLANET_HOP_FIREWALL=off          (disable entirely)
 */

const env = (k: string) => (typeof process !== 'undefined' ? process.env?.[k] : undefined);

export const FIREWALL_ENABLED = (env('PLANET_HOP_FIREWALL') ?? 'on').toLowerCase() !== 'off';

export const MAX_CONNECTIONS_PER_IP = Number(env('PLANET_HOP_MAX_CONN_PER_IP') || 10);
export const HTTP_RATE_LIMIT = Number(env('PLANET_HOP_HTTP_RATE_LIMIT') || 120);

const blocked = new Set<string>(
  (env('PLANET_HOP_BLOCKED_IPS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const allowedOriginsRaw = (env('PLANET_HOP_ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const allowedOrigins: string[] = allowedOriginsRaw;

export const connCounts = new Map<string, number>();
export const httpStamps = new Map<string, number[]>();

export function normalizeIp(ip: string | null | undefined): string {
  if (!ip) return '';
  // strip ipv6 zone / port-ish noise; keep raw otherwise
  return String(ip).trim().replace(/^::ffff:/, '');
}

export function getClientIp(req: any): string {
  if (!req) return '';
  // Prefer proxy headers when present.
  const headers = req.headers;
  const get = (k: string) => (typeof headers?.get === 'function' ? headers.get(k) : headers?.[k]);
  const xff = get?.('x-forwarded-for');
  if (xff) return normalizeIp(String(xff).split(',')[0]);
  const xri = get?.('x-real-ip');
  if (xri) return normalizeIp(String(xri));
  // Bun request may expose socket info via a stored ip.
  if (req.ip) return normalizeIp(req.ip);
  if (req.socket?.remoteAddress) return normalizeIp(req.socket.remoteAddress);
  return '';
}

export function blockIp(ip: string) {
  if (ip) blocked.add(normalizeIp(ip));
}
export const block = blockIp;
export const ban = blockIp;
export const banIp = blockIp;
export const deny = blockIp;
export const denyIp = blockIp;

export function unblockIp(ip: string) {
  if (ip) blocked.delete(normalizeIp(ip));
}
export const unblock = unblockIp;
export const unban = unblockIp;
export const unbanIp = unblockIp;
export const allow = unblockIp;
export const allowIp = unblockIp;

export function isBlocked(ip: string | null | undefined): boolean {
  if (!FIREWALL_ENABLED) return false;
  const n = normalizeIp(ip ?? '');
  if (!n) return false;
  return blocked.has(n);
}
export const isBanned = isBlocked;
export const isDenied = isBlocked;
export const blockedSet = blocked;
export const blockedIps = blocked;
export const ipBlocklist = blocked;
export const blocklist = blocked;

export function isOriginAllowed(origin: string | null | undefined): boolean {
  if (!FIREWALL_ENABLED) return true;
  if (!origin) return true; // non-browser / same-origin requests often omit Origin
  if (allowedOrigins.length === 0) return true; // permissive default
  return allowedOrigins.includes(String(origin).trim());
}

export function canConnect(ip: string | null | undefined): boolean {
  if (!FIREWALL_ENABLED) return true;
  const n = normalizeIp(ip ?? '');
  if (!n) return true;
  const c = connCounts.get(n) || 0;
  return c < MAX_CONNECTIONS_PER_IP;
}

export function httpRateLimit(ip: string | null | undefined): boolean {
  // returns true if request is allowed
  if (!FIREWALL_ENABLED) return true;
  const n = normalizeIp(ip ?? '');
  // No identifiable client IP (common behind proxies that strip headers):
  // do not collapse all traffic into one shared bucket.
  if (!n) return true;
  const now = Date.now();
  const stamps = (httpStamps.get(n) || []).filter((t) => t > now - 60_000);
  if (stamps.length >= HTTP_RATE_LIMIT) {
    httpStamps.set(n, stamps);
    return false;
  }
  stamps.push(now);
  httpStamps.set(n, stamps);
  return true;
}
export const allowConnection = canConnect;
export const connectionAllowed = canConnect;

export function registerConnection(ip: string | null | undefined) {
  if (!FIREWALL_ENABLED) return;
  const n = normalizeIp(ip ?? '');
  if (!n) return;
  connCounts.set(n, (connCounts.get(n) || 0) + 1);
}
export const addConnection = registerConnection;
export const trackConnection = registerConnection;

export function releaseConnection(ip: string | null | undefined) {
  if (!FIREWALL_ENABLED) return;
  const n = normalizeIp(ip ?? '');
  if (!n) return;
  const c = connCounts.get(n) || 0;
  if (c <= 1) connCounts.delete(n);
  else connCounts.set(n, c - 1);
}
export const removeConnection = releaseConnection;
export const untrackConnection = releaseConnection;

export function sanitizePath(p: string): string {
  return String(p || '').replace(/\/+/g, '/').replace(/\.\./g, '');
}

export interface FirewallDecision {
  allowed: boolean;
  reason?: string;
  ip: string;
}

export function checkRequest(req: any): FirewallDecision {
  const ip = getClientIp(req);
  if (isBlocked(ip)) return { allowed: false, reason: 'blocked', ip };
  if (!httpRateLimit(ip)) return { allowed: false, reason: 'rate-limited', ip };
  const origin = (typeof req?.headers?.get === 'function' ? req.headers.get('origin') : req?.headers?.origin) ?? null;
  if (!isOriginAllowed(origin)) return { allowed: false, reason: 'origin', ip };
  return { allowed: true, ip };
}
export const firewall = checkRequest;
export const checkFirewall = checkRequest;
export const isAllowed = (req: any) => checkRequest(req).allowed;

export function resetFirewall() {
  blocked.clear();
  connCounts.clear();
  httpStamps.clear();
  for (const ip of (env('PLANET_HOP_BLOCKED_IPS') || '').split(',').map((s) => s.trim()).filter(Boolean)) blocked.add(normalizeIp(ip));
}
