// Opt-in, registered-application API integration, not a public crawler.
// SuperJob documents X-Api-App-Id at https://api.superjob.ru/. It requires
// the application's secret on each request; no applicant OAuth is needed for
// vacancy search. This plugin never reads resumes or sends applications.
import { htmlToText } from '../../providers/_html-to-text.mjs';
import { monthlySalary, pageBudget, queryParams, sourceUrl, text } from '../../providers/_ru-board.mjs';
import { sleep } from '../../providers/_http.mjs';

const FIELDS = ['keyword', 'town', 'catalogues', 'experience', 'type_of_work', 'payment_from', 'payment_to', 'no_agreement', 'period', 'order_field', 'order_direction', 'client'];

export function normalizeSuperJob(row) {
  if (!row || !/^\d+$/.test(String(row.id ?? '')) || !text(row.profession) || row.is_archive) return null;
  let url;
  try { url = sourceUrl(row.link, ['superjob.ru', 'www.superjob.ru'], 'superjob').href; } catch { return null; }
  const job = { title: htmlToText(row.profession), url, company: text(row.firm_name) || text(row.client?.title) || '?', location: text(row.town?.title) };
  const description = htmlToText(row.vacancyRichText || row.candidat);
  if (description) job.description = description;
  const postedAt = typeof row.date_published === 'number' ? row.date_published * 1000 : NaN;
  if (Number.isFinite(postedAt) && postedAt > 0) job.postedAt = postedAt;
  const salary = monthlySalary({ from: row.payment_from, to: row.payment_to, currency: row.currency });
  if (salary) job.salary = salary;
  return job.title ? job : null;
}

export default {
  provider: {
    id: 'superjob',
    fetch: async (entry, ctx) => {
      const key = ctx.env?.SUPERJOB_APP_KEY;
      if (!key) throw new Error('superjob: set SUPERJOB_APP_KEY in .env (register at api.superjob.ru)');
      if (entry.api || entry.careers_url) sourceUrl(entry.api || entry.careers_url, ['api.superjob.ru', 'superjob.ru', 'www.superjob.ru'], 'superjob');
      const params = queryParams([], entry.superjob, FIELDS, 'superjob');
      params.set('count', '100');
      if (!params.has('order_field')) params.set('order_field', 'date');
      if (!params.has('order_direction')) params.set('order_direction', 'desc');
      const limit = pageBudget(entry, ctx, 3, 20);
      const jobs = [], seen = new Set();
      for (let page = 0; page < limit; page++) {
        if (page) await sleep(500, ctx);
        params.set('page', String(page));
        // Do not retry authentication errors or expose a raw error body/key.
        const data = await ctx.fetchJson(`https://api.superjob.ru/2.0/vacancies/?${params}`, { headers: { 'X-Api-App-Id': key }, redirect: 'error' });
        if (!data || !Array.isArray(data.objects) || data.error) throw new Error('superjob: unexpected response, expected objects[]; check application access');
        let added = 0;
        for (const row of data.objects) {
          const job = normalizeSuperJob(row);
          if (job && !seen.has(job.url)) { seen.add(job.url); jobs.push(job); added++; }
        }
        if (!data.more || data.objects.length < 100) break;
        if (page > 0 && !added) { ctx.log?.('superjob: repeated page; search incomplete'); break; }
        if (page + 1 === limit && ctx.maxPages === undefined) ctx.log?.(`superjob: search truncated at max_pages=${limit}; narrow the query`);
      }
      return jobs;
    },
  },
};
