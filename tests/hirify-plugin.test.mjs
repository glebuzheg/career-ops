import { test } from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugins/hirify/index.mjs';

// Protocol fixtures exercise the real plugin end to end with only the remote
// HTTP boundary replaced. Tool names/schema are advertised, never assumed.
function server({ sse = false, tool = {}, payload, responseError, env = {}, settings = {} } = {}) {
  const calls = [];
  const ctx = { env: { HIRIFY_MCP_URL: 'https://api.hirify.me/mcp', HIRIFY_KEY: 'test-key', ...env }, settings,
    sleep: async () => {}, log: () => {}, fetch: async (url, opts) => {
      assert.equal(url, 'https://api.hirify.me/mcp'); assert.equal(opts.headers.Authorization, 'Bearer test-key');
      const msg = JSON.parse(opts.body); calls.push(msg);
      if (msg.method !== 'initialize') assert.equal(opts.headers['Mcp-Session-Id'], 'session-fixture');
      if (msg.method === 'notifications/initialized') return new Response(null, { status: 202 });
      let result;
      if (msg.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'Hirify fixture', version: '1' } };
      else if (msg.method === 'tools/list') result = { tools: [{ name: 'hirify_search_vacancies', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { search: { type: 'string' }, page: { type: 'integer' }, per_page: { type: 'integer' } }, required: ['search'] }, ...tool }] };
      else if (msg.method === 'tools/call') result = payload ?? { structuredContent: { data: [{ slug: 'python-123', title: 'Разработчик', company: 'Acme', url: 'https://hirify.me/vacancies/python-123', location: 'Москва' }], meta: { last_page: 1 } } };
      else assert.fail(`unexpected MCP method ${msg.method}`);
      const body = { jsonrpc: '2.0', id: msg.id, ...(responseError && msg.method === 'tools/call' ? { error: responseError } : { result }) };
      return new Response(sse ? `event: message\ndata: ${JSON.stringify(body)}\n\n` : JSON.stringify(body), {
        headers: { 'content-type': sse ? 'text/event-stream' : 'application/json', 'Mcp-Session-Id': 'session-fixture' },
      });
    } };
  return { ctx, calls };
}
test('Hirify initializes MCP, discovers read-only search and imports jobs for Cyrillic queries', async () => {
  const { ctx, calls } = server();
  const jobs = await plugin.provider.fetch({ hirify: { query: 'разработчик' } }, ctx);
  assert.equal(jobs.length, 1); assert.equal(jobs[0].title, 'Разработчик'); assert.equal(jobs[0].company, 'Acme');
  assert.deepEqual(calls.map(m => m.method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  assert.equal(calls[3].params.name, 'hirify_search_vacancies'); assert.equal(calls[3].params.arguments.search, 'разработчик');
});
test('Hirify accepts SSE text tool results and empty data without claiming broken responses are empty', async () => {
  const { ctx } = server({ sse: true, payload: { content: [{ type: 'text', text: JSON.stringify({ data: [], meta: { last_page: 1 } }) }] } });
  assert.deepEqual(await plugin.provider.fetch({ hirify: { query: 'Go' } }, ctx), []);
  for (const payload of [{ structuredContent: {} }, { content: [{ type: 'text', text: 'not JSON' }] }, { isError: true, content: [] }]) {
    const { ctx: bad } = server({ payload }); await assert.rejects(plugin.provider.fetch({ hirify: { query: 'Go' } }, bad), /hirify/);
  }
});
test('Hirify rejects mutation/ambiguous tools, missing required arguments and unsafe endpoints', async () => {
  for (const tool of [{ annotations: { readOnlyHint: false } }, { name: 'hirify_apply' }, { inputSchema: { type: 'object', properties: {}, required: ['unknown_field'] } }]) {
    const { ctx, calls } = server({ tool });
    await assert.rejects(plugin.provider.fetch({ hirify: { query: 'Go' } }, ctx), /hirify/);
    assert.equal(calls.some(m => m.method === 'tools/call'), false);
  }
  for (const url of ['https://evil.test/mcp', 'http://api.hirify.me/mcp', 'https://api.hirify.me:9443/mcp', 'https://api.hirify.me/account/mcp-api']) {
    let calls = 0;
    await assert.rejects(plugin.provider.fetch({ hirify: { query: 'Go' } }, { env: { HIRIFY_MCP_URL: url }, settings: {}, fetch: async () => { calls++; } }), /hirify/);
    assert.equal(calls, 0);
  }
});
test('Hirify reports MCP errors without reflecting potentially sensitive remote messages', async () => {
  const { ctx } = server({ responseError: { code: -32001, message: 'test-key' } });
  await assert.rejects(plugin.provider.fetch({ hirify: { query: 'Go' } }, ctx), e => /hirify/.test(e.message) && !e.message.includes('test-key'));
});
test('Hirify respects page/probe budget and does not run metered reads or reveal', async () => {
  const { ctx, calls } = server({ payload: { structuredContent: { data: [{ title: 'Go', company: 'Acme', url: 'https://hirify.me/vacancies/1' }], meta: { last_page: 10 } } } });
  await plugin.provider.fetch({ hirify: { query: 'Go' }, max_pages: 2 }, { ...ctx, maxPages: 1 });
  assert.equal(calls.filter(m => m.method === 'tools/call').length, 1);
  assert.equal(calls.find(m => m.method === 'tools/call').params.name, 'hirify_search_vacancies');
});

test('Hirify imports real CLI-shaped slug-only cards using the verified public /jobs route', async () => {
  const { ctx } = server({ payload: { structuredContent: { data: [
    { slug: '123-python-developer', title: 'Python', company: 'Acme', remote_type: 'remote' },
    { slug: '\uD800', title: 'Bad slug' },
    { title: 'Missing identity' },
  ], meta: { last_page: 1 } } } });
  const jobs = await plugin.provider.fetch({ hirify: { query: 'Python' } }, ctx);
  assert.equal(jobs.length, 1); assert.equal(jobs[0].url, 'https://hirify.me/jobs/123-python-developer');
  assert.equal(jobs[0].location, 'Remote');
});

test('Hirify cancels an open SSE response immediately after its matching result', async () => {
  const { ctx } = server(); let cancelled = false;
  const original = ctx.fetch;
  ctx.fetch = async (url, opts) => {
    const response = await original(url, opts); const msg = JSON.parse(opts.body);
    if (msg.method !== 'tools/call') return response;
    const result = await response.text();
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('event: message\r\ndata: ' + result + '\r'));
      controller.enqueue(new TextEncoder().encode('\n\r\n'));
    }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } });
  };
  await plugin.provider.fetch({ hirify: { query: 'Go' } }, ctx);
  assert.equal(cancelled, true);
});

test('Hirify health probes sanitize transport bodies and preserve HTTP status', async () => {
  const { ctx } = server(); ctx.maxPages = 1;
  ctx.fetch = async () => { throw Object.assign(new Error('HTTP 401 SECRET_VALUE'), { status: 401 }); };
  await assert.rejects(plugin.provider.fetch({ hirify: { query: 'Go' } }, ctx), error =>
    !error.message.includes('SECRET_VALUE') && error.status === 401);
});
