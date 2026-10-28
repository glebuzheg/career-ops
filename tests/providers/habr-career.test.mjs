import { test } from 'node:test';
import assert from 'node:assert/strict';
import habr, { parseHabrPage } from '../../providers/habr-career.mjs';

const row = (id = 123) => ({ id, href: `/vacancies/${id}`, title: 'Разработчик &amp; Go', company: { title: 'Acme' },
  locations: [{ title: 'Москва' }, { title: 'Казань' }], remoteWork: true, publishedDate: { date: '2026-10-28T10:00:00Z' },
  salary: { from: 100000, to: null, currency: 'rur' }, skills: [{ title: 'Go' }] });
const html = (list = [row()], meta = { currentPage: 1, totalPages: 1, perPage: 25 }) => `<html><script type="application/json" data-ssr-state="true">${JSON.stringify({ vacancies: { list, meta } })}</script></html>`;

test('habr normalizes the real SSR envelope and source metadata', () => {
  const { jobs } = parseHabrPage(html([row(), null, { ...row(2), title: '' }, { ...row(3), archived: true }]));
  assert.equal(jobs.length, 1); assert.equal(jobs[0].url, 'https://career.habr.com/vacancies/123');
  assert.equal(jobs[0].title, 'Разработчик & Go'); assert.equal(jobs[0].company, 'Acme');
  assert.equal(jobs[0].location, 'Москва, Казань; Remote');
  assert.deepEqual(jobs[0].salary, { min: 1200000, currency: 'RUB' });
  assert.equal(jobs[0].postedAt, Date.parse('2026-10-28T10:00:00Z'));
});
test('habr empty SSR list is empty; challenge/missing/wrong envelope throws', () => {
  assert.equal(parseHabrPage(html([])).jobs.length, 0);
  for (const s of ['', '<html>Challenge</html>', '<a href="/vacancies/123">x</a>', '<script data-ssr-state="true">{}</script>', '<script data-ssr-state="true">bad</script>']) assert.throws(() => parseHabrPage(s), /habr-career/);
});
test('habr detects landing and search URLs and rejects untrusted inputs before HTTP', async () => {
  assert.equal(habr.id, 'habr-career');
  for (const u of ['https://career.habr.com', 'https://career.habr.com/vacancies?q=Go']) assert.ok(habr.detect({ careers_url: u }));
  for (const e of [null, {}, { careers_url: 2 }, { careers_url: 'http://career.habr.com' }, { careers_url: 'https://career.habr.com.evil.test' }]) assert.equal(habr.detect(e), null);
  let calls = 0;
  await assert.rejects(habr.fetch({ careers_url: 'https://evil.test/vacancies' }, { fetchText: async () => { calls++; } }), /habr-career/);
  assert.equal(calls, 0);
});
test('habr walks configured/probe budgets, carries filters and deduplicates', async () => {
  let calls = 0;
  const ctx = { sleep: async () => {}, fetchText: async (url, opts) => {
    const u = new URL(url); assert.equal(u.origin, 'https://career.habr.com'); assert.equal(u.pathname, '/vacancies');
    assert.equal(u.searchParams.get('q'), 'питон'); assert.equal(opts.redirect, 'error');
    calls++; return html([row(calls), row(10)], { currentPage: calls, totalPages: 20, perPage: 2 });
  } };
  const jobs = await habr.fetch({ habr: { q: 'питон' }, max_pages: 2 }, ctx);
  assert.equal(calls, 2); assert.equal(jobs.length, 3);
  calls = 0; await habr.fetch({ habr: { q: 'питон' } }, { ...ctx, maxPages: 1 }); assert.equal(calls, 1);
  const error = Object.assign(new Error('probe budget'), { status: 403 });
  await assert.rejects(habr.fetch({}, { maxPages: 1, fetchText: async () => { throw error; } }), e => e === error);
});

test('habr default budget bounds a large board and keeps canonical upstream employer links', async () => {
  let calls = 0;
  const jobs = await habr.fetch({}, { sleep: async () => {}, fetchText: async () => {
    calls++; return html([{ ...row(calls), externalLink: `https://careers.example.com/jobs/${calls}` }], { currentPage: calls, totalPages: 100, perPage: 1 });
  } });
  assert.equal(calls, 5); assert.equal(jobs.length, 5);
  assert.equal(jobs[0].url, 'https://careers.example.com/jobs/1');
});

test('habr never turns a company careers page or detail URL into an unscoped global scan', async () => {
  for (const careers_url of ['https://career.habr.com/companies/acme/vacancies', 'https://career.habr.com/vacancies/123']) {
    assert.equal(habr.detect({ careers_url }), null);
    let calls = 0;
    await assert.rejects(habr.fetch({ careers_url }, { fetchText: async () => { calls++; return html(); } }), /habr-career.*search/i);
    assert.equal(calls, 0);
  }
});
