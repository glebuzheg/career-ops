// @ts-check
// Habr Career public SSR search. job_boards: provider: habr-career.
// Measured 2026-10-28: /vacancies?q=python returns SSR JSON with vacancies.list
// and vacancies.meta, 25/page. robots.txt allows /vacancies; /v1 is disallowed
// and never requested. Do not call private frontend/response endpoints.
import { fetchTextWithRetry, sleep } from './_http.mjs';
import { htmlToText } from './_html-to-text.mjs';
import { text, monthlySalary, pageBudget, sourceUrl, queryParams } from './_ru-board.mjs';

const HOSTS = ['career.habr.com'];
const FIELDS = ['q', 'type', 'order', 'city_id', 'remote', 'salary', 'currency', 'qid', 'employment_type', 'company_id', 'skills[]'];

function searchSource(raw) {
  const u = sourceUrl(raw, HOSTS, 'habr-career');
  if (!/^(?:\/|\/vacancies\/?)$/.test(u.pathname)) throw new Error('habr-career: use a search URL and habr.company_id for company-scoped searches');
  return u;
}

export function parseHabrPage(html) {
  const blob = /<script\b(?=[^>]*\bdata-ssr-state=["']true["'])[^>]*>([\s\S]*?)<\/script>/i.exec(String(html));
  let state;
  try { state = JSON.parse(blob?.[1] ?? ''); } catch { throw new Error('habr-career: missing or invalid SSR JSON (challenge or changed page)'); }
  const data = state?.vacancies;
  if (!data || !Array.isArray(data.list)) throw new Error('habr-career: unexpected SSR envelope, expected vacancies.list[]');
  const jobs = [];
  for (const row of data.list) {
    if (!row || row.archived || row.hidden || !/^\d+$/.test(String(row.id ?? '')) || !text(row.title)) continue;
    const cities = Array.isArray(row.locations) ? row.locations.map(v => text(v?.title)).filter(Boolean) : [text(row.location?.title)].filter(Boolean);
    const location = [cities.join(', '), row.remoteWork ? 'Remote' : ''].filter(Boolean).join('; ');
    const job = { title: htmlToText(row.title), url: `https://career.habr.com/vacancies/${row.id}`, company: text(row.company?.title) || '?', location };
    // The list normally has no upstream link. When the source provides one,
    // prefer that employer application URL over the board mirror.
    if (typeof row.externalLink === 'string') {
      try { const u = new URL(row.externalLink); if (u.protocol === 'https:' && !u.username && !u.password) job.url = u.href; } catch {}
    }
    const postedAt = Date.parse(row.publishedDate?.date);
    if (Number.isFinite(postedAt)) job.postedAt = postedAt;
    const salary = monthlySalary(row.salary);
    if (salary) job.salary = salary;
    if (job.title) jobs.push(job);
  }
  return { jobs, rawCount: data.list.length, meta: data.meta ?? {} };
}

export default {
  id: 'habr-career',
  detect(entry) {
    try { return { url: searchSource(entry?.careers_url).href }; } catch { return null; }
  },
  async fetch(entry, ctx) {
    const source = entry.api || entry.careers_url;
    const u = source ? searchSource(source) : new URL('https://career.habr.com/vacancies');
    const params = queryParams(u.searchParams, entry.habr, FIELDS, 'habr-career');
    if (!params.has('order')) params.set('order', 'date');
    const limit = pageBudget(entry, ctx, 5, 50);
    const jobs = [], seen = new Set();
    for (let page = 1; page <= limit; page++) {
      if (page > 1) await sleep(500, ctx);
      params.set('page', String(page));
      const html = await fetchTextWithRetry(ctx, `https://career.habr.com/vacancies?${params}`, { redirect: 'error' });
      const parsed = parseHabrPage(html);
      let added = 0;
      for (const job of parsed.jobs) if (!seen.has(job.url)) { seen.add(job.url); jobs.push(job); added++; }
      const perPage = Number.isInteger(parsed.meta.perPage) && parsed.meta.perPage > 0 ? parsed.meta.perPage : 25;
      if (parsed.rawCount < perPage || (Number.isInteger(parsed.meta.totalPages) && page >= parsed.meta.totalPages)) break;
      if (page > 1 && !added && parsed.rawCount) { console.warn('habr-career: repeated page; search incomplete'); break; }
      if (page === limit && ctx.maxPages === undefined) console.warn(`habr-career: search truncated at max_pages=${limit}; narrow the query or raise max_pages`);
    }
    return jobs;
  },
};
