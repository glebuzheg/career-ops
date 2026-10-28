// @ts-check
// HeadHunter public search API. job_boards: provider: hh, hh: {text, area, ...}.
// API docs: https://api.hh.ru/openapi/redoc#tag/Poisk-vakansij
// The API can deny traffic from some locations (403); never interpret that as
// no vacancies or fall back to scraping/challenge bypasses.
import { fetchJsonWithRetry, sleep } from './_http.mjs';
import { htmlToText } from './_html-to-text.mjs';
import { text, monthlySalary, pageBudget, sourceUrl, queryParams } from './_ru-board.mjs';

const HOSTS = ['hh.ru', 'www.hh.ru', 'api.hh.ru'];
const FIELDS = ['text', 'area', 'experience', 'employment', 'schedule', 'professional_role', 'employer_id', 'salary', 'currency', 'only_with_salary', 'period', 'date_from', 'date_to', 'search_field', 'order_by'];

function searchSource(raw) {
  const u = sourceUrl(raw, HOSTS, 'hh');
  const allowed = u.hostname === 'api.hh.ru' ? /^\/vacancies\/?$/ : /^(?:\/|\/search\/vacancy\/?)$/;
  if (!allowed.test(u.pathname)) throw new Error('hh: use a search URL and hh.employer_id for company-scoped searches');
  return u;
}

export function normalizeHHJob(row) {
  if (!row || row.archived || !/^\d+$/.test(String(row.id ?? '')) || !text(row.name)) return null;
  const remote = row.schedule?.id === 'remote' || (Array.isArray(row.work_format) && row.work_format.some(v => v?.id === 'REMOTE'));
  const job = { title: htmlToText(row.name), url: `https://hh.ru/vacancy/${row.id}`,
    company: text(row.employer?.name) || '?', location: [text(row.area?.name), remote ? 'Remote' : ''].filter(Boolean).join('; ') };
  const description = htmlToText([row.snippet?.requirement, row.snippet?.responsibility].filter(v => typeof v === 'string').join(' '));
  if (description) job.description = description;
  const postedAt = Date.parse(row.published_at);
  if (Number.isFinite(postedAt)) job.postedAt = postedAt;
  const salary = monthlySalary(row.salary);
  if (salary) job.salary = salary;
  return job.title ? job : null;
}

export default {
  id: 'hh',
  detect(entry) {
    try { const u = searchSource(entry?.api || entry?.careers_url); return { url: u.href }; }
    catch { return null; }
  },
  async fetch(entry, ctx) {
    const raw = entry.api || entry.careers_url;
    const source = raw ? searchSource(raw) : new URL('https://api.hh.ru/vacancies');
    const params = queryParams(source.searchParams, entry.hh, FIELDS, 'hh');
    if (!params.has('order_by')) params.set('order_by', 'publication_time');
    params.set('per_page', '100');
    const limit = pageBudget(entry, ctx, 5, 20);
    const jobs = [], seen = new Set();
    for (let page = 0; page < limit; page++) {
      if (page) await sleep(300, ctx);
      params.set('page', String(page));
      const data = await fetchJsonWithRetry(ctx, `https://api.hh.ru/vacancies?${params}`, { redirect: 'error' });
      if (!data || !Array.isArray(data.items) || data.errors) throw new Error('hh: unexpected response, expected items[]');
      let added = 0;
      for (const row of data.items) {
        const job = normalizeHHJob(row);
        if (job && !seen.has(job.url)) { seen.add(job.url); jobs.push(job); added++; }
      }
      const perPage = Number.isInteger(data.per_page) && data.per_page > 0 ? data.per_page : 100;
      if (data.items.length < perPage || (Number.isInteger(data.pages) && page + 1 >= data.pages)) break;
      if (page > 0 && !added && data.items.length) { console.warn('hh: repeated page; search incomplete'); break; }
      if (page + 1 === limit && ctx.maxPages === undefined) console.warn(`hh: search truncated at max_pages=${limit}; narrow the query or raise max_pages (API maximum 2000 results)`);
    }
    return jobs;
  },
};
