// Small shared normalization/config helpers for Russian-market sources.
export function text(value) { return typeof value === 'string' ? value.trim() : ''; }

export function monthlySalary(raw) {
  if (!raw || typeof raw !== 'object' || !text(raw.currency)) return undefined;
  const currency = raw.currency.toUpperCase() === 'RUR' ? 'RUB' : raw.currency.toUpperCase();
  const salary = { currency };
  if (typeof raw.from === 'number' && Number.isFinite(raw.from) && raw.from > 0) salary.min = raw.from * 12;
  if (typeof raw.to === 'number' && Number.isFinite(raw.to) && raw.to > 0) salary.max = raw.to * 12;
  return salary.min || salary.max ? salary : undefined;
}

export function pageBudget(entry, ctx, fallback = 5, ceiling = 20) {
  const n = entry.max_pages ?? fallback;
  if (!Number.isInteger(n) || n < 1 || n > ceiling) throw new Error(`max_pages must be an integer from 1 to ${ceiling}`);
  if (ctx.maxPages !== undefined && (!Number.isInteger(ctx.maxPages) || ctx.maxPages < 1)) throw new Error('maxPages must be a positive integer');
  return Math.min(n, ctx.maxPages ?? n);
}

export function sourceUrl(raw, hosts, label) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || !hosts.includes(u.hostname) || u.port || u.username || u.password) throw new Error(`${label}: untrusted source URL`);
  return u;
}

// Only source-documented search fields are forwarded. Never forward arbitrary
// config keys (credentials, URL overrides, page budgets) to a public API.
export function queryParams(base, config, allowed, label) {
  const params = new URLSearchParams();
  for (const [key, value] of base) if (allowed.includes(key)) params.append(key, value);
  if (config == null) return params;
  if (typeof config !== 'object' || Array.isArray(config)) throw new Error(`${label}: search config must be an object`);
  for (const [key, value] of Object.entries(config)) {
    if (!allowed.includes(key)) throw new Error(`${label}: unsupported search parameter ${key}`);
    params.delete(key);
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!['string', 'number', 'boolean'].includes(typeof item)) throw new Error(`${label}: invalid ${key}`);
      params.append(key, String(item));
    }
  }
  return params;
}
