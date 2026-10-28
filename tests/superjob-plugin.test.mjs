import { test } from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugins/superjob/index.mjs';

const job = (id = 123) => ({ id, profession: 'Разработчик Python', firm_name: 'Acme', town: { title: 'Москва' },
  link: `https://www.superjob.ru/vakansii/python-${id}.html`, vacancyRichText: '<p>Python &amp; Go</p>',
  payment_from: 100000, payment_to: 0, currency: 'rub', date_published: 1793178000 });
test('SuperJob sends app key only to the official API and normalizes records', async () => {
  const rows = await plugin.provider.fetch({ superjob: { keyword: 'питон', town: 4 } }, {
    env: { SUPERJOB_APP_KEY: 'fixture-secret' }, sleep: async () => {}, fetchJson: async (url, opts) => {
      const u = new URL(url); assert.equal(u.origin, 'https://api.superjob.ru'); assert.equal(u.pathname, '/2.0/vacancies/');
      assert.equal(u.searchParams.get('keyword'), 'питон'); assert.equal(u.searchParams.get('town'), '4');
      assert.equal(opts.headers['X-Api-App-Id'], 'fixture-secret');
      return { objects: [job(), null, { profession: 'Missing ID' }], more: false, total: 1 };
    },
  });
  assert.equal(rows.length, 1); assert.equal(rows[0].company, 'Acme'); assert.equal(rows[0].location, 'Москва');
  assert.equal(rows[0].description, 'Python & Go'); assert.deepEqual(rows[0].salary, { min: 1200000, currency: 'RUB' });
});
test('SuperJob requires a key and rejects arbitrary configured URLs before a call', async () => {
  let calls = 0; const ctx = { env: {}, fetchJson: async () => { calls++; } };
  await assert.rejects(plugin.provider.fetch({}, ctx), /SUPERJOB_APP_KEY/);
  await assert.rejects(plugin.provider.fetch({ api: 'https://evil.test' }, { ...ctx, env: { SUPERJOB_APP_KEY: 'x' } }), /superjob/);
  assert.equal(calls, 0);
});
test('SuperJob bounds/probes pagination, deduplicates, and reports broken envelopes', async () => {
  let calls = 0;
  const ctx = { env: { SUPERJOB_APP_KEY: 'x' }, sleep: async () => {}, fetchJson: async url => {
    assert.equal(Number(new URL(url).searchParams.get('page')), calls++);
    return { objects: Array.from({ length: 100 }, (_, i) => job(i)), more: true, total: 1000 };
  } };
  assert.equal((await plugin.provider.fetch({ max_pages: 2 }, ctx)).length, 100); assert.equal(calls, 2);
  calls = 0; await plugin.provider.fetch({}, { ...ctx, maxPages: 1 }); assert.equal(calls, 1);
  for (const data of [null, {}, { error: { message: 'denied' } }, { objects: null }]) await assert.rejects(plugin.provider.fetch({}, { ...ctx, fetchJson: async () => data }), /superjob/);
  assert.deepEqual(await plugin.provider.fetch({}, { ...ctx, fetchJson: async () => ({ objects: [], more: false }) }), []);
});
