import { test } from 'node:test';
import assert from 'node:assert/strict';
import hh from '../../providers/hh.mjs';

const row = (id = '123') => ({ id, name: 'Python &amp; Go разработчик', employer: { name: 'Acme' },
  area: { name: 'Москва' }, snippet: { requirement: '<highlighttext>Python</highlighttext>', responsibility: 'API' },
  published_at: '2026-10-28T10:00:00+03:00', salary: { from: 100000, to: 200000, currency: 'RUR' } });
const page = (items = [row()], pages = 1) => ({ items, pages, found: 1, per_page: 100, page: 0 });
const ctx = (fn, more = {}) => ({ fetchJson: fn, sleep: async () => {}, ...more });

test('hh detects only HTTPS HH hosts and tolerates junk', () => {
  assert.equal(hh.id, 'hh');
  for (const careers_url of ['https://hh.ru/search/vacancy?text=python', 'https://api.hh.ru/vacancies']) assert.ok(hh.detect({ careers_url }));
  for (const entry of [null, {}, { careers_url: 1 }, { careers_url: 'http://hh.ru' }, { careers_url: 'https://hh.ru.evil.test' }]) assert.equal(hh.detect(entry), null);
});
test('hh normalizes source fields, annual salary, snippet and date; drops invalid rows', async () => {
  const jobs = await hh.fetch({ hh: { text: 'питон', area: 113 } }, ctx(async (url, opts) => {
    const u = new URL(url); assert.equal(u.origin, 'https://api.hh.ru'); assert.equal(u.searchParams.get('text'), 'питон');
    assert.equal(u.searchParams.get('area'), '113'); assert.equal(opts.redirect, 'error');
    return page([row(), null, { ...row('2'), name: '' }, row('\uD800')]);
  }));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Python & Go разработчик'); assert.equal(jobs[0].company, 'Acme');
  assert.equal(jobs[0].url, 'https://hh.ru/vacancy/123'); assert.equal(jobs[0].location, 'Москва');
  assert.equal(jobs[0].description, 'Python API'); assert.deepEqual(jobs[0].salary, { min: 1200000, max: 2400000, currency: 'RUB' });
  assert.equal(jobs[0].postedAt, Date.parse('2026-10-28T10:00:00+03:00'));
});
test('hh uses supported search URL parameters and never follows a config origin', async () => {
  let called = 0;
  for (const url of ['https://evil.test/vacancies', 'http://hh.ru', 'https://hh.ru:9443/search/vacancy']) {
    await assert.rejects(hh.fetch({ careers_url: url }, ctx(async () => { called++; })), /hh/);
  }
  assert.equal(called, 0);
  await hh.fetch({ careers_url: 'https://hh.ru/search/vacancy?text=Go&area=1' }, ctx(async url => {
    assert.equal(new URL(url).searchParams.get('text'), 'Go'); return page([]);
  }));
});
test('hh distinguishes empty results from broken/API-error envelopes', async () => {
  assert.deepEqual(await hh.fetch({}, ctx(async () => page([]))), []);
  for (const data of [null, '', {}, { items: null }, { errors: [{ type: 'forbidden' }] }]) {
    await assert.rejects(hh.fetch({}, ctx(async () => data)), /hh/);
  }
});
test('hh bounds pages, deduplicates results, cooperates with probes and preserves errors', async () => {
  let calls = 0;
  const jobs = await hh.fetch({ max_pages: 2 }, ctx(async (url, opts) => {
    assert.equal(opts.redirect, 'error'); assert.equal(Number(new URL(url).searchParams.get('page')), calls++);
    return { ...page([row('1'), row(String(calls + 1))], 100), per_page: 2, found: 200 };
  }));
  assert.equal(calls, 2); assert.equal(jobs.length, 3);
  calls = 0;
  await hh.fetch({}, ctx(async () => { calls++; return { ...page([row()], 100), per_page: 1 }; }, { maxPages: 1 }));
  assert.equal(calls, 1);
  const error = Object.assign(new Error('probe stop'), { status: 403 });
  await assert.rejects(hh.fetch({}, ctx(async () => { throw error; }, { maxPages: 1 })), e => e === error);
});

test('hh default budget bounds a healthy large result and retries a transient later page', async () => {
  let calls = 0, pageOneAttempts = 0;
  const jobs = await hh.fetch({}, ctx(async url => {
    calls++; const n = Number(new URL(url).searchParams.get('page'));
    if (n === 1 && pageOneAttempts++ === 0) throw Object.assign(new Error('temporary'), { status: 503 });
    return { items: [row(String(n + 1))], per_page: 1, pages: 100, found: 100 };
  }));
  assert.equal(calls, 6); assert.equal(jobs.length, 5);
});

test('hh never turns an employer or individual vacancy URL into an unscoped global scan', async () => {
  for (const careers_url of ['https://hh.ru/employer/15478', 'https://hh.ru/vacancy/123', 'https://api.hh.ru/employers/15478/vacancies']) {
    assert.equal(hh.detect({ careers_url }), null);
    let calls = 0;
    await assert.rejects(hh.fetch({ careers_url }, ctx(async () => { calls++; return page(); })), /hh.*search/i);
    assert.equal(calls, 0);
  }
});

test('hh preserves legacy and current remote work metadata alongside the city', async () => {
  for (const remote of [{ schedule: { id: 'remote' } }, { work_format: [{ id: 'REMOTE' }] }]) {
    const jobs = await hh.fetch({}, ctx(async () => page([{ ...row(), ...remote }])));
    assert.equal(jobs[0].location, 'Москва; Remote');
  }
});
