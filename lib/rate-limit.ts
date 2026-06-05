import { NextRequest, NextResponse } from 'next/server';

export type RateLimitRule = {
  prefix: string;
  methods?: string[];
  max: number;
  windowMs: number;
};

/** Routes API sensibles — ordre important (préfixes les plus spécifiques en premier). */
export const SENSITIVE_API_RATE_LIMITS: RateLimitRule[] = [
  { prefix: '/api/auth/login',        methods: ['POST'], max: 5,   windowMs: 15 * 60 * 1000 },
  { prefix: '/api/sellsy-sync/cron',  methods: ['POST'], max: 10,  windowMs: 60 * 60 * 1000 },
  { prefix: '/api/sellsy-sync',       methods: ['POST'], max: 2,   windowMs: 60 * 60 * 1000 },
  { prefix: '/api/extraction',        methods: ['POST'], max: 20,  windowMs: 60 * 1000 },
  { prefix: '/api/planification',     methods: ['POST'], max: 30,  windowMs: 60 * 1000 },
  { prefix: '/api/users',             max: 60,  windowMs: 60 * 1000 },
  { prefix: '/api/sellsy-test',       max: 30,  windowMs: 60 * 1000 },
  { prefix: '/api/telechargement/',   max: 120, windowMs: 60 * 1000 },
];

type Entry = { count: number; resetAt: number };

const stores = new Map<string, Map<string, Entry>>();

function getStore(namespace: string): Map<string, Entry> {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  return store;
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function rateLimitKey(routePrefix: string, ip: string): string {
  return `${routePrefix}:${ip}`;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export function checkRateLimit(
  key: string,
  opts: { max: number; windowMs: number; namespace?: string },
): RateLimitResult {
  const store = getStore(opts.namespace ?? 'api');
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true };
  }

  if (entry.count >= opts.max) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

export function resetRateLimit(key: string, namespace = 'api'): void {
  getStore(namespace).delete(key);
}

export function rateLimitResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: 'Trop de requêtes. Réessayez plus tard.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

export function findRateLimitRule(pathname: string, method: string): RateLimitRule | undefined {
  return SENSITIVE_API_RATE_LIMITS.find(rule => {
    if (!pathname.startsWith(rule.prefix)) return false;
    if (rule.methods && !rule.methods.includes(method)) return false;
    return true;
  });
}

export function enforceRateLimit(req: NextRequest): NextResponse | null {
  const rule = findRateLimitRule(req.nextUrl.pathname, req.method);
  if (!rule) return null;

  const ip = getClientIp(req);
  const key = rateLimitKey(rule.prefix, ip);
  const result = checkRateLimit(key, { max: rule.max, windowMs: rule.windowMs });

  if (!result.allowed) {
    return rateLimitResponse(result.retryAfterSec);
  }

  return null;
}
