// Minimal read-only Streamable HTTP client. Transport always uses plugin ctx,
// never an SDK/global fetch. Accept JSON or SSE, including stateful sessions.
// URLs are secrets too: errors never echo endpoint query/path or remote bodies.
const MAX_BYTES = 2 * 1024 * 1024;
const VERSIONS = ['2025-03-26', '2025-06-18', '2024-11-05'];

function endpoint(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('hirify: set HIRIFY_MCP_URL from the MCP/API account page'); }
  if (u.protocol !== 'https:' || !['hirify.me', 'api.hirify.me', 'mcp.hirify.me'].includes(u.hostname)
    || u.port || u.username || u.password || u.hash || /\/account(?:\/|$)/.test(u.pathname)) {
    throw new Error('hirify: MCP endpoint must be an official Hirify HTTPS URL, not the account settings page');
  }
  return u.href;
}

function envelope(raw, id) {
  let msg;
  try { msg = JSON.parse(raw); } catch { throw new Error('hirify: invalid MCP JSON'); }
  if (msg.id !== id) return null; // ignore notifications and unrelated messages
  if (msg.jsonrpc !== '2.0') throw new Error('hirify: invalid MCP response');
  if (msg.error) throw new Error(`hirify: MCP request rejected (code ${Number(msg.error.code) || 'unknown'})`);
  if (!Object.hasOwn(msg, 'result')) throw new Error('hirify: missing MCP result');
  return { value: msg.result };
}

async function readResult(res, id) {
  if (!res.body) throw new Error('hirify: empty MCP response');
  const sse = (res.headers.get('content-type') || '').includes('text/event-stream');
  const reader = res.body.getReader(), decoder = new TextDecoder();
  let buffer = '', bytes = 0, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; reader.cancel().catch(() => {}); }, 15000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('hirify: MCP response exceeds 2 MiB');
      buffer += decoder.decode(value, { stream: true });
      if (sse) {
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
          if (data) { const result = envelope(data, id); if (result) return result.value; }
        }
      }
    }
    if (timedOut) throw new Error('hirify: MCP response timed out');
    buffer += decoder.decode();
    if (!sse) { const result = envelope(buffer, id); if (result) return result.value; }
    throw new Error('hirify: MCP response has no matching result');
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); }
}

export async function connectHirify(ctx) {
  const url = endpoint(ctx.env?.HIRIFY_MCP_URL);
  let session, protocol = VERSIONS[0], nextId = 0;
  async function request(method, params, notification = false) {
    const id = notification ? undefined : ++nextId;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (ctx.env?.HIRIFY_KEY) headers.Authorization = `Bearer ${ctx.env.HIRIFY_KEY}`;
    if (session) headers['Mcp-Session-Id'] = session;
    if (method !== 'initialize') headers['MCP-Protocol-Version'] = protocol;
    const message = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(id === undefined ? {} : { id }) };
    let res;
    try { res = await ctx.fetch(url, { method: 'POST', headers, body: JSON.stringify(message), redirect: 'error', timeoutMs: 15000 }); }
    catch (error) {
      // Probe transport metadata is not permission to echo remote error bodies:
      // servers can reflect a key or a secret endpoint URL in those bodies.
      if (error?.constructor?.name === 'ProbePageBudgetReached') throw error;
      const safe = new Error(`hirify: MCP transport failed${Number.isInteger(error.status) ? ` (HTTP ${error.status})` : ''}; check endpoint and access`);
      if (Number.isInteger(error.status)) safe.status = error.status;
      throw safe;
    }
    if (!res.ok) throw new Error(`hirify: MCP transport failed (HTTP ${res.status})`);
    const receivedSession = res.headers.get('Mcp-Session-Id');
    if (receivedSession) session = receivedSession;
    if (notification) { await res.body?.cancel().catch(() => {}); return; }
    // ctx limits the fetch headers deadline; readResult also bounds and cancels
    // the response reader, including an SSE stream that never closes.
    return readResult(res, id);
  }
  const init = await request('initialize', { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'career-ops', version: '1.0.0' } });
  if (!VERSIONS.includes(init?.protocolVersion) || !init?.capabilities?.tools) throw new Error('hirify: server does not support a compatible MCP tools protocol');
  protocol = init.protocolVersion;
  await request('notifications/initialized', null, true);
  return { request };
}
